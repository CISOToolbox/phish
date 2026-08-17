"""Phish — read-only dashboard analytics.

Aggregates funnel counters and event timelines from data already
captured by the campaign engine and the public tracking routes. No
new data is collected here — every column read by this module is
populated elsewhere in the system.

Endpoint:

* ``GET /api/dashboard/overview`` — returns a single JSON blob with:
    - global counters (campaigns, targets, funnel totals)
    - rate ratios (open/click/submit/report rate)
    - 30-day timeline (events per day, grouped by funnel stage)
    - top-10 most-clicked targets (awareness follow-up signal)
    - 5 most recent campaigns with their funnel snapshot

The funnel ratios use ``sent`` (rather than ``target_count``) as the
denominator — a target that was never sent to cannot contribute to
the open/click/submit funnel, so dividing by total targets would
under-report performance on partially-completed campaigns.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import get_current_user
from src.database import get_db
from src.models import (
    Campaign,
    CampaignStatus,
    Event,
    EventType,
    Result,
    User,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _pct(num: int, denom: int) -> float:
    if not denom:
        return 0.0
    return round((num / denom) * 100.0, 1)


@router.get("/overview")
async def overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # ── Global campaign counters ────────────────────────────────
    status_rows = (
        await db.execute(
            select(Campaign.status, func.count(Campaign.id)).group_by(Campaign.status)
        )
    ).all()
    by_status = {s: c for s, c in status_rows}
    campaigns_total = sum(by_status.values())
    campaigns_active = by_status.get(CampaignStatus.IN_PROGRESS.value, 0) + by_status.get(CampaignStatus.QUEUED.value, 0)
    campaigns_completed = by_status.get(CampaignStatus.COMPLETED.value, 0)

    # ── Global funnel (count non-null timestamp columns) ────────
    # SQLite has no easy COUNT(col) FILTER WHERE, so we sum case
    # expressions. Works identically on PG.
    funnel_row = (
        await db.execute(
            select(
                func.count(Result.id).label("targets"),
                func.sum(func.iif(Result.send_date.is_not(None), 1, 0)).label("sent"),
                func.sum(func.iif(Result.open_date.is_not(None), 1, 0)).label("opened"),
                func.sum(func.iif(Result.click_date.is_not(None), 1, 0)).label("clicked"),
                func.sum(func.iif(Result.submit_date.is_not(None), 1, 0)).label("submitted"),
                func.sum(func.iif(Result.report_date.is_not(None), 1, 0)).label("reported"),
            )
        )
    ).one()
    targets = int(funnel_row.targets or 0)
    sent = int(funnel_row.sent or 0)
    opened = int(funnel_row.opened or 0)
    clicked = int(funnel_row.clicked or 0)
    submitted = int(funnel_row.submitted or 0)
    reported = int(funnel_row.reported or 0)

    funnel = {
        "targets": targets,
        "sent": sent,
        "opened": opened,
        "clicked": clicked,
        "submitted": submitted,
        "reported": reported,
    }
    rates = {
        # Denominator is "sent" — a target never reached can't open.
        "open_rate": _pct(opened, sent),
        "click_rate": _pct(clicked, sent),
        "submit_rate": _pct(submitted, sent),
        "report_rate": _pct(reported, sent),
    }

    # ── 30-day timeline of events, grouped by funnel stage ──────
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    timeline_rows = (
        await db.execute(
            select(
                func.strftime("%Y-%m-%d", Event.time).label("day"),
                Event.message,
                func.count(Event.id).label("n"),
            )
            .where(Event.time >= cutoff)
            .group_by("day", Event.message)
            .order_by("day")
        )
    ).all()
    # Shape: {day: {message: n}}
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for day, msg, n in timeline_rows:
        buckets[day][msg] = int(n)
    # Backfill 30 days of empty buckets for a stable x-axis
    timeline = []
    today = datetime.now(timezone.utc).date()
    for offset in range(29, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        b = buckets.get(d, {})
        timeline.append({
            "day": d,
            "sent": b.get(EventType.EMAIL_SENT.value, 0),
            "opened": b.get(EventType.EMAIL_OPENED.value, 0),
            "clicked": b.get(EventType.CLICKED_LINK.value, 0),
            "submitted": b.get(EventType.SUBMITTED_DATA.value, 0),
            "reported": b.get(EventType.EMAIL_REPORTED.value, 0),
        })

    # ── Top targets by click count (awareness follow-up list) ──
    # Same email can appear across multiple campaigns; we sum
    # clicks per email so a repeat-clicker rises to the top.
    top_rows = (
        await db.execute(
            select(
                Result.email,
                func.count(Result.id).label("campaigns"),
                func.sum(func.iif(Result.click_date.is_not(None), 1, 0)).label("clicked"),
                func.sum(func.iif(Result.submit_date.is_not(None), 1, 0)).label("submitted"),
                func.sum(func.iif(Result.report_date.is_not(None), 1, 0)).label("reported"),
            )
            .group_by(Result.email)
            .order_by(func.sum(func.iif(Result.click_date.is_not(None), 1, 0)).desc())
            .limit(10)
        )
    ).all()
    top_targets = [
        {
            "email": r.email,
            "campaigns": int(r.campaigns or 0),
            "clicked": int(r.clicked or 0),
            "submitted": int(r.submitted or 0),
            "reported": int(r.reported or 0),
        }
        for r in top_rows
        if int(r.clicked or 0) > 0
    ]

    # ── 5 most recent campaigns with their funnel ──────────────
    recent = (
        await db.execute(
            select(Campaign).order_by(Campaign.created_at.desc()).limit(5)
        )
    ).scalars().all()
    recent_out = []
    for c in recent:
        agg_row = (
            await db.execute(
                select(
                    func.count(Result.id).label("targets"),
                    func.sum(func.iif(Result.send_date.is_not(None), 1, 0)).label("sent"),
                    func.sum(func.iif(Result.open_date.is_not(None), 1, 0)).label("opened"),
                    func.sum(func.iif(Result.click_date.is_not(None), 1, 0)).label("clicked"),
                    func.sum(func.iif(Result.submit_date.is_not(None), 1, 0)).label("submitted"),
                    func.sum(func.iif(Result.report_date.is_not(None), 1, 0)).label("reported"),
                ).where(Result.campaign_id == c.id)
            )
        ).one()
        c_targets = int(agg_row.targets or 0)
        c_sent = int(agg_row.sent or 0)
        c_clicked = int(agg_row.clicked or 0)
        recent_out.append({
            "id": str(c.id),
            "name": c.name,
            "status": c.status,
            "launch_date": c.launch_date.isoformat() if c.launch_date else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "targets": c_targets,
            "sent": c_sent,
            "opened": int(agg_row.opened or 0),
            "clicked": c_clicked,
            "submitted": int(agg_row.submitted or 0),
            "reported": int(agg_row.reported or 0),
            "click_rate": _pct(c_clicked, c_sent),
        })

    return {
        "campaigns": {
            "total": campaigns_total,
            "active": campaigns_active,
            "completed": campaigns_completed,
        },
        "funnel": funnel,
        "rates": rates,
        "timeline": timeline,
        "top_targets": top_targets,
        "recent_campaigns": recent_out,
    }
