"""Microsoft 365 reporting connector — settings + manual poll.

See :mod:`src.m365_connector` for the connector itself. Credentials are
stored in ``AppSettings``; the client secret is write-only over the wire
(never returned, only replaced when a non-empty value is sent).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import get_current_user, require_admin
from src.database import get_db
from src.m365_connector import get_config, is_configured, poll_once, set_setting
from src.settings_crypto import encrypt_setting_or_plain
from src.models import User

router = APIRouter(prefix="/api/m365", tags=["m365"])


class M365SettingsUpdate(BaseModel):
    tenant_id: Optional[str] = Field(None, max_length=100)
    client_id: Optional[str] = Field(None, max_length=100)
    client_secret: Optional[str] = Field(None, max_length=500)
    enabled: Optional[bool] = None


def _public(cfg: dict) -> dict:
    """Config view safe to send to the browser — the secret is masked."""
    return {
        "tenant_id": cfg["tenant_id"],
        "client_id": cfg["client_id"],
        "client_secret_set": bool(cfg["client_secret"]),
        "enabled": cfg["enabled"],
        "last_poll": cfg["last_poll"],
        "last_status": cfg["last_status"],
        "configured": is_configured(cfg),
    }


@router.get("/settings")
async def m365_get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return _public(await get_config(db))


@router.put("/settings")
async def m365_update_settings(
    body: M365SettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    data = body.model_dump(exclude_unset=True)
    if data.get("tenant_id") is not None:
        await set_setting(db, "m365_tenant_id", data["tenant_id"].strip())
    if data.get("client_id") is not None:
        await set_setting(db, "m365_client_id", data["client_id"].strip())
    # Secret: overwritten only when a non-empty value is supplied, so the
    # UI can save other fields without re-typing it. Encrypted at rest.
    if data.get("client_secret"):
        await set_setting(
            db, "m365_client_secret",
            encrypt_setting_or_plain(data["client_secret"]),
        )
    if data.get("enabled") is not None:
        await set_setting(db, "m365_enabled", "true" if data["enabled"] else "false")
    await db.commit()
    return _public(await get_config(db))


@router.post("/poll")
async def m365_poll_now(user: User = Depends(get_current_user)):
    """Trigger an immediate poll — bypasses the active-campaign guard."""
    require_admin(user)
    return await poll_once(force=True)
