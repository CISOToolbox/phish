# ┌──────────────────────────────────────────────────────────────────┐
# │  CISO Toolbox — Phish (phishing simulation) hardened image      │
# │  Multi-stage: pip deps → hardened runtime                       │
# │  Non-root (phish:1000), bundles headless Chromium for the       │
# │  landing-page site importer. Multi-arch (amd64 + arm64).        │
# └──────────────────────────────────────────────────────────────────┘

# ── Stage 1: pip dependencies ────────────────────────────────────
# Base image (DEP-07 / CNT-01): python:3.13-slim pinned by tag **and** by the
# multi-arch index digest below, so every build resolves to the exact same
# bits on amd64 and arm64. 3.13 closes the CPython CVEs that had no fix in
# the 3.12 line. Bump tag and digest together:
#   skopeo inspect docker://docker.io/library/python:<tag> --format '{{.Digest}}'
FROM python:3.13-slim@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91 AS builder

WORKDIR /app
# requirements-lock.txt holds every package the image installs, transitives
# included, each at one version with its hashes: the build installs exactly
# what was resolved, never a newer release (requirements.txt lists what the
# module asks for; the lock is regenerated from it).
COPY requirements-lock.txt .
RUN pip install --no-cache-dir --prefix=/install --require-hashes -r requirements-lock.txt

# ── Stage 2: hardened runtime ────────────────────────────────────
FROM python:3.13-slim@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91

LABEL org.opencontainers.image.title="ciso-phish" \
      org.opencontainers.image.description="CISO Toolbox — Phish (phishing simulation) module" \
      org.opencontainers.image.vendor="CISOToolbox" \
      org.opencontainers.image.source="https://github.com/CISOToolbox/phish" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Python deps (incl. the Playwright driver) from the builder stage.
COPY --from=builder /install /usr/local

# Base packages + headless Chromium for the landing-page site importer.
# Chromium's runtime libraries are installed explicitly with their Debian
# names — `playwright install --with-deps` ships stale Ubuntu-only font
# package names that have no Debian candidate. The browser binary is then
# downloaded into PLAYWRIGHT_BROWSERS_PATH.
#
# The `t64` suffixes are NOT cosmetic and must not be "cleaned up": the base
# image moved from bookworm (python:3.12-slim) to trixie (python:3.13-slim),
# and trixie renamed the libraries affected by the 64-bit time_t transition.
# The bookworm names (libasound2, libatk1.0-0, libatk-bridge2.0-0,
# libatspi2.0-0, libcups2, libglib2.0-0) have NO candidate in trixie and the
# build fails at apt-get. Packages that were not part of that transition
# (libcairo2, libpango-1.0-0, libnss3, the libx* set, …) keep their name.
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates dumb-init fonts-liberation \
        libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \
        libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64 \
        libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
        libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && playwright install chromium \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true \
    && chmod -R a+rX /ms-playwright

# Non-root user — UID 1000 chosen for compatibility with OpenShift
# arbitrary UID ranges and standard Docker-on-host permission mapping.
RUN useradd -r -m -u 1000 -s /usr/sbin/nologin phish \
    && mkdir -p /app /data \
    && chown -R phish:phish /app /data

# Persist the SQLite database here. Mount a Docker volume at /data.
VOLUME /data

WORKDIR /app

COPY --chown=phish:phish src/ src/
COPY --chown=phish:phish app/ app/
COPY --chown=phish:phish alembic/ alembic/
COPY --chown=phish:phish alembic.ini .
COPY --chown=phish:phish docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')"]

USER phish

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
