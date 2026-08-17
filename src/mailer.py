"""Phish — SMTP send wrapper around aiosmtplib.

A single ``SendingProfile`` is loaded by the caller and passed in;
this module knows nothing about the DB. The send function returns a
small status dict (``{"ok": bool, "message_id": str, "error": str}``)
that the campaign engine writes back to the ``Result`` + ``Event`` rows.
"""
from __future__ import annotations

import logging
import re
import uuid
from email.message import EmailMessage
from email.utils import formatdate
from typing import Optional

import aiosmtplib

from src.models import SendingProfile
from src.net_guard import UnsafeHostError, assert_public_host
from src.settings_crypto import decrypt_setting

logger = logging.getLogger("phish.mailer")


def _sender_domain(from_address: str) -> str:
    """Real FQDN for the Message-ID — a non-FQDN domain (and any literal
    'phish') in headers is a strong spam-filter trigger. Falls back to a
    neutral placeholder when the from-address has no parseable domain."""
    m = re.search(r"@([A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z]{2,})", from_address or "")
    return m.group(1).lower() if m else "mail.local"


def _parse_host(host: str) -> tuple[str, int]:
    """Accepts ``smtp.example.com:587`` or ``smtp.example.com``."""
    if ":" in host:
        h, p = host.rsplit(":", 1)
        try:
            return h.strip(), int(p)
        except ValueError:
            pass
    return host.strip(), 587


def _build_message(
    *,
    from_address: str,
    to_address: str,
    subject: str,
    html: str,
    text: str,
    extra_headers: Optional[list[dict[str, str]]] = None,
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = from_address
    msg["To"] = to_address
    # CRLF stripping on Subject — single-line header injection guard.
    msg["Subject"] = re.sub(r"[\r\n]", " ", subject or "")
    # Date is an RFC 5322 required header — missing it gets the message
    # junked or rejected. Message-ID must carry a real FQDN.
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = f"<{uuid.uuid4()}@{_sender_domain(from_address)}>"
    msg.set_content(text or " ")
    if html:
        msg.add_alternative(html, subtype="html")
    if extra_headers:
        for h in extra_headers:
            k = (h.get("key") or "").strip()
            v = re.sub(r"[\r\n]", " ", (h.get("value") or "").strip())
            if k and v and k.lower() not in {"from", "to", "subject", "message-id"}:
                msg[k] = v
    return msg


async def send_via_profile(
    profile: SendingProfile,
    *,
    to_address: str,
    subject: str,
    html: str,
    text: str,
) -> dict:
    """Send one message. Returns ``{ok, message_id, error}``.

    All network errors are caught and surfaced — the engine never
    raises out of the per-target send loop, otherwise one broken target
    would stall the whole campaign.
    """
    host, port = _parse_host(profile.host)
    # SSRF guard: the SMTP host is operator-supplied and we are about to open a
    # connection to it. Refuse anything that resolves to a private/internal
    # address (cloud metadata, loopback, a container-network peer). This is the
    # single choke point for every send — the two "test this profile" endpoints
    # and the campaign loop all pass through here.
    try:
        await assert_public_host(host)
    except UnsafeHostError as exc:
        logger.warning("blocked SMTP host %s: %s", host, exc)
        return {"ok": False, "message_id": "", "error": str(exc)}
    # Stored profiles keep the password encrypted at rest; decrypt_setting is a
    # no-op on the cleartext an unsaved "test this form" profile carries, so
    # both paths reach here with a usable password.
    password = decrypt_setting(profile.password or "")
    msg = _build_message(
        from_address=profile.from_address,
        to_address=to_address,
        subject=subject,
        html=html,
        text=text,
        extra_headers=profile.headers or [],
    )
    use_tls = port == 465
    start_tls = port in (587, 25)
    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=(profile.username or None),
            password=(password or None),
            use_tls=use_tls,
            start_tls=start_tls,
            validate_certs=not profile.ignore_cert_errors,
            timeout=30,
        )
        return {"ok": True, "message_id": msg["Message-ID"], "error": ""}
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("send failed to %s via %s: %s", to_address, host, exc)
        return {"ok": False, "message_id": msg["Message-ID"], "error": str(exc)[:500]}
