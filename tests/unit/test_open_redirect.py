#!/usr/bin/env python3
"""Regression guard — the public tracker's post-submit redirect is web-only.

`POST /track/{token}/submit` redirects to the landing page's configured
`redirect_url`. That value is operator-set and can legitimately point off-site
(an awareness-training page), but it was used verbatim, so a `javascript:` or
`data:` scheme would turn a public, unauthenticated endpoint into an XSS /
scheme-redirect vector (pre-publication audit, finding L-1). `_safe_redirect`
now collapses anything that is not http(s) to "no redirect".

    python3 tests/unit/test_open_redirect.py
    pytest tests/unit/test_open_redirect.py
"""
from __future__ import annotations

import sys
from pathlib import Path

MODULE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(MODULE_ROOT))

from src.routes.tracking import _safe_redirect  # noqa: E402


def test_http_and_https_pass():
    assert _safe_redirect("https://train.example.com/a") == "https://train.example.com/a"
    assert _safe_redirect("http://ok.example.com") == "http://ok.example.com"
    assert _safe_redirect("  https://sp.example.com  ") == "https://sp.example.com"
    assert _safe_redirect("HTTPS://Up.example.com") == "HTTPS://Up.example.com"


def test_dangerous_schemes_are_dropped():
    for bad in ("javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x",
                "vbscript:x", "file:///etc/passwd", "//evil.example.com",
                "/relative", "evil.example.com", ""):
        assert _safe_redirect(bad) == "", f"{bad!r} was not neutralised"


def test_sink_uses_the_guard():
    src = (MODULE_ROOT / "src" / "routes" / "tracking.py").read_text()
    assert "_safe_redirect(lp.redirect_url" in src, (
        "the submit handler no longer routes redirect_url through _safe_redirect"
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
        print("FAIL\n" + "\n".join(failures)); sys.exit(1)
    print("OK — the tracker redirect is http(s)-only")
