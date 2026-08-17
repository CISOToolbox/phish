"""Pydantic schemas for Phish. Wire surface only — keep separate from ORM."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ── User ───────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    role: str = "user"
    ai_enabled: str = "false"
    last_login: Optional[datetime] = None
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Admin-side user edit. `role` is the approval switch: a new account is
    created `pending` and stays locked out until an admin moves it up."""
    role: Optional[str] = None
    ai_enabled: Optional[str] = None


# ── Sending profile ────────────────────────────────────────────

class SendingProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    from_address: str = Field(..., min_length=3, max_length=255)
    host: str = Field(..., min_length=3, max_length=255)
    username: str = Field("", max_length=255)
    password: str = Field("", max_length=1024)
    ignore_cert_errors: bool = False
    headers: list[dict[str, str]] = []


class SendingProfileCreate(SendingProfileBase):
    pass


class SendingProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    from_address: Optional[str] = Field(None, min_length=3, max_length=255)
    host: Optional[str] = Field(None, min_length=3, max_length=255)
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, max_length=1024)
    ignore_cert_errors: Optional[bool] = None
    headers: Optional[list[dict[str, str]]] = None


class SendingProfileResponse(BaseModel):
    """Read view of an SMTP relay — deliberately NOT SendingProfileBase.

    Inheriting the base meant `password` was serialised back on every GET, so
    the relay's cleartext SMTP password was handed to any caller who could
    list profiles. The UI only ever needs to know whether one is set.
    """
    id: uuid.UUID
    name: str
    from_address: str
    host: str
    username: str = ""
    ignore_cert_errors: bool = False
    headers: list[dict[str, str]] = []
    password_set: bool = Field(False, validation_alias="password")
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True, "populate_by_name": True}

    @field_validator("password_set", mode="before")
    @classmethod
    def _to_flag(cls, v: Any) -> bool:
        return bool(v)


# ── Template ───────────────────────────────────────────────────

class TemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    subject: str = Field("", max_length=500)
    html: str = ""
    text: str = ""
    attachments: list[dict[str, Any]] = []


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    subject: Optional[str] = Field(None, max_length=500)
    html: Optional[str] = None
    text: Optional[str] = None
    attachments: Optional[list[dict[str, Any]]] = None


class TemplateResponse(TemplateBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Landing page ───────────────────────────────────────────────

class LandingPageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    html: str = ""
    capture_credentials: bool = False
    redirect_url: str = Field("", max_length=500)


class LandingPageCreate(LandingPageBase):
    pass


class LandingPageUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    html: Optional[str] = None
    capture_credentials: Optional[bool] = None
    redirect_url: Optional[str] = Field(None, max_length=500)


class LandingPageResponse(LandingPageBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LandingPageImportRequest(BaseModel):
    """Clone an existing public page into landing-page HTML (Gophish-style
    "Import Site"). The fetch is SSRF-hardened — see ``src.site_import``."""
    url: str = Field(..., min_length=3, max_length=2000)


class LandingPageImportResponse(BaseModel):
    html: str
    source_url: str


# ── Group + target ─────────────────────────────────────────────

class TargetBase(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    first_name: str = Field("", max_length=255)
    last_name: str = Field("", max_length=255)
    position: str = Field("", max_length=255)
    extra: dict[str, Any] = {}


class TargetResponse(TargetBase):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class GroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class GroupCreate(GroupBase):
    targets: list[TargetBase] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class GroupSummary(GroupBase):
    """Light variant — no targets — used for list endpoints."""
    id: uuid.UUID
    target_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class GroupResponse(GroupBase):
    id: uuid.UUID
    targets: list[TargetResponse] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class TargetsBulkImport(BaseModel):
    """CSV bulk import. `replace=True` wipes existing targets first."""
    targets: list[TargetBase]
    replace: bool = False


# ── Campaign ───────────────────────────────────────────────────

class CampaignBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    sending_profile_id: uuid.UUID
    template_id: uuid.UUID
    landing_page_id: uuid.UUID
    group_id: uuid.UUID
    url: str = Field("", max_length=500)
    launch_date: Optional[datetime] = None
    send_by_date: Optional[datetime] = None


class CampaignCreate(CampaignBase):
    pass


class CampaignResponse(CampaignBase):
    id: uuid.UUID
    status: str
    completed_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Aggregate counters — filled by route hand-built.
    target_count: int = 0
    sent_count: int = 0
    opened_count: int = 0
    clicked_count: int = 0
    submitted_count: int = 0
    reported_count: int = 0
    model_config = {"from_attributes": True}


class ResultResponse(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str = ""
    last_name: str = ""
    position: str = ""
    status: str
    send_date: Optional[datetime] = None
    open_date: Optional[datetime] = None
    click_date: Optional[datetime] = None
    submit_date: Optional[datetime] = None
    report_date: Optional[datetime] = None
    model_config = {"from_attributes": True}


class EventResponse(BaseModel):
    id: uuid.UUID
    result_id: Optional[uuid.UUID] = None
    email: str = ""
    message: str
    details: dict[str, Any] = {}
    time: datetime
    model_config = {"from_attributes": True}


class CampaignDetail(CampaignResponse):
    results: list[ResultResponse] = []
    events: list[EventResponse] = []


class ManualReportRequest(BaseModel):
    """Operator-declared report. ``report_date`` is the moment the target
    actually reported (out-of-band); omitted → now."""
    report_date: Optional[datetime] = None
