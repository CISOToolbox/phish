"""Phish — template rendering and tracking injection.

We deliberately do NOT use Jinja2's `{{ var }}` syntax because templates
imported from Gophish use Go template syntax (`{{.FirstName}}`) — passing
that through Jinja2 would either misparse or open template-injection on a
field that is meant to be a plain literal substitution.

Instead, this module does pure string replacement for a fixed set of
placeholders. No code execution path, no eval, no sandbox to escape.

Tracking injection is also string-based: if the HTML body does not
already contain the pixel placeholder, we append a 1×1 invisible img tag
referencing ``{base}/track/{token}.png`` so the open event fires on
preview-pane render. The clickable link uses ``{{.URL}}`` for explicit
authorship — only authors of the template decide what is clickable.
"""
from __future__ import annotations

import re
from typing import Optional


def _trk_click_url(base_url: str, token: str) -> str:
    base = (base_url or "").rstrip("/")
    return f"{base}/track/{token}"


def _trk_open_url(base_url: str, token: str) -> str:
    base = (base_url or "").rstrip("/")
    return f"{base}/track/{token}.png"


def render(
    text: str,
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    position: str = "",
    from_address: str = "",
    base_url: str = "",
    token: str = "",
) -> str:
    """Replace every supported placeholder.

    Unknown placeholders are left as-is so authors notice the typo
    instead of silently sending a blank string.
    """
    if not text:
        return ""
    repl = {
        "{{.FirstName}}": first_name or "",
        "{{.LastName}}":  last_name or "",
        "{{.Email}}":     email or "",
        "{{.Position}}":  position or "",
        "{{.From}}":      from_address or "",
        "{{.RId}}":       token or "",
        "{{.URL}}":       _trk_click_url(base_url, token),
        "{{.TrackingURL}}": _trk_open_url(base_url, token),
    }
    out = text
    for k, v in repl.items():
        out = out.replace(k, v)
    return out


_PIXEL_RE = re.compile(r"\{\{\.TrackingURL\}\}|/track/[A-Za-z0-9_\-]+\.png", re.IGNORECASE)


def inject_tracking_pixel(html: str, base_url: str, token: str) -> str:
    """Append a 1×1 transparent tracking pixel if not already present.

    The author is free to place ``{{.TrackingURL}}`` themselves anywhere
    in the HTML. If they didn't, we add it right before ``</body>`` (or
    at the end of the document as a fallback).
    """
    if not html:
        return ""
    if _PIXEL_RE.search(html):
        return html
    pixel_url = _trk_open_url(base_url, token)
    pixel = f'<img src="{pixel_url}" width="1" height="1" border="0" alt="" style="display:none">'
    lower = html.lower()
    idx = lower.rfind("</body>")
    if idx >= 0:
        return html[:idx] + pixel + html[idx:]
    return html + pixel


def render_email(
    *,
    subject_template: str,
    html_template: str,
    text_template: str,
    first_name: str,
    last_name: str,
    email: str,
    position: str,
    from_address: str,
    base_url: str,
    token: str,
) -> tuple[str, str, str]:
    """Return (subject, html, text) after placeholder substitution + pixel injection."""
    ctx = dict(
        first_name=first_name,
        last_name=last_name,
        email=email,
        position=position,
        from_address=from_address,
        base_url=base_url,
        token=token,
    )
    subject = render(subject_template, **ctx)
    html = render(html_template, **ctx)
    text = render(text_template, **ctx)
    html = inject_tracking_pixel(html, base_url, token)
    return subject, html, text
