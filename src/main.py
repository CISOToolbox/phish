from __future__ import annotations

import asyncio
import logging
import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from src.auth import assert_auth_configured
from src.database import engine
from src.models import Base
from src.routes.ai import router as ai_router
from src.routes.auth import router as auth_router
from src.routes.campaigns import router as campaigns_router
from src.routes.dashboard import router as dashboard_router
from src.routes.groups import router as groups_router
from src.routes.landing_pages import router as landing_pages_router
from src.routes.m365 import router as m365_router
from src.routes.preview import router as preview_router
from src.routes.sending_profiles import router as sending_profiles_router
from src.routes.templates import router as templates_router
from src.routes.tracking import router as tracking_router
from src.routes.users import router as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("phish-backend")

app = FastAPI(title="Phish Backend", version="0.1.0")


@app.exception_handler(Exception)
async def _global_error_handler(request, exc):
    logger.error("Unhandled error: %s", exc, exc_info=True)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Admin SPA — locked down: only same-origin assets, no external anything.
_CSP_ADMIN = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; connect-src 'self' https://api.anthropic.com https://api.openai.com"
)
# Landing pages (public /track/* and the in-editor preview) are clones of
# real web pages used for authorised awareness simulations — to look
# credible they must load the origin site's CSS, fonts and images.
# Script execution stays restricted to 'self' so the cloned site's own
# JavaScript never runs in a browser.
_CSP_ASSETS = "style-src * 'unsafe-inline'; img-src * data:; font-src * data:"
# Public tracker — never framable.
_CSP_TRACKER = (
    f"default-src 'self'; script-src 'self'; {_CSP_ASSETS}; "
    "connect-src 'self'; frame-ancestors 'none'"
)
# In-editor preview — same as the tracker, but rendered inside an
# admin-SPA iframe, so same-origin framing must be allowed.
_CSP_PREVIEW = (
    f"default-src 'self'; script-src 'self'; {_CSP_ASSETS}; "
    "connect-src 'self'; frame-ancestors 'self'"
)
_PREVIEW_PATH = "/api/preview"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if path == _PREVIEW_PATH:
            response.headers["Content-Security-Policy"] = _CSP_PREVIEW
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
        elif path.startswith("/track/"):
            response.headers["Content-Security-Policy"] = _CSP_TRACKER
            response.headers["X-Frame-Options"] = "DENY"
        else:
            response.headers["Content-Security-Policy"] = _CSP_ADMIN
            response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

APP_URL = os.environ.get("APP_URL", "http://localhost:8091")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[APP_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router)
app.include_router(sending_profiles_router)
app.include_router(templates_router)
app.include_router(landing_pages_router)
app.include_router(preview_router)
app.include_router(m365_router)
app.include_router(groups_router)
app.include_router(campaigns_router)
app.include_router(dashboard_router)
app.include_router(tracking_router)
app.include_router(ai_router)
app.include_router(users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup():
    assert_auth_configured()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")
    from src.m365_connector import poll_loop
    asyncio.create_task(poll_loop())
    logger.info("M365 connector poll loop scheduled")


app.mount("/", StaticFiles(directory="app", html=True), name="static")
