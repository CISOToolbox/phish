"""Auth module — thin wrapper over auth_common.py with Phish-specific overrides.

Phish defaults to AUTH_MODE=standalone and adds assert_auth_configured().
Edit the shared auth logic in auth_common.py, not here.
"""
import os

from src.auth_common import (  # noqa: F401 — re-export
    AUTH_MODE,
    AUTH_TOKEN,
    COOKIE_NAME,
    JWT_SECRET,
    MODULE_COOKIE,
    MODULE_NAME,
    _MIN_JWT_SECRET_LEN,
    create_jwt,
    decode_jwt,
    get_current_user,
    get_current_user_permissive,
    get_module_role,
    require_admin,
    require_min_role,
)

# Role ladder for require_min_role() on this module's routes. It lists the
# aliases of every tier (see ADMIN/EDITOR/VIEWER_MODULE_ROLES in auth_common),
# because require_min_role raises 403 when the caller's role is absent from the
# ladder — a short ["viewer", "editor", "admin"] would lock out a perfectly
# legitimate "contributor" or "manager".
#
# "user" sits AFTER "editor" on purpose: it is the historical Phish role (the
# `users.role` column still defaults to it) and it means "operator", so it must
# clear an `require_min_role(user, "editor", …)` gate. Ordering is what
# require_min_role compares, so moving it before "editor" would silently
# demote every pre-existing account.
PHISH_ROLES = [
    "viewer", "reader", "triager",
    "editor", "user", "contributor", "manager",
    "admin", "control",
]


def auth_enabled() -> bool:
    if AUTH_MODE == "standalone":
        return bool(AUTH_TOKEN) and bool(JWT_SECRET)
    return bool(JWT_SECRET)


def assert_auth_configured() -> None:
    """Called at startup. Refuse to boot if auth is silently disabled,
    unless PHISH_ALLOW_NO_AUTH=1 is explicitly set (dev only)."""
    if auth_enabled():
        # The role gates read the per-module entry of the JWT permissions map,
        # keyed by MODULE_NAME. Empty MODULE_NAME => no entry => get_module_role
        # falls back to "admin" => every require_min_role/require_admin gate is
        # a no-op. Fail closed rather than serve an unguarded API.
        if not MODULE_NAME:
            raise RuntimeError(
                "MODULE_NAME is empty. It keys the per-module role in the "
                "session token; without it every role check silently passes. "
                "Set MODULE_NAME=phish. Refusing to start."
            )
        # phish boots through this gate, not auth_common.assert_auth_posture,
        # so the JWT_SECRET floor must be enforced here too. A short secret is
        # offline-crackable and the session cookie is HS256 — same floor the
        # other modules apply. Kept in sync with _MIN_JWT_SECRET_LEN.
        if JWT_SECRET and len(JWT_SECRET) < _MIN_JWT_SECRET_LEN:
            raise RuntimeError(
                f"JWT_SECRET is too short ({len(JWT_SECRET)} chars): minimum "
                f"{_MIN_JWT_SECRET_LEN}. Generate one with "
                "`openssl rand -hex 32`. Refusing to start."
            )
        return
    if os.getenv("PHISH_ALLOW_NO_AUTH", "") == "1":
        return
    raise RuntimeError(
        "Authentication is not configured. Set JWT_SECRET "
        "(and AUTH_TOKEN in standalone mode), or explicitly allow "
        "unauthenticated access with PHISH_ALLOW_NO_AUTH=1 for dev."
    )
