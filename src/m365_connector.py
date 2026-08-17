"""Phish — Microsoft 365 reporting connector (Defender Threat Submissions).

Detects when a target reports a simulated phishing email through
Outlook's "Report Phishing" button.

When the organisation's *user-reported settings* (Defender portal) send
reported messages to Microsoft — the default — each user report becomes
an **email threat submission**. This connector reads those submissions
through the Microsoft Graph **Threat Submission API**
(``/security/threatSubmission/emailThreats``) and marks the matching
Result as reported. No mailbox access, no ``Mail.Read``.

Auth: OAuth2 client-credentials (app-only). The Azure AD app needs the
``ThreatSubmission.Read.All`` *application* permission with admin
consent.

Matching is **exact**: every email Phish sends carries a unique
``Message-ID`` (``mailer.py``), stored on the ``email_sent`` event. A
submission is linked to a target only when its ``internetMessageId``
equals one of those — no false positives. Reports made through any other
channel are entered with the manual "Report" button.

Config lives in ``AppSettings`` (``m365_*`` keys), edited from the
Settings panel. :func:`poll_loop` runs every 5 minutes but only does
work while at least one campaign is ``in_progress``.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select

from src.campaign_engine import apply_report
from src.database import async_session as SessionLocal
from src.models import AppSettings, Campaign, CampaignStatus, Event, EventType, Result
from src.settings_crypto import decrypt_setting, encrypt_setting_or_plain

logger = logging.getLogger("phish.m365")

POLL_INTERVAL_S = 300            # 5 minutes
GRAPH = "https://graph.microsoft.com/v1.0"
_HTTP_TIMEOUT = 20.0
_MAX_SUBMISSIONS = 150
_REQUIRED = ("tenant_id", "client_id", "client_secret")


class M365Error(Exception):
    """Connector failure — message is safe to show the operator."""


# ── AppSettings (key/value) persistence ────────────────────────────

async def get_setting(db, key: str, default: str = "") -> str:
    row = (
        await db.execute(select(AppSettings).where(AppSettings.key == key))
    ).scalar_one_or_none()
    return row.value if row else default


async def set_setting(db, key: str, value: str) -> None:
    row = (
        await db.execute(select(AppSettings).where(AppSettings.key == key))
    ).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=key, value=value))


async def get_config(db) -> dict:
    return {
        "tenant_id": await get_setting(db, "m365_tenant_id"),
        "client_id": await get_setting(db, "m365_client_id"),
        # Encrypted at rest; decrypt_setting returns not-yet-migrated cleartext
        # rows unchanged. _public() only reads the truthiness of this, so it is
        # safe to decrypt here for both consumers.
        "client_secret": decrypt_setting(await get_setting(db, "m365_client_secret")),
        "enabled": (await get_setting(db, "m365_enabled")) == "true",
        "last_poll": await get_setting(db, "m365_last_poll"),
        "last_status": await get_setting(db, "m365_last_status"),
    }


def is_configured(cfg: dict) -> bool:
    return all(cfg.get(k) for k in _REQUIRED)


# ── Microsoft Graph ────────────────────────────────────────────────

async def _graph_token(cfg: dict) -> str:
    url = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token"
    data = {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            r = await client.post(url, data=data)
        except httpx.HTTPError as exc:
            raise M365Error("Cannot reach the Microsoft login endpoint") from exc
    if r.status_code != 200:
        raise M365Error(f"OAuth token request failed (HTTP {r.status_code})")
    tok = (r.json() or {}).get("access_token")
    if not tok:
        raise M365Error("OAuth response carried no access token")
    return tok


async def _fetch_submissions(client: httpx.AsyncClient, token: str) -> list[dict]:
    """Return recent email threat submissions (user + admin reported)."""
    url = f"{GRAPH}/security/threatSubmission/emailThreats?$top={_MAX_SUBMISSIONS}"
    try:
        r = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise M365Error("Microsoft Graph is unreachable") from exc
    if r.status_code != 200:
        raise M365Error(f"Threat-submission query failed (HTTP {r.status_code})")
    return (r.json() or {}).get("value", []) or []


# ── Polling ────────────────────────────────────────────────────────

async def poll_once(*, force: bool = False) -> dict:
    """Run one polling cycle. ``force`` bypasses the active-campaign
    guard (used by the manual "check now" button). Returns a summary."""
    async with SessionLocal() as db:
        cfg = await get_config(db)
        if not cfg["enabled"]:
            return {"ok": False, "reason": "connector disabled"}
        if not is_configured(cfg):
            return {"ok": False, "reason": "connector not configured"}
        if not force:
            active = (
                await db.execute(
                    select(func.count())
                    .select_from(Campaign)
                    .where(Campaign.status == CampaignStatus.IN_PROGRESS.value)
                )
            ).scalar() or 0
            if not active:
                return {"ok": True, "matched": 0, "skipped": "no active campaign"}

        started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            token = await _graph_token(cfg)
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                submissions = await _fetch_submissions(client, token)

            # Map every sent email's Message-ID back to its target.
            sent_events = (
                await db.execute(
                    select(Event).where(Event.message == EventType.EMAIL_SENT.value)
                )
            ).scalars().all()
            mid_to_result: dict[str, object] = {}
            for ev in sent_events:
                mid = (ev.details or {}).get("message_id")
                if mid and ev.result_id:
                    mid_to_result[mid] = ev.result_id

            matched = 0
            for sub in submissions:
                imid = sub.get("internetMessageId")
                rid = mid_to_result.get(imid) if imid else None
                if not rid:
                    continue
                result = await db.get(Result, rid)
                if result and await apply_report(db, result, source="m365"):
                    matched += 1
            await db.commit()

            status = f"OK — {len(submissions)} submission(s), {matched} report(s) matched"
            await set_setting(db, "m365_last_poll", started)
            await set_setting(db, "m365_last_status", status)
            await db.commit()
            return {"ok": True, "matched": matched, "submissions": len(submissions)}
        except M365Error as exc:
            await db.rollback()
            await set_setting(db, "m365_last_status", f"Error: {exc}")
            await db.commit()
            return {"ok": False, "reason": str(exc)}


async def poll_loop() -> None:
    """Background task — poll every ``POLL_INTERVAL_S``. Started at app
    startup; harmless while the connector is disabled (``poll_once``
    returns early)."""
    logger.info("M365 connector poll loop started (interval %ss)", POLL_INTERVAL_S)
    while True:
        try:
            await asyncio.sleep(POLL_INTERVAL_S)
            res = await poll_once()
            if res.get("matched"):
                logger.info("M365 poll matched %s report(s)", res["matched"])
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("M365 poll loop iteration failed")
