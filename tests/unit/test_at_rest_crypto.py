#!/usr/bin/env python3
"""Regression guard — phish secrets are encrypted at rest.

phish shipped with no at-rest crypto: the SMTP relay password and the M365
client secret were written to the database in cleartext, so a stolen pg_dump
or a DB-volume read handed over live sending credentials (pre-publication
audit, finding M-A). settings_crypto (AES-256-GCM, propagated from the shared
master) now encrypts both.

This test pins the two invariants that keep it working:
  1. a stored secret carries the enc:v1: marker and decrypts back to the
     original (round-trip under a set ENCRYPTION_KEY);
  2. the read path is a no-op on the cleartext an unsaved "test this form"
     profile carries — otherwise decrypt_setting would mangle it.

Runs both ways:
    python3 tests/unit/test_at_rest_crypto.py
    pytest tests/unit/test_at_rest_crypto.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(MODULE_ROOT))

# A real key so encrypt actually runs (standalone-without-key degrades to
# plaintext, which would make the round-trip assertions vacuous).
os.environ.setdefault("ENCRYPTION_KEY", "x" * 48)

from src.settings_crypto import (  # noqa: E402
    decrypt_setting,
    encrypt_setting_or_plain,
    is_encrypted,
)


def test_secret_round_trips_through_ciphertext():
    enc = encrypt_setting_or_plain("smtp-pass-123")
    assert is_encrypted(enc), "stored secret is not marked as ciphertext"
    assert enc != "smtp-pass-123", "stored secret is the plaintext"
    assert decrypt_setting(enc) == "smtp-pass-123"


def test_decrypt_is_noop_on_cleartext():
    # The unsaved test-profile path reaches the mailer with a plaintext
    # password; decrypt_setting must return it untouched.
    assert decrypt_setting("plain-form-password") == "plain-form-password"
    assert decrypt_setting("") == ""


def test_empty_secret_stays_empty():
    # "" means "not set" — it must not become ciphertext (which is truthy and
    # would read back as a configured-but-broken credential).
    assert encrypt_setting_or_plain("") == ""


def test_write_paths_encrypt_the_password():
    """Static guard: the two persistence sites wrap the password in
    encrypt_setting_or_plain, and the mailer decrypts on read."""
    sp = (MODULE_ROOT / "src" / "routes" / "sending_profiles.py").read_text()
    assert sp.count("encrypt_setting_or_plain") >= 2, (
        "create/update no longer encrypt the SMTP password before storing it"
    )
    mailer = (MODULE_ROOT / "src" / "mailer.py").read_text()
    assert "decrypt_setting(profile.password" in mailer, (
        "mailer no longer decrypts the stored password before use"
    )
    m365 = (MODULE_ROOT / "src" / "m365_connector.py").read_text()
    assert "decrypt_setting(await get_setting(db, \"m365_client_secret\")" in m365, (
        "get_config no longer decrypts the M365 client secret"
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
    print("OK — phish secrets are encrypted at rest")
