"""Campaigns CRUD + launch/cancel. Send loop in src/campaign_engine.py."""
from __future__ import annotations

import csv
import io
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth import PHISH_ROLES, get_current_user, require_min_role
from src.campaign_engine import apply_report, cancel_campaign, launch_campaign
from src.database import get_db
from src.models import (
    Campaign,
    CampaignStatus,
    Group,
    LandingPage,
    Result,
    SendingProfile,
    Template,
    User,
)
from src.schemas import (
    CampaignCreate,
    CampaignDetail,
    CampaignResponse,
    ManualReportRequest,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


def _aggregate(campaign: Campaign) -> dict:
    """Compute funnel counters from in-memory results."""
    out = {
        "target_count": len(campaign.results),
        "sent_count": 0,
        "opened_count": 0,
        "clicked_count": 0,
        "submitted_count": 0,
        "reported_count": 0,
    }
    for r in campaign.results:
        # Status is monotonic in the happy path but use the timestamp
        # columns so a CLICK after SUBMIT still counts as both opened
        # and clicked.
        if r.send_date:
            out["sent_count"] += 1
        if r.open_date:
            out["opened_count"] += 1
        if r.click_date:
            out["clicked_count"] += 1
        if r.submit_date:
            out["submitted_count"] += 1
        if r.report_date:
            out["reported_count"] += 1
    return out


def _to_response(campaign: Campaign) -> CampaignResponse:
    agg = _aggregate(campaign)
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        sending_profile_id=campaign.sending_profile_id,
        template_id=campaign.template_id,
        landing_page_id=campaign.landing_page_id,
        group_id=campaign.group_id,
        url=campaign.url,
        launch_date=campaign.launch_date,
        send_by_date=campaign.send_by_date,
        completed_date=campaign.completed_date,
        status=campaign.status,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        **agg,
    )


def _to_detail(campaign: Campaign) -> CampaignDetail:
    base = _to_response(campaign).model_dump()
    base["results"] = list(campaign.results)
    base["events"] = list(campaign.events)
    return CampaignDetail(**base)


async def _load(db: AsyncSession, cid: uuid.UUID) -> Campaign | None:
    return (
        await db.execute(
            select(Campaign)
            .options(
                selectinload(Campaign.results),
                selectinload(Campaign.events),
            )
            .where(Campaign.id == cid)
        )
    ).scalar_one_or_none()


@router.get("", response_model=list[CampaignResponse])
async def list_campaigns(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Campaign)
            .options(selectinload(Campaign.results))
            .order_by(Campaign.created_at.desc())
        )
    ).scalars().all()
    return [_to_response(c) for c in rows]


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # FK existence checks — catch typos before we attempt to launch
    require_min_role(user, "editor", PHISH_ROLES)
    for table, fid in (
        (SendingProfile, body.sending_profile_id),
        (Template, body.template_id),
        (LandingPage, body.landing_page_id),
        (Group, body.group_id),
    ):
        if not await db.get(table, fid):
            raise HTTPException(status_code=422, detail=f"{table.__tablename__} {fid} not found")
    c = Campaign(
        name=body.name,
        sending_profile_id=body.sending_profile_id,
        template_id=body.template_id,
        landing_page_id=body.landing_page_id,
        group_id=body.group_id,
        url=body.url or "",
        launch_date=body.launch_date,
        send_by_date=body.send_by_date,
        status=CampaignStatus.QUEUED.value,
    )
    db.add(c)
    await db.commit()
    fresh = await _load(db, c.id)
    return _to_response(fresh)


@router.get("/{cid}", response_model=CampaignDetail)
async def get_campaign(
    cid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = await _load(db, cid)
    if not c:
        raise HTTPException(status_code=404, detail="campaign not found")
    return _to_detail(c)


@router.post("/{cid}/results/{rid}/report", response_model=CampaignResponse)
async def mark_result_reported(
    cid: uuid.UUID,
    rid: uuid.UUID,
    body: ManualReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually flag a target as having reported the phishing email.

    For reports received out-of-band — verbally, a helpdesk ticket, any
    channel the M365 connector does not see. ``body.report_date`` carries
    the operator-supplied moment of the report. ``reported`` is the top
    funnel rank, so this never downgrades an existing status.
    """
    require_min_role(user, "editor", PHISH_ROLES)
    c = await _load(db, cid)
    if not c:
        raise HTTPException(status_code=404, detail="campaign not found")
    result = next((r for r in c.results if r.id == rid), None)
    if not result:
        raise HTTPException(status_code=404, detail="result not found")
    # `user` is None only when authentication is disabled (the sentinel);
    # the audit trail then records the report as unattributed rather than
    # raising AttributeError -> 500.
    actor = user.email if user else ""
    if await apply_report(db, result, source="manual", actor=actor, when=body.report_date):
        await db.commit()
    fresh = await _load(db, c.id)
    return _to_response(fresh)


@router.post("/{cid}/launch", response_model=CampaignResponse)
async def post_launch_campaign(
    cid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    try:
        c = await launch_campaign(db, cid)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    # Note: the response immediately after launch may show stale aggregate
    # counters (target_count=0) because the session identity map still has
    # the pre-snapshot collection. The frontend reloads the list afterwards
    # so the table refreshes; GET /api/campaigns/{id} returns the correct
    # snapshot count.
    fresh = await _load(db, c.id)
    return _to_response(fresh)


@router.post("/{cid}/cancel", response_model=CampaignResponse)
async def post_cancel_campaign(
    cid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    try:
        c = await cancel_campaign(db, cid)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    fresh = await _load(db, c.id)
    return _to_response(fresh)


@router.get("/{cid}/export.csv")
async def export_campaign_csv(
    cid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-target CSV: one row per Result with funnel timestamps.

    UTF-8 with a BOM so Excel detects the encoding on open. We
    deliberately do NOT export submitted form values — they were
    never stored. The per-target Event rows are kept on the audit
    log only.
    """
    require_min_role(user, "editor", PHISH_ROLES)
    c = await _load(db, cid)
    if not c:
        raise HTTPException(status_code=404, detail="campaign not found")

    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    w.writerow([
        "campaign", "email", "first_name", "last_name", "position",
        "status", "send_date", "open_date", "click_date", "submit_date", "report_date",
    ])
    for r in c.results:
        w.writerow([
            c.name,
            r.email,
            r.first_name or "",
            r.last_name or "",
            r.position or "",
            r.status,
            r.send_date.isoformat() if r.send_date else "",
            r.open_date.isoformat() if r.open_date else "",
            r.click_date.isoformat() if r.click_date else "",
            r.submit_date.isoformat() if r.submit_date else "",
            r.report_date.isoformat() if r.report_date else "",
        ])
    # Excel-friendly: UTF-8 BOM
    body = "\ufeff" + buf.getvalue()
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", c.name or "campaign").strip("_") or "campaign"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("/{cid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    cid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    c = await _load(db, cid)
    if not c:
        raise HTTPException(status_code=404, detail="campaign not found")
    await db.delete(c)
    await db.commit()
    return None
