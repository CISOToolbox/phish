"""SQLAlchemy ORM models for Phish.

Schema ported from Gophish (https://github.com/gophish/gophish) but adapted
to async SQLAlchemy 2.0 on **SQLite** (file-based, no separate DB service).

Key design decisions vs Gophish:

* ``Result.submitted_payload`` does NOT exist. Phish never stores the
  values that targets type into a fake login form. The ``submitted_data``
  event only logs the SHAPE of the submission (field names + value
  lengths). This is a deliberate defensive choice: a security-awareness
  tool must not double as a credential collection database.
* All timestamps are timezone-aware UTC. Gophish stores naive local time.
* JSON columns everywhere we'd otherwise model a sub-entity (Template
  attachments, SendingProfile headers, Group target extra, Event
  details). SQLAlchemy's portable ``JSON`` type maps to TEXT-as-JSON1
  in SQLite and JSONB in PostgreSQL, so the schema is engine-agnostic.
* UUIDs are stored as ``TEXT(36)``. SQLAlchemy ``Uuid(as_uuid=True,
  native_uuid=False)`` keeps Python-side typing while remaining
  portable.
* Server-side defaults (``gen_random_uuid()``, ``NOW()``) are
  intentionally absent — Python-side defaults handle both engines.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _uuid_col(**kw):
    """Portable UUID column: stored as 36-char TEXT, Python uuid.UUID at the ORM layer."""
    return Column(Uuid(as_uuid=True, native_uuid=False), default=uuid.uuid4, **kw)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ── Status enums ───────────────────────────────────────────────────

class CampaignStatus(str, Enum):
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ResultStatus(str, Enum):
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    SEND_FAILED = "send_failed"
    OPENED = "opened"
    CLICKED = "clicked"
    SUBMITTED = "submitted"
    REPORTED = "reported"


class EventType(str, Enum):
    CAMPAIGN_CREATED = "campaign_created"
    EMAIL_SENT = "email_sent"
    EMAIL_SEND_ERROR = "email_send_error"
    EMAIL_OPENED = "email_opened"
    CLICKED_LINK = "clicked_link"
    SUBMITTED_DATA = "submitted_data"
    EMAIL_REPORTED = "email_reported"


# ── Auth & Settings (mirror of shared schema) ──────────────────────

class User(Base):
    __tablename__ = "users"
    id = _uuid_col(primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=True)
    picture = Column(String(500), nullable=True)
    provider = Column(String(50), nullable=False)
    provider_id = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="user")
    ai_enabled = Column(String(5), nullable=False, default="false")
    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)


class AppSettings(Base):
    __tablename__ = "app_settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")


# ── Sending profiles (SMTP relay configurations) ───────────────────

class SendingProfile(Base):
    """SMTP relay used to send campaign emails.

    Stored as plaintext in the same trust boundary as the rest of the
    module (single-tenant Docker). For a hardened deployment, point
    ``host`` at an internal-only relay that owns its own credential
    rotation rather than embedding long-lived passwords here.
    """
    __tablename__ = "sending_profiles"

    id = _uuid_col(primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    from_address = Column(String(255), nullable=False)  # "Display Name <addr@example.com>"
    host = Column(String(255), nullable=False)          # "smtp.example.com:587"
    username = Column(String(255), nullable=True, default="")
    password = Column(Text, nullable=True, default="")
    ignore_cert_errors = Column(Boolean, nullable=False, default=False)
    # Extra SMTP headers stored as JSON list of {key, value} objects.
    headers = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False)


# ── Email templates ────────────────────────────────────────────────

class Template(Base):
    """Email body template rendered with Jinja2 sandbox.

    Supported placeholders (Gophish compatible):
      ``{{.FirstName}}``, ``{{.LastName}}``, ``{{.Email}}``,
      ``{{.Position}}``, ``{{.URL}}``, ``{{.TrackingURL}}``,
      ``{{.From}}``, ``{{.RId}}`` (the per-target token).
    """
    __tablename__ = "templates"

    id = _uuid_col(primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    subject = Column(String(500), nullable=False, default="")
    html = Column(Text, nullable=False, default="")
    text = Column(Text, nullable=False, default="")
    # Attachments stored as JSON list of {name, content_type, content_b64}.
    attachments = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False)


# ── Landing pages ──────────────────────────────────────────────────

class LandingPage(Base):
    """HTML page served when a target clicks the tracked link.

    ``capture_credentials`` only controls whether the page exposes a
    submit endpoint to the frontend. Even when true, the backend NEVER
    stores submitted values — see ``Event.details`` for the shape of
    what is actually recorded.
    """
    __tablename__ = "landing_pages"

    id = _uuid_col(primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    html = Column(Text, nullable=False, default="")
    capture_credentials = Column(Boolean, nullable=False, default=False)
    redirect_url = Column(String(500), nullable=True, default="")
    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False)


# ── Target groups ──────────────────────────────────────────────────

class Group(Base):
    __tablename__ = "groups"

    id = _uuid_col(primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False)

    targets = relationship("Target", back_populates="group", cascade="all, delete-orphan")


class Target(Base):
    __tablename__ = "targets"

    id = _uuid_col(primary_key=True)
    group_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    first_name = Column(String(255), nullable=True, default="")
    last_name = Column(String(255), nullable=True, default="")
    position = Column(String(255), nullable=True, default="")
    extra = Column(JSON, nullable=False, default=dict)

    group = relationship("Group", back_populates="targets")

    __table_args__ = (
        Index("ix_targets_group_email", "group_id", "email", unique=True),
    )


# ── Campaigns + results + events ───────────────────────────────────

def _new_token() -> str:
    """Per-target tracking token (URL-safe, 32 bytes ~ 43 chars).

    The token is the ONLY identifier embedded in the public tracking
    URLs. It is unguessable so a target who shares a link cannot reveal
    another target's tracking state."""
    return secrets.token_urlsafe(32)


