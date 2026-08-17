"""Phish — landing-page site import via headless Chromium (SSRF-hardened).

Clones an existing public web page so an operator can use it as a
phishing-simulation landing page — Gophish's "Import Site", but rendered.

A plain HTTP fetch only captures server-rendered markup; modern login
pages (Microsoft, Google, Okta, …) ship an empty ``<body>`` and build
their UI entirely in JavaScript. So the page is opened in a real headless
Chromium, its JavaScript is allowed to run and lay out the DOM, and the
*rendered* document is captured. The capture is then sanitised in-page
(:data:`_CLEANUP_JS`):

  * every ``<script>`` and inline ``on*`` handler is removed, and
    ``javascript:`` URLs are dropped — none of the origin site's
    authentication JavaScript can run in a target's browser;
  * every ``<form>`` is repointed at ``{{.SubmitURL}}`` (method POST) so
    a submitted login is recorded by the public tracker. The tracker
    counts field **names and lengths only** — submitted values are never
    stored (see ``src.routes.tracking``).

The saved landing page is therefore a static visual snapshot wired for
capture, never the origin site's live code.

──────────────────────────────────────────────────────────────────────
SECURITY — SSRF defence
──────────────────────────────────────────────────────────────────────
The render runs server-side, so an authenticated operator could
otherwise make the backend reach internal resources (cloud metadata
169.254.169.254, RFC1918 ranges, localhost, container-network peers).
A headless browser is a wide SSRF surface — page JavaScript can request
arbitrary URLs — so EVERY request the browser makes (the top document,
every redirect, every sub-resource) is intercepted:

  * the entry URL is validated up front;
  * a Playwright route handler resolves each request's host with
    getaddrinfo and aborts it unless every resolved address is a
    public/global IP — never private, loopback, link-local, reserved,
    multicast, unspecified, nor the IPv4-mapped form of one;
  * non-http(s) schemes other than data:/blob:/about: are aborted.

Residual TOCTOU: DNS could resolve differently between our check and
Chromium's own connection. For a single-tenant, self-hosted tool driven
by an already-authenticated, authorised operator this is an accepted,
low-severity residual risk.
"""
from __future__ import annotations

import asyncio
import re
from urllib.parse import urlparse

from src.net_guard import UnsafeHostError, assert_public_host, ip_is_public

NAV_TIMEOUT_MS = 30_000      # hard cap on the initial navigation
SETTLE_TIMEOUT_MS = 6_000    # extra wait for network to go idle
SETTLE_EXTRA_MS = 800        # final paint settle
MAX_BYTES = 4 * 1024 * 1024  # rendered-DOM size cap
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# One render at a time — a full Chromium per request is memory-heavy and
# importing a site is an occasional admin action, not a hot path.
_render_lock = asyncio.Lock()

# Runs inside the rendered page just before capture. Strips the origin
# site's scripts / inline handlers so none of its authentication code can
# run, and points every form at the tracker submit endpoint so a typed
# login is captured (the tracker keeps field names + lengths, no values).
# Passed verbatim to page.evaluate — `{{.SubmitURL}}` is a literal the
# templating layer resolves at serve time.
_CLEANUP_JS = """
() => {
  document.querySelectorAll('script').forEach(e => e.remove());
  document.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) {
        el.removeAttribute(a.name);
      } else if (['href', 'src', 'action', 'formaction'].includes(n)
                 && a.value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(a.name);
      }
    });
  });
  document.querySelectorAll('form').forEach(f => {
    f.setAttribute('action', '{{.SubmitURL}}');
    f.setAttribute('method', 'post');
    f.removeAttribute('target');
    if (!f.querySelector('[type=submit]')) {
      f.querySelectorAll('button:not([type=reset]), input[type=button]')
        .forEach(b => b.setAttribute('type', 'submit'));
    }
  });
}
"""


class SiteImportError(Exception):
    """Raised for an unsafe URL or a failed render. Message is user-safe."""


