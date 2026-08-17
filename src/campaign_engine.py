"""Phish — campaign launch + send loop.

Lifecycle
---------

1. ``POST /api/campaigns`` creates the campaign in ``queued`` state.
   Group, template, landing, sending profile and base URL are
   FK-validated but no Result rows are created yet.

2. ``POST /api/campaigns/{id}/launch`` calls :func:`launch_campaign`:
   - flips status to ``in_progress``
   - SNAPSHOTS the source Group.targets into Result rows (so further
     edits to the Group do not retroactively change what was sent)
   - schedules an async fire-and-forget task that loops over the
     freshly-created Result rows, renders + sends, and updates
     status / send_date / writes Event rows.
   - returns immediately to the caller — the loop runs in the
     same FastAPI process via ``asyncio.create_task``.

3. ``POST /api/campaigns/{id}/cancel`` sets status back to
   ``cancelled``; the loop checks this before each send so a long
   campaign can be aborted mid-flight.

Concurrency notes
-----------------

* The send loop opens its OWN AsyncSession via
  :func:`src.database.SessionLocal` — the request-scoped session
  ends when the HTTP handler returns.
* aiosmtplib send is awaited sequentially per Result (one connection
  per email). For a small awareness campaign this is fine; if rate
  limiting matters in the future, throttle here.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.database import async_session as SessionLocal
from src.mailer import send_via_profile
from src.models import (
    Campaign,
    CampaignStatus,
    Event,
    EventType,
    Group,
    LandingPage,
    Result,
    ResultStatus,
    SendingProfile,
    Target,
    Template,
)
from src.templating import render_email

logger = logging.getLogger("phish.engine")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def apply_report(
    db: AsyncSession,
    result: Result,
    *,
    source: str,
    actor: str | None = None,
    when: datetime | None = None,
) -> bool:
    """Mark a Result as having reported the phishing email.

    Idempotent — returns False if it was already reported. ``source`` is
    'manual' (operator), 'm365' (connector) or 'tracker' (public link).
    ``when`` overrides the report timestamp (operator-declared reports);
    defaults to now. ``reported`` is the top funnel rank so it never
    downgrades a status. The caller is responsible for committing.
    """
    if result.report_date:
        return False
    ts = when or _now()
    result.report_date = ts
    result.status = ResultStatus.REPORTED.value
    details: dict = {"source": source}
    if actor:
        details["by"] = actor
    db.add(
        Event(
            campaign_id=result.campaign_id,
            result_id=result.id,
            email=result.email,
            message=EventType.EMAIL_REPORTED.value,
            details=details,
            time=ts,
        )
    )
    return True


async def _snapshot_targets(db: AsyncSession, campaign: Campaign) -> int:
    """Copy Group.targets into Result rows. Returns row count.

    Skips a target if a Result for the same email is already attached
    to this campaign (idempotent against a relaunch attempt).
    """
    grp = (
        await db.execute(
            select(Group).options(selectinload(Group.targets)).where(Group.id == campaign.group_id)
        )
    ).scalar_one()
    existing_emails = {r.email.lower() for r in campaign.results}
    created = 0
    for t in grp.targets:
        e = (t.email or "").strip().lower()
        if not e or e in existing_emails:
            continue
        existing_emails.add(e)
        db.add(
            Result(
                campaign_id=campaign.id,
                email=e,
                first_name=t.first_name or "",
                last_name=t.last_name or "",
                position=t.position or "",
                status=ResultStatus.SCHEDULED.value,
                token=secrets.token_urlsafe(32),
            )
        )
        created += 1
    return created


async def _load_campaign(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign | None:
    return (
        await db.execute(
            select(Campaign)
            .options(
                selectinload(Campaign.results),
                selectinload(Campaign.events),
            )
            .where(Campaign.id == campaign_id)
        )
    ).scalar_one_or_none()


async def launch_campaign(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    """Transition queued → in_progress, snapshot targets, kick off send loop."""
    campaign = await _load_campaign(db, campaign_id)
    if not campaign:
        raise ValueError("campaign not found")
    if campaign.status not in (CampaignStatus.QUEUED.value, CampaignStatus.IN_PROGRESS.value):
        raise ValueError(f"campaign status is {campaign.status}, cannot launch")
    n = await _snapshot_targets(db, campaign)
    campaign.status = CampaignStatus.IN_PROGRESS.value
    campaign.launch_date = campaign.launch_date or _now()
    db.add(
        Event(
            campaign_id=campaign.id,
            message=EventType.CAMPAIGN_CREATED.value,
            details={"targets": n, "launched_at": campaign.launch_date.isoformat()},
        )
    )
    await db.commit()
    asyncio.create_task(_run_campaign(campaign.id))
    return campaign


async def cancel_campaign(db: AsyncSession, campaign_id: uuid.UUID) -> Campaign:
    campaign = await _load_campaign(db, campaign_id)
    if not campaign:
        raise ValueError("campaign not found")
    campaign.status = CampaignStatus.CANCELLED.value
    campaign.completed_date = _now()
    await db.commit()
    return campaign


async def _run_campaign(campaign_id: uuid.UUID) -> None:
    """Background task: iterate scheduled results and send each.

    Uses its own session — the request that triggered the launch has
    already returned by the time this starts.
    """
    async with SessionLocal() as db:
        campaign = (
            await db.execute(
                select(Campaign)
                .options(
                    selectinload(Campaign.results),
                )
                .where(Campaign.id == campaign_id)
            )
        ).scalar_one_or_none()
        if not campaign or campaign.status != CampaignStatus.IN_PROGRESS.value:
            return
        sp = await db.get(SendingProfile, campaign.sending_profile_id)
        tpl = await db.get(Template, campaign.template_id)
        # Landing page is referenced for completeness — actually rendered
        # by the public tracker (P5). We just FK-check it here.
        _ = await db.get(LandingPage, campaign.landing_page_id)
        if not (sp and tpl):
            logger.error("campaign %s missing template or sending profile", campaign_id)
            campaign.status = CampaignStatus.CANCELLED.value
            await db.commit()
            return

        for r in list(campaign.results):
            await db.refresh(campaign)
            if campaign.status != CampaignStatus.IN_PROGRESS.value:
                logger.info("campaign %s no longer in_progress — stopping", campaign_id)
                break
            if r.status != ResultStatus.SCHEDULED.value:
                continue
            r.status = ResultStatus.SENDING.value
            await db.commit()

            subject, html, text = render_email(
                subject_template=tpl.subject,
                html_template=tpl.html,
                text_template=tpl.text,
                first_name=r.first_name,
                last_name=r.last_name,
                email=r.email,
                position=r.position,
                from_address=sp.from_address,
                base_url=campaign.url or "",
                token=r.token,
            )
            sent = await send_via_profile(
                sp,
                to_address=r.email,
                subject=subject,
                html=html,
                text=text,
            )
            now = _now()
            if sent["ok"]:
                r.status = ResultStatus.SENT.value
                r.send_date = now
                db.add(
                    Event(
                        campaign_id=campaign.id,
                        result_id=r.id,
                        email=r.email,
                        message=EventType.EMAIL_SENT.value,
                        details={"message_id": sent["message_id"]},
                    )
                )
            else:
                r.status = ResultStatus.SEND_FAILED.value
                db.add(
                    Event(
                        campaign_id=campaign.id,
                        result_id=r.id,
                        email=r.email,
                        message=EventType.EMAIL_SEND_ERROR.value,
                        details={"error": sent["error"]},
                    )
                )
            await db.commit()

        # Mark complete unless cancelled mid-flight.
        await db.refresh(campaign)
        if campaign.status == CampaignStatus.IN_PROGRESS.value:
            campaign.status = CampaignStatus.COMPLETED.value
            campaign.completed_date = _now()
            await db.commit()
