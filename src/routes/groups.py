"""Target groups + per-group CSV bulk import."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth import PHISH_ROLES, get_current_user, require_min_role
from src.database import get_db
from src.models import Group, Target, User
from src.schemas import (
    GroupCreate,
    GroupResponse,
    GroupSummary,
    GroupUpdate,
    TargetsBulkImport,
)

router = APIRouter(prefix="/api/groups", tags=["groups"])


async def _get_or_404(db: AsyncSession, gid: uuid.UUID) -> Group:
    g = (
        await db.execute(
            select(Group).options(selectinload(Group.targets)).where(Group.id == gid)
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="group not found")
    return g


@router.get("", response_model=list[GroupSummary])
async def list_groups(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Group, func.count(Target.id))
            .outerjoin(Target, Target.group_id == Group.id)
            .group_by(Group.id)
            .order_by(Group.name)
        )
    ).all()
    out: list[GroupSummary] = []
    for grp, cnt in rows:
        out.append(
            GroupSummary(
                id=grp.id,
                name=grp.name,
                target_count=int(cnt or 0),
                created_at=grp.created_at,
                updated_at=grp.updated_at,
            )
        )
    return out


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    g = Group(name=body.name)
    db.add(g)
    # Avoid duplicate emails inside the same CSV import: keep the first.
    seen: set[str] = set()
    for t in body.targets:
        e = (t.email or "").strip().lower()
        if not e or e in seen:
            continue
        seen.add(e)
        g.targets.append(Target(**{**t.model_dump(), "email": e}))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    return await _get_or_404(db, g.id)


@router.get("/{gid}", response_model=GroupResponse)
async def get_group(
    gid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, gid)


@router.patch("/{gid}", response_model=GroupResponse)
async def update_group(
    gid: uuid.UUID,
    body: GroupUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    g = await _get_or_404(db, gid)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    return await _get_or_404(db, gid)


@router.delete("/{gid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    gid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    g = await _get_or_404(db, gid)
    await db.delete(g)
    await db.commit()
    return None


# ── targets sub-resource ───────────────────────────────────────────

@router.post("/{gid}/targets", response_model=GroupResponse)
async def bulk_import_targets(
    gid: uuid.UUID,
    body: TargetsBulkImport,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Append (or replace) the group's targets from a parsed CSV.

    Deduplicates on the (group_id, email) unique index — silently skips
    rows already present unless ``replace`` is true.
    """
    require_min_role(user, "editor", PHISH_ROLES)
    g = await _get_or_404(db, gid)
    if body.replace:
        await db.execute(delete(Target).where(Target.group_id == gid))
        await db.flush()
        existing: set[str] = set()
    else:
        existing = {t.email.lower() for t in g.targets}
    for t in body.targets:
        e = (t.email or "").strip().lower()
        if not e or e in existing:
            continue
        existing.add(e)
        db.add(Target(group_id=gid, **{**t.model_dump(), "email": e}))
    await db.commit()
    # Expire the cached group instance so the relationship reload picks
    # up the freshly-inserted (or deleted) Target rows.
    db.expire(g)
    return await _get_or_404(db, gid)


@router.delete("/{gid}/targets/{tid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(
    gid: uuid.UUID,
    tid: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    t = (
        await db.execute(
            select(Target).where(Target.id == tid, Target.group_id == gid)
        )
    ).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="target not found")
    await db.delete(t)
    await db.commit()
    return None
