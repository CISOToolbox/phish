"""Phish — public tracking endpoints.

These routes are **unauthenticated** on purpose: targets clicking links
in awareness e-mails cannot present a session cookie. The only identifier
is the per-target opaque token (``Result.token``, 32 random bytes ~ 43
URL-safe characters) embedded in the tracking URLs.

URL layout (matches what :mod:`src.templating` produces):

* ``GET  /track/{token}.png``     — 1×1 transparent GIF, marks ``open``
* ``GET  /track/{token}``         — serves the rendered landing page HTML,
                                    marks ``click``
* ``POST /track/{token}/submit``  — counts form fields **without** storing
                                    their values, marks ``submit``,
                                    redirects to the landing's
                                    ``redirect_url`` if set
* ``POST /track/{token}/report``  — marks ``report`` (target self-reports
                                    the message as phishing)

Status escalation is monotonic by funnel rank — a late pixel hit that
arrives after a click does not downgrade the status, but ``reported``
always wins (highest rank).

**Privacy contract** (security-awareness use case): the submit endpoint
records ``{name, length}`` per form field. The submitted **values** are
discarded before the request handler returns. There is no Result column
that could hold them and no Event-detail field accepts them. Any JSON
payload that contains keys other than ``field_names`` / ``field_lengths``
is rejected with 400 so an attacker can't smuggle plaintext through.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models import (
    Campaign,
    Event,
    EventType,
    LandingPage,
    Result,
    ResultStatus,
)
from src.templating import render

router = APIRouter(prefix="/track", tags=["tracking"])


# Smallest possible transparent GIF (43 bytes). Used as the open-tracking
# pixel — supported by every mail client including those that block PNG.
_PIXEL_GIF = bytes.fromhex(
    "47494638396101000100800000"
    "ffffff00000021f90401000000"
    "002c00000000010001000002024401003b"
)


# Funnel rank for monotonic status updates. ``reported`` is at the top
# because a target reporting a phishing simulation is the desired
# end-state and we never want a stray pixel hit to overwrite it.
_STATUS_RANK = {
    ResultStatus.SCHEDULED.value:   0,
    ResultStatus.SENDING.value:     1,
    ResultStatus.SENT.value:        2,
    ResultStatus.SEND_FAILED.value: 2,
    ResultStatus.OPENED.value:      3,
    ResultStatus.CLICKED.value:     4,
    ResultStatus.SUBMITTED.value:   5,
    ResultStatus.REPORTED.value:    6,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_redirect(url: str) -> str:
    """A landing page's post-submit redirect is operator-configured and can
    legitimately point off-site (an awareness-training page), so we cannot
    require same-origin. But we MUST reject non-web schemes — `javascript:`,
    `data:` — which would turn this public endpoint into an XSS / scheme
    redirect vector. Anything but http(s) collapses to "no redirect"."""
    u = (url or "").strip()
    if u[:7].lower() == "http://" or u[:8].lower() == "https://":
        return u
    return ""


def _escalate(current: str, new: str) -> str:
    return new if _STATUS_RANK.get(new, 0) > _STATUS_RANK.get(current, 0) else current


async def _load_result(db: AsyncSession, token: str) -> Result | None:
    return (
        await db.execute(select(Result).where(Result.token == token))
    ).scalar_one_or_none()


# ── Open pixel ─────────────────────────────────────────────────────

@router.get("/{token}.png")
async def track_open(token: str, db: AsyncSession = Depends(get_db)):
    """Serve a 1×1 pixel and (idempotently) record the first open."""
    r = await _load_result(db, token)
    if r and not r.open_date:
        r.open_date = _now()
        r.status = _escalate(r.status, ResultStatus.OPENED.value)
        db.add(Event(
            campaign_id=r.campaign_id,
            result_id=r.id,
            email=r.email,
            message=EventType.EMAIL_OPENED.value,
            details={},
        ))
        await db.commit()
    # Always return the pixel — even on unknown token — so a probing
    # attacker can't distinguish valid vs invalid rids by the response.
    return Response(
        content=_PIXEL_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


# ── Landing-page click ─────────────────────────────────────────────

_THANKS_PAGE = (
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<title>Sensibilisation</title>"
    "<style>body{font-family:system-ui;max-width:560px;margin:80px auto;"
    "padding:0 24px;color:#111827;line-height:1.5}h1{color:#059669}</style>"
    "</head><body>"
    "<h1>Merci.</h1>"
    "<p>Cette page faisait partie d'une campagne interne de sensibilisation "
    "à l'hameçonnage. <strong>Aucune donnée saisie n'a été enregistrée</strong> — "
    "seuls le nombre et la longueur des champs ont été comptabilisés à des "
    "fins de mesure.</p>"
    "<p>Si vous avez saisi un mot de passe sur cette page, par précaution "
    "il est recommandé de le changer.</p>"
    "</body></html>"
)


@router.get("/{token}", response_class=HTMLResponse)
async def track_click(token: str, db: AsyncSession = Depends(get_db)):
    """Serve the rendered landing page and record the first click."""
    r = await _load_result(db, token)
    if not r:
        # 404 on click is fine — unlike the pixel, a real target with a
        # valid rid will always succeed; a bogus rid is just a probe.
        raise HTTPException(status_code=404, detail="not found")

    campaign = await db.get(Campaign, r.campaign_id)
    lp = await db.get(LandingPage, campaign.landing_page_id) if campaign else None
    if not lp or campaign is None:
        raise HTTPException(status_code=404, detail="landing not found")

    if not r.click_date:
        r.click_date = _now()
        r.status = _escalate(r.status, ResultStatus.CLICKED.value)
        db.add(Event(
            campaign_id=r.campaign_id,
            result_id=r.id,
            email=r.email,
            message=EventType.CLICKED_LINK.value,
            details={},
        ))
        await db.commit()

    base = campaign.url or ""
    html = render(
        lp.html or "",
        first_name=r.first_name,
        last_name=r.last_name,
        email=r.email,
        position=r.position,
        base_url=base,
        token=token,
    )
    # Extra placeholder specific to landing pages — the submit endpoint URL
    # so authors can write <form action="{{.SubmitURL}}" method="POST">.
    submit_url = f"{base.rstrip('/')}/track/{token}/submit"
    html = html.replace("{{.SubmitURL}}", submit_url)

    return HTMLResponse(
        content=html or _THANKS_PAGE,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


# ── Form submit (NO password storage) ──────────────────────────────

_MAX_FIELDS = 50
_MAX_NAME_LEN = 100


def _summarise_fields(names: list[str], lengths: list[int]) -> list[dict]:
    """Return ``[{name, length}]`` capped to _MAX_FIELDS, name truncated.

    This is the ONLY representation of the form submission we ever
    persist. Values are deliberately discarded before this function is
    called.
    """
    out = []
    for n, l in zip(names[:_MAX_FIELDS], lengths[:_MAX_FIELDS]):
        out.append({
            "name": str(n)[:_MAX_NAME_LEN],
            "length": int(l) if isinstance(l, int) or (isinstance(l, str) and l.isdigit()) else 0,
        })
    return out


@router.post("/{token}/submit")
async def track_submit(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Count form fields without persisting their values.

    Supports two content types:
    * ``application/x-www-form-urlencoded`` / ``multipart/form-data`` —
      native HTML form submit. Field names come from the form keys,
      lengths from ``len(str(value))``. Values are then dropped.
    * ``application/json`` — only the exact shape
      ``{"field_names": [...], "field_lengths": [...]}`` is accepted.
      Any other key triggers 400 so an attacker can't smuggle a
      ``values`` array past the no-storage guarantee.
    """
    r = await _load_result(db, token)
    if not r:
        raise HTTPException(status_code=404, detail="not found")

    content_type = (request.headers.get("content-type") or "").lower()
    field_names: list[str] = []
    field_lengths: list[int] = []

    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="invalid json")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="expected object body")
        allowed = {"field_names", "field_lengths"}
        extra = set(payload.keys()) - allowed
        if extra:
            # Defence-in-depth: anything beyond the expected shape is rejected
            # so the API contract enforces "no values stored" at the wire layer.
            raise HTTPException(
                status_code=400,
                detail=f"unexpected keys: {sorted(extra)} (only field_names / field_lengths permitted)",
            )
        raw_names = payload.get("field_names") or []
        raw_lengths = payload.get("field_lengths") or []
        if not isinstance(raw_names, list) or not isinstance(raw_lengths, list):
            raise HTTPException(status_code=400, detail="field_names / field_lengths must be arrays")
        field_names = [str(n) for n in raw_names]
        field_lengths = [int(l) if isinstance(l, (int, float)) else 0 for l in raw_lengths]
    else:
        # Native HTML form submit. We touch the raw values only long
        # enough to compute their length, then they go out of scope.
        try:
            form = await request.form()
        except Exception:
            raise HTTPException(status_code=400, detail="invalid form body")
        for k, v in form.multi_items():
            field_names.append(str(k))
            try:
                field_lengths.append(len(str(v)))
            except Exception:
                field_lengths.append(0)
        # `form` goes out of scope here; no `request.body()` is kept.

    fields = _summarise_fields(field_names, field_lengths)

    if not r.submit_date:
        r.submit_date = _now()
        r.status = _escalate(r.status, ResultStatus.SUBMITTED.value)
        db.add(Event(
            campaign_id=r.campaign_id,
            result_id=r.id,
            email=r.email,
            message=EventType.SUBMITTED_DATA.value,
            details={"fields": fields, "field_count": len(fields)},
        ))
        await db.commit()

    campaign = await db.get(Campaign, r.campaign_id)
    lp = await db.get(LandingPage, campaign.landing_page_id) if campaign else None
    redirect_url = _safe_redirect(lp.redirect_url if lp and lp.redirect_url else "")

    if "application/json" in content_type:
        return {"ok": True, "redirect_url": redirect_url}

    if redirect_url:
        return RedirectResponse(url=redirect_url, status_code=303)
    return HTMLResponse(_THANKS_PAGE, status_code=200, headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    })


# ── Self-report ────────────────────────────────────────────────────

@router.post("/{token}/report")
async def track_report(token: str, db: AsyncSession = Depends(get_db)):
    """Target self-reports the message as phishing.

    ``reported`` is the highest funnel rank — once set, no subsequent
    event downgrades the status.
    """
    r = await _load_result(db, token)
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    if not r.report_date:
        r.report_date = _now()
        r.status = ResultStatus.REPORTED.value
        db.add(Event(
            campaign_id=r.campaign_id,
            result_id=r.id,
            email=r.email,
            message=EventType.EMAIL_REPORTED.value,
            details={},
        ))
        await db.commit()
    return {"ok": True}
