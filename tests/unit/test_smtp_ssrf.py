#!/usr/bin/env python3
"""Regression guard — the SMTP send path refuses internal hosts (SSRF).

POST /api/sending-profiles/test took a free-form SMTP ``host`` and handed it
straight to aiosmtplib, so an operator could point it at cloud metadata
(169.254.169.254), loopback or an RFC1918 peer and read the outcome back
through the {ok, error} response — an internal-network scan oracle
(pre-publication audit, finding M-B). send_via_profile is the single choke
point for every send (both test endpoints and the campaign loop); it now
resolves the host and refuses any non-public address via the shared net_guard.

Runs both ways:
    python3 tests/unit/test_smtp_ssrf.py
    pytest tests/unit/test_smtp_ssrf.py
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import sys
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(MODULE_ROOT))

logging.disable(logging.CRITICAL)

from src.mailer import send_via_profile  # noqa: E402
from src.models import SendingProfile  # noqa: E402
from src.net_guard import ip_is_public  # noqa: E402

_BLOCK_MARKERS = ("Host targets", "Host could not", "No host", "invalid address")


def _profile(host: str) -> SendingProfile:
    return SendingProfile(
        name="t", from_address="a@b.com", host=host,
        username="", password="", ignore_cert_errors=False, headers=[],
    )


async def _blocked(host: str) -> bool:
    r = await send_via_profile(
        _profile(host), to_address="x@y.com", subject="s", html="<p>h</p>", text="t"
    )
    return r["ok"] is False and (r["error"] or "").startswith(_BLOCK_MARKERS)


def test_internal_smtp_hosts_are_refused():
    for host in ("169.254.169.254:25", "127.0.0.1:587", "10.0.0.5",
                 "192.168.1.10:25", "localhost:25", "[::1]:25"):
        assert asyncio.run(_blocked(host)), f"{host} was NOT blocked"


def test_ip_predicate():
    pub = ["8.8.8.8", "1.1.1.1"]
    priv = ["10.0.0.1", "172.16.0.1", "192.168.0.1", "127.0.0.1",
            "169.254.169.254", "::1", "fc00::1", "::ffff:127.0.0.1"]
    assert all(ip_is_public(ipaddress.ip_address(i)) for i in pub)
    assert not any(ip_is_public(ipaddress.ip_address(i)) for i in priv)


def test_send_path_calls_the_guard():
    """Static guard: the mailer validates the host before connecting, and the
    primitive is the shared one (not a local re-implementation that could drift
    from the site-importer's)."""
    mailer = (MODULE_ROOT / "src" / "mailer.py").read_text()
    assert "assert_public_host" in mailer, "mailer no longer validates the SMTP host"
    site = (MODULE_ROOT / "src" / "site_import.py").read_text()
    assert "from src.net_guard import" in site, (
        "site_import no longer shares the SSRF primitive — it may have drifted"
    )


if __name__ == "__main__":
    failures = []
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except AssertionError as exc:
                failures.append(f"{name}: {exc}")
    if failures:
        print("FAIL\n" + "\n".join(failures))
        sys.exit(1)
    print("OK — the SMTP send path refuses internal hosts")
