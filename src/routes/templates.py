"""Email templates. CRUD."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import PHISH_ROLES, get_current_user, require_min_role
from src.database import get_db
from src.models import Template, User
from src.schemas import TemplateCreate, TemplateResponse, TemplateUpdate

router = APIRouter(prefix="/api/templates", tags=["templates"])


async def _get_or_404(db: AsyncSession, tpl_id: uuid.UUID) -> Template:
    tpl = await db.get(Template, tpl_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")
    return tpl


@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Template).order_by(Template.name))).scalars().all()
    return list(rows)


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    tpl = Template(**body.model_dump())
    db.add(tpl)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(tpl)
    return tpl


@router.get("/{tpl_id}", response_model=TemplateResponse)
async def get_template(
    tpl_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, tpl_id)


@router.patch("/{tpl_id}", response_model=TemplateResponse)
async def update_template(
    tpl_id: uuid.UUID,
    body: TemplateUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    tpl = await _get_or_404(db, tpl_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tpl, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="name already exists")
    await db.refresh(tpl)
    return tpl


@router.delete("/{tpl_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    tpl_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    tpl = await _get_or_404(db, tpl_id)
    await db.delete(tpl)
    await db.commit()
    return None
