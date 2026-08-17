"""Landing pages. CRUD.

Reminder: ``capture_credentials`` only controls whether the rendered HTML
exposes a submit endpoint. The backend NEVER stores submitted values —
the public tracker (P5) records field NAMES and value LENGTHS in
``Event.details`` only.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import PHISH_ROLES, get_current_user, require_min_role
from src.database import get_db
from src.models import LandingPage, User
from src.schemas import (
    LandingPageCreate,
    LandingPageImportRequest,
    LandingPageImportResponse,
    LandingPageResponse,
    LandingPageUpdate,
)
from src.site_import import SiteImportError, render_site_html

router = APIRouter(prefix="/api/landing-pages", tags=["landing-pages"])


async def _get_or_404(db: AsyncSession, lp_id: uuid.UUID) -> LandingPage:
    lp = await db.get(LandingPage, lp_id)
    if not lp:
        raise HTTPException(status_code=404, detail="landing page not found")
    return lp


@router.get("", response_model=list[LandingPageResponse])
async def list_landing_pages(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(LandingPage).order_by(LandingPage.name))).scalars().all()
    return list(rows)


@router.post("", response_model=LandingPageResponse, status_code=status.HTTP_201_CREATED)
async def create_landing_page(
    body: LandingPageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    lp = LandingPage(**body.model_dump())
    db.add(lp)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(lp)
    return lp


@router.post("/import-site", response_model=LandingPageImportResponse)
async def import_site(
    body: LandingPageImportRequest,
    user: User = Depends(get_current_user),
):
    """Clone an existing public page and return its HTML for use as a
    landing page — authorised awareness-simulation use only.

    The page is rendered in headless Chromium so JavaScript-built login
    pages (Microsoft, Google, …) are captured too. Nothing is persisted:
    the operator reviews and adapts the HTML in the editor before saving.
    The render is SSRF-hardened (see ``src.site_import``); unsafe or
    unreachable URLs return 400.
    """
    require_min_role(user, "editor", PHISH_ROLES)
    try:
        final_url, html = await render_site_html(body.url)
    except SiteImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return LandingPageImportResponse(html=html, source_url=final_url)


@router.get("/{lp_id}", response_model=LandingPageResponse)
async def get_landing_page(
    lp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, lp_id)


@router.patch("/{lp_id}", response_model=LandingPageResponse)
async def update_landing_page(
    lp_id: uuid.UUID,
    body: LandingPageUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    lp = await _get_or_404(db, lp_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lp, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(lp)
    return lp


@router.delete("/{lp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_landing_page(
    lp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    lp = await _get_or_404(db, lp_id)
    await db.delete(lp)
    await db.commit()
    return None