# The SSRF primitive lives in net_guard so the SMTP send path shares it and the
# two cannot drift. _ip_is_public is kept as a re-export for readers of this
# module; _assert_public_host adapts net_guard's exception to this module's.
_ip_is_public = ip_is_public


async def _assert_public_host(host: str | None) -> None:
    """Resolve ``host`` and reject if any resolved address is not public."""
    try:
        await assert_public_host(host)
    except UnsafeHostError as exc:
        raise SiteImportError(str(exc))


def _normalise_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        raise SiteImportError("URL is empty")
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise SiteImportError("Only http(s) URLs are allowed")
    if not parsed.hostname:
        raise SiteImportError("URL has no host")
    return url


_HEAD_RE = re.compile(r"<head[^>]*>", re.I)
_BASE_RE = re.compile(r"<base\b", re.I)


def _inject_base(html: str, final_url: str) -> str:
    """A <base> tag resolves the snapshot's relative CSS/image/font URLs
    against the origin site. Left untouched if the document has its own."""
    if _BASE_RE.search(html):
        return html
    tag = f'<base href="{final_url}">'
    m = _HEAD_RE.search(html)
    if m:
        return html[: m.end()] + tag + html[m.end():]
    return tag + html


async def render_site_html(raw_url: str) -> tuple[str, str]:
    """Render ``raw_url`` in headless Chromium and return ``(final_url, html)``.

    Raises :class:`SiteImportError` — message safe to show the operator —
    for any unsafe URL or render failure.
    """
    url = _normalise_url(raw_url)
    await _assert_public_host(urlparse(url).hostname)

    # Imported lazily so the rest of the module (and unit tests) do not
    # hard-require Playwright to be installed.
    try:
        from playwright.async_api import Error as PWError
        from playwright.async_api import TimeoutError as PWTimeout
        from playwright.async_api import async_playwright
    except ImportError:
        raise SiteImportError("Headless renderer is not available")

    host_cache: dict[str, bool] = {}

    async def _guard(route) -> None:
        """Per-request SSRF gate — runs for every browser request."""
        try:
            parsed = urlparse(route.request.url)
            scheme = parsed.scheme
            if scheme in ("data", "blob", "about"):
                await route.continue_()
                return
            if scheme not in ("http", "https"):
                await route.abort()
                return
            host = parsed.hostname
            ok = host_cache.get(host)
            if ok is None:
                try:
                    await _assert_public_host(host)
                    ok = True
                except SiteImportError:
                    ok = False
                host_cache[host] = ok
            await (route.continue_() if ok else route.abort())
        except Exception:
            try:
                await route.abort()
            except Exception:
                pass

    async with _render_lock:
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
                )
                try:
                    context = await browser.new_context(
                        user_agent=_UA,
                        viewport={"width": 1280, "height": 900},
                    )
                    page = await context.new_page()
                    await page.route("**/*", _guard)
                    resp = await page.goto(
                        url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS
                    )
                    if resp is not None and resp.status >= 400:
                        raise SiteImportError(f"Target returned HTTP {resp.status}")
                    try:
                        await page.wait_for_load_state(
                            "networkidle", timeout=SETTLE_TIMEOUT_MS
                        )
                    except PWTimeout:
                        pass
                    await page.wait_for_timeout(SETTLE_EXTRA_MS)
                    # Strip scripts/handlers, wire forms for capture.
                    await page.evaluate(_CLEANUP_JS)
                    html = await page.content()
                    final_url = page.url
                finally:
                    await browser.close()
        except SiteImportError:
            raise
        except PWTimeout:
            raise SiteImportError("The page took too long to render")
        except PWError:
            raise SiteImportError("Could not render the target page")

    if len(html.encode("utf-8", errors="ignore")) > MAX_BYTES:
        raise SiteImportError("Rendered page is too large")
    return final_url, _inject_base(html, final_url)
