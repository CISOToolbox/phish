"""Admin-side user directory.

Exists because standalone provisioning parks every account past the first as
`pending` (see `routes/auth.py:_upsert_user`). Without a way to promote them,
that gate would be a permanent lockout rather than an approval workflow.

Every route here is admin-only.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import PHISH_ROLES, get_current_user, require_admin
from src.database import get_db
from src.models import User
from src.schemas import UserResponse, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

# "pending" is a valid target too: it is how an admin suspends an account
# without deleting it (and its history of launched campaigns).
ASSIGNABLE_ROLES = frozenset(PHISH_ROLES) | {"pending"}


@router.get("", response_model=list[UserResponse])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None:
        if body.role not in ASSIGNABLE_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        # Demoting the last admin locks the whole module out — nobody left to
        # approve a pending account or fix the mistake.
        if target.role == "admin" and body.role != "admin":
            admins = await db.execute(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            if (admins.scalar() or 0) <= 1:
                raise HTTPException(
                    status_code=409,
                    detail="Refusing to demote the last administrator",
                )
        target.role = body.role
    if body.ai_enabled is not None:
        target.ai_enabled = body.ai_enabled

    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_admin(user)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin":
        admins = await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin")
        )
        if (admins.scalar() or 0) <= 1:
            raise HTTPException(
                status_code=409,
                detail="Refusing to delete the last administrator",
            )
    await db.delete(target)
    await db.commit()
