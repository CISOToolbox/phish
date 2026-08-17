# Phish — Standalone

CISO Toolbox **Phish** module — Gophish-inspired phishing simulation
platform. Standalone deployment: SQLite file in a Docker volume, own
auth, no external database, no Pilot integration required.

## What it does

Phish lets a security team run **authorised** phishing simulations
against their own staff for awareness training:

- Define SMTP **Sending Profiles** (relay credentials)
- Build email **Templates** with Gophish-compatible placeholders
  (`{{.FirstName}}`, `{{.URL}}`, `{{.TrackingURL}}`, …)
- Build **Landing Pages** served when a target clicks the tracked link
- Group **Targets** (CSV import / paste)
- Launch **Campaigns** that send the template to each target and track
  open / click / submit / reported events
- View dashboards with funnel + timeline + per-target details

## What it does NOT do

- **It does not store credentials submitted by targets.** When a
  landing page exposes a form, the backend records that a submission
  happened plus the names and lengths of the fields — never the values.
  This is a deliberate defensive choice (see `src/models.py` →
  `Event` docstring).
- It will not send to addresses outside the configured Group. There is
  no open relay surface — every send is bound to a Campaign + Result
  row.
- It is not a Gophish drop-in. The wire model is compatible, but a few
  Gophish features (IMAP poll, REST API keys, webhook receivers) are
  out of scope for V1.

## Authorised use only

This is a security awareness training tool. Running phishing campaigns
against users who have not authorised your security team to do so is
illegal in most jurisdictions. Get written sign-off from the relevant
stakeholders (legal, HR, executive) before launching against real
mailboxes.

## Quick start

```bash
cp .env.example .env
# edit .env: set JWT_SECRET, AUTH_TOKEN, APP_URL
docker compose up -d --build
```

Then point a browser at `http://localhost:8091/`.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | yes | `openssl rand -hex 32` |
| `AUTH_TOKEN` | yes (standalone) | one-shot bootstrap login |
| `APP_URL` | yes | public base URL used in tracking links |
| `DATABASE_URL` | yes (set by docker-compose) | `sqlite+aiosqlite:////data/phish.db` — file lives in the `phish-data` Docker volume |
| `AUTH_MODE` | yes | `standalone` |
| `ENTRA_*` / `GOOGLE_*` / `OIDC_*` | no | optional OAuth providers |

## Phase status

This image is **P1 scaffold** only. CRUD endpoints currently return
empty lists. Mail send / tracking / dashboards land in P3-P6.
