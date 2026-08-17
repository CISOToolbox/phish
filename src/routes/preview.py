"""Generic HTML preview for the in-editor preview pane.

Renders unsaved landing-page / email-template HTML so an operator can
switch between the source editor and a rendered view.

Stateless: the posted HTML is echoed back verbatim. It is served from a
real same-origin URL (not srcdoc/blob) so the response keeps its own
relaxed CSP instead of inheriting the admin SPA's strict one — that is
what lets a cloned page's external CSS, fonts and images load. Scripts
still cannot run (script-src 'self'); see the CSP branching in
``src.main`` for the ``/api/preview`` path.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form
from fastapi.responses import HTMLResponse

from src.auth import PHISH_ROLES, get_current_user, require_min_role
from src.models import User

router = APIRouter(prefix="/api", tags=["preview"])


@router.post("/preview", response_class=HTMLResponse)
async def preview_html(
    html: str = Form(default=""),
    user: User = Depends(get_current_user),
):
    require_min_role(user, "editor", PHISH_ROLES)
    return HTMLResponse(
        content=html or "",
        headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"},
    )