class Campaign(Base):
    __tablename__ = "campaigns"

    id = _uuid_col(primary_key=True)
    name = Column(String(255), nullable=False)
    status = Column(String(30), nullable=False, default=CampaignStatus.QUEUED.value)

    sending_profile_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("sending_profiles.id"), nullable=False)
    template_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("templates.id"), nullable=False)
    landing_page_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("landing_pages.id"), nullable=False)
    group_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("groups.id"), nullable=False)

    # Public base URL prepended to {{.URL}} / {{.TrackingURL}} in templates.
    url = Column(String(500), nullable=False, default="")
    launch_date = Column(DateTime(timezone=True), nullable=True)
    send_by_date = Column(DateTime(timezone=True), nullable=True)
    completed_date = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc, nullable=False)

    results = relationship("Result", back_populates="campaign", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="campaign", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_campaigns_status", "status"),
        Index("ix_campaigns_launch_date", "launch_date"),
    )


class Result(Base):
    """Per-target row inside a campaign.

    Frozen at campaign launch from the Group's targets — once a campaign
    is queued, edits to the source Group/Target do NOT retroactively
    rewrite results. This is how Gophish behaves and matches how
    pentest reports are usually expected to read.
    """
    __tablename__ = "results"

    id = _uuid_col(primary_key=True)
    campaign_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)

    email = Column(String(255), nullable=False)
    first_name = Column(String(255), nullable=True, default="")
    last_name = Column(String(255), nullable=True, default="")
    position = Column(String(255), nullable=True, default="")

    status = Column(String(30), nullable=False, default=ResultStatus.SCHEDULED.value)
    # Per-target opaque token. Used in /track/{token}.png, /track/{token},
    # /track/{token}/submit, /track/{token}/report.
    token = Column(String(64), nullable=False, unique=True, default=_new_token, index=True)

    send_date = Column(DateTime(timezone=True), nullable=True)
    open_date = Column(DateTime(timezone=True), nullable=True)
    click_date = Column(DateTime(timezone=True), nullable=True)
    submit_date = Column(DateTime(timezone=True), nullable=True)
    report_date = Column(DateTime(timezone=True), nullable=True)

    # Optional, set by the public tracker if/when we record IP (off by default).
    last_ip = Column(String(64), nullable=True, default="")

    campaign = relationship("Campaign", back_populates="results")

    __table_args__ = (
        Index("ix_results_campaign_status", "campaign_id", "status"),
        Index("ix_results_campaign_email", "campaign_id", "email", unique=True),
    )


class Event(Base):
    """Append-only campaign event log.

    Every state transition on a Result (sent / opened / clicked /
    submitted / reported / error) writes one Event row. The
    ``details`` JSON carries event-specific metadata — for
    ``submitted_data`` events that means field NAMES and value LENGTHS
    only, never the values themselves.
    """
    __tablename__ = "events"

    id = _uuid_col(primary_key=True)
    campaign_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    result_id = Column(Uuid(as_uuid=True, native_uuid=False), ForeignKey("results.id", ondelete="CASCADE"), nullable=True, index=True)

    email = Column(String(255), nullable=True, default="")
    message = Column(String(50), nullable=False)  # one of EventType
    details = Column(JSON, nullable=False, default=dict)
    time = Column(DateTime(timezone=True), default=_now_utc, nullable=False, index=True)

    campaign = relationship("Campaign", back_populates="events")
