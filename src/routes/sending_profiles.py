"""Sending profiles (SMTP relays). CRUD."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from src.auth import PHISH_ROLES, get_current_user, require_admin, require_min_role
from src.database import get_db
from src.mailer import send_via_profile
from src.models import SendingProfile, User
from src.settings_crypto import encrypt_setting_or_plain
from src.schemas import (
    SendingProfileCreate,
    SendingProfileResponse,
    SendingProfileUpdate,
)


class SendingProfileTestRequest(BaseModel):
    to: str
    # Optional override fields — when present we test the unsaved
    # form contents instead of the stored profile. Lets the user
    # validate credentials before saving.
    from_address: str | None = None
    host: str | None = None
    username: str | None = None
    password: str | None = None
    ignore_cert_errors: bool | None = None

router = APIRouter(prefix="/api/sending-profiles", tags=["sending-profiles"])


async def _get_or_404(db: AsyncSession, sp_id: uuid.UUID) -> SendingProfile:
    sp = await db.get(SendingProfile, sp_id)
    if not sp:
        raise HTTPException(status_code=404, detail="sending profile not found")
    return sp


@router.get("", response_model=list[SendingProfileResponse])
async def list_sending_profiles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    rows = (await db.execute(select(SendingProfile).order_by(SendingProfile.name))).scalars().all()
    return list(rows)


@router.post("", response_model=SendingProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_sending_profile(
    body: SendingProfileCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    data = body.model_dump()
    data["password"] = encrypt_setting_or_plain(data.get("password") or "")
    sp = SendingProfile(**data)
    db.add(sp)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(sp)
    return sp


@router.get("/{sp_id}", response_model=SendingProfileResponse)
async def get_sending_profile(
    sp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    return await _get_or_404(db, sp_id)


@router.patch("/{sp_id}", response_model=SendingProfileResponse)
async def update_sending_profile(
    sp_id: uuid.UUID,
    body: SendingProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    sp = await _get_or_404(db, sp_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        # The read schema no longer returns the password, so the edit form
        # re-submits it empty. Treat "" as "leave it alone" — otherwise
        # renaming a profile would silently wipe its SMTP credential.
        if k == "password" and not v:
            continue
        if k == "password":
            v = encrypt_setting_or_plain(v)
        setattr(sp, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(sp)
    return sp


@router.post("/test")
async def test_unsaved_profile(
    body: SendingProfileTestRequest,
    user: User = Depends(get_current_user),
):
    """Send a single test email using inline credentials (no DB row).

    Lets the user validate SMTP credentials *before* saving a profile.
    Requires ``from_address`` and ``host`` in the body.
    """
    require_admin(user)
    if not body.from_address or not body.host:
        raise HTTPException(status_code=422, detail="from_address and host required")
    tmp = SendingProfile(
        name="__test__",
        from_address=body.from_address,
        host=body.host,
        username=body.username or "",
        password=body.password or "",
        ignore_cert_errors=bool(body.ignore_cert_errors),
        headers=[],
    )
    result = await send_via_profile(
        tmp,
        to_address=body.to,
        subject="[Phish] Test SMTP",
        html="<p>Ceci est un email de test envoy&eacute; depuis le module Phish.</p>",
        text="Ceci est un email de test envoye depuis le module Phish.",
    )
    if not result["ok"]:
        return {"ok": False, "error": result["error"]}
    return {"ok": True, "message_id": result["message_id"]}


@router.post("/{sp_id}/test")
async def test_sending_profile(
    sp_id: uuid.UUID,
    body: SendingProfileTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a single test email using the stored profile."""
    require_admin(user)
    sp = await _get_or_404(db, sp_id)
    result = await send_via_profile(
        sp,
        to_address=body.to,
        subject="[Phish] Test SMTP",
        html="<p>Ceci est un email de test envoy&eacute; depuis le module Phish.</p>",
        text="Ceci est un email de test envoye depuis le module Phish.",
    )
    if not result["ok"]:
        return {"ok": False, "error": result["error"]}
    return {"ok": True, "message_id": result["message_id"]}


@router.delete("/{sp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sending_profile(
    sp_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    sp = await _get_or_404(db, sp_id)
    await db.delete(sp)
    await db.commit()
    return None
