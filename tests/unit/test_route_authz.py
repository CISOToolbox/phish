#!/usr/bin/env python3
"""Regression guard — every mutating Phish route carries a role check.

Phish shipped once with `require_admin` / `require_min_role` imported in
`src/auth.py` and used in **zero** routes, while standalone provisioning
handed an active session to any account the IdP would authenticate. In this
module that combination means an arbitrary visitor could launch a phishing
campaign from the organisation's own mail infrastructure and export who
clicked (pre-publication security audit, finding B1).

The fix has two halves and this file guards the second one: the first
executable statement of every state-changing handler must be a role gate.
The provisioning half (`ALLOWED_EMAIL_DOMAINS` + the `pending` role) lives in
`src/routes/auth.py` and is covered by `test_provisioning_gates` below.

Pure stdlib, so it runs two ways:

    python3 tests/unit/test_route_authz.py     # standalone, no dependencies
    pytest tests/unit/test_route_authz.py      # in CI

Adding a route that legitimately needs no gate means adding it to
`READ_ONLY_OK` with a reason — not loosening the analysis.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[2]
ROUTES = MODULE_ROOT / "src" / "routes"

GUARDS = {"require_admin", "require_min_role"}
MUTATING = {"post", "put", "patch", "delete"}

# Handlers that change state but must stay reachable without a session, with
# the reason. These are the public tracking endpoints: a target clicking a link
# in an awareness email has no cookie to present. They are authorised by the
# 32-byte opaque per-target token instead — see src/routes/tracking.py.
READ_ONLY_OK = {
    "tracking.py:track_open": "public tracker, authorised by the opaque token",
    "tracking.py:track_click": "public tracker, authorised by the opaque token",
    "tracking.py:track_submit": "public tracker, authorised by the opaque token",
    "tracking.py:track_report": "public tracker, authorised by the opaque token",
    # The login flows are what establishes a session in the first place.
    "auth.py:login_token": "login endpoint, gated by AUTH_TOKEN",
    "auth.py:logout": "clears the caller's own cookie",
}


def _route_methods(fn: ast.AST) -> set[str]:
    """HTTP methods this handler is decorated with (@router.post(...) → post)."""
    methods = set()
    for dec in getattr(fn, "decorator_list", []):
        call = dec.func if isinstance(dec, ast.Call) else dec
        if isinstance(call, ast.Attribute) and isinstance(call.value, ast.Name):
            if call.value.id == "router":
                methods.add(call.attr.lower())
    return methods


def _first_statement(fn: ast.AST) -> ast.stmt | None:
    body = list(fn.body)
    if (body and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)):
        body = body[1:]          # skip the docstring
    return body[0] if body else None


def _is_guard(stmt: ast.stmt | None) -> bool:
    return (
        isinstance(stmt, ast.Expr)
        and isinstance(stmt.value, ast.Call)
        and isinstance(stmt.value.func, ast.Name)
        and stmt.value.func.id in GUARDS
    )


def find_unguarded() -> list[str]:
    problems = []
    for path in sorted(ROUTES.glob("*.py")):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            if not _route_methods(node) & MUTATING:
                continue
            key = f"{path.name}:{node.name}"
            if key in READ_ONLY_OK:
                continue
            if not _is_guard(_first_statement(node)):
                problems.append(f"{key} (line {node.lineno}): no role gate")
    return problems


def test_every_mutating_route_is_guarded():
    problems = find_unguarded()
    assert not problems, (
        "state-changing routes without a role gate:\n  " + "\n  ".join(problems)
    )


def test_provisioning_gates():
    """`_upsert_user` must consult the allow-list and park new accounts."""
    src = (ROUTES / "auth.py").read_text()
    assert "_ALLOWED_EMAIL_DOMAINS" in src, "no email allow-list in _upsert_user"
    assert '"pending"' in src, "new accounts are not parked as pending"
    assert 'else "user"' not in src, (
        "new accounts are activated on the spot again — they must default to "
        '"pending" until an admin promotes them'
    )


def test_sending_profile_password_is_not_returned():
    """The read schema must not serialise the SMTP password back."""
    src = (MODULE_ROOT / "src" / "schemas.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "SendingProfileResponse":
            bases = {b.id for b in node.bases if isinstance(b, ast.Name)}
            assert "SendingProfileBase" not in bases, (
                "SendingProfileResponse inherits SendingProfileBase, which "
                "carries `password` — GET would hand out the SMTP credential"
            )
            fields = {
                t.target.id for t in node.body
                if isinstance(t, ast.AnnAssign) and isinstance(t.target, ast.Name)
            }
            assert "password" not in fields
            return
    raise AssertionError("SendingProfileResponse not found")


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
    print("OK — every mutating Phish route carries a role gate")
