> **⚠️ This repository is retired.** The CISO Toolbox phishing-simulation
> tool is now **[CISOToolbox/gophish](https://github.com/CISOToolbox/gophish)**,
> a maintained standalone fork of [gophish](https://github.com/gophish/gophish).
> This repository is archived and read-only — use CISOToolbox/gophish instead.

# CISO Toolbox - Phish (standalone)

Authorised phishing simulation platform: sending profiles, landing pages, email templates, target groups, campaigns and awareness reporting.

This repository is the **standalone** packaging of the Phish module: one
`docker compose up` brings up the module and its database, with its own login.
It runs on its own - no Pilot, no reverse proxy, no other module required.

Part of the [CISO Toolbox](https://cisotoolbox.org) suite. The integrated
multi-module deployment (Pilot SSO + nginx + every module behind a single
domain) lives in the CISO Toolbox suite repository.

## What you get

- **Authorised phishing simulations**: campaigns against your own users,
  with explicit authorization framing.
- **Building blocks**: sending profiles (SMTP), email templates, landing
  pages, target groups (CSV import).
- **Campaign lifecycle**: scheduling, sending, click/submit tracking, and
  awareness reporting per campaign and per user.

## Requirements

- Docker Engine 24+ (or Podman 4+) with the Compose plugin
- ~2 GB RAM and 2 CPU for a single-module stack
- **Disk**: a Docker volume for the SQLite database (`phish-data`)
- Python 3.11+ and `pytest` **only** if you want to run the end-to-end tests
  from the host

## Install and run

```bash
cp .env.example .env
# Edit .env - every variable is documented inline.
# Generate each secret separately:  openssl rand -hex 32
docker compose up -d
```

The module is then served on <http://localhost:8091>.

Database migrations (Alembic) run automatically at container start.

```bash
docker compose logs -f          # follow the logs
docker compose down             # stop
docker compose down -v          # stop and DESTROY the data volume
```

## Authentication

`AUTH_MODE=standalone` (the default in `docker-compose.yml`) enables the local
token login. `AUTH_TOKEN` is the bootstrap secret: the **first** account that
uses it becomes admin, later ones are plain users an admin promotes. OAuth /
OIDC providers can be layered on top - see `.env.example`.

`AUTH_MODE=none` disables authentication entirely and serves every route as
admin. **Development and test only.** It is the only way to run without a
credential: in any other mode an empty credential stops the app at boot rather
than silently opening it up.

Sessions are issued **and** verified by this module alone. `JWT_SECRET` is a
*root secret, not a signing key*: the actual key is derived at startup with

```
key = HKDF-SHA256(JWT_SECRET, salt="ciso-suite/jwt-key/v1", info="ciso-module:phish")
```

and tokens carry `iss=ciso-phish` / `aud=ciso-module:phish`. A session minted by
any other module - another standalone deployment sharing the same secret, or a
suite module - fails both the audience *and* the signature check here.
`MODULE_NAME=phish` and `MODULE_COOKIE=phish_token` in `docker-compose.yml` are
what select that key and keep the cookie distinct; **do not remove them**.

The session cookie is `Secure` by default. It is only sent over plain HTTP when
`APP_URL` explicitly starts with `http://` - an empty or malformed value fails
secure rather than silently downgrading the session.

### Run it behind TLS in production

The container publishes plain HTTP on `8091` (`docker-compose.yml`): that is for
local use only. In production, put it **behind a TLS-terminating reverse proxy**
(nginx, Caddy, Traefik…), set `APP_URL=https://phish.your-domain`, and do not
expose port `8091` directly. Over plain HTTP the admin session cookie — and the
`AUTH_TOKEN` on first login — travel in clear text and can be captured on the
wire. This is a phishing-simulation tool: an intercepted admin session lets an
attacker send mail from your infrastructure.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | yes | Root secret, min 32 chars. Never signs anything directly (see above). |
| `DB_PASSWORD` | no | Not used - this module stores its data in SQLite. |
| `APP_URL` | yes | Public URL of the deployment. Also decides the `Secure` cookie flag. |
| `AUTH_MODE` | no | `standalone` for a local deploy. `none` disables authentication (dev only). |
| `AUTH_TOKEN` | yes | Bootstrap secret for the standalone login endpoint. |

The full list, with comments, is in `.env.example`. Runtime settings (AI
assistant, SMTP, integrations) are configured in the UI and persisted in the
database - environment variables are for deploy-time bootstrap only.

Deeper operational and security notes: [`STANDALONE.md`](./STANDALONE.md).

## Languages

**English (default)** and **French** both ship in the image; the UI opens in
the browser's language when available and users can switch at runtime (globe
icon, per-browser persistence). Missing translations fall back to English.

## Tests

End-to-end tests live in [`tests/e2e/`](./tests/e2e/) and drive a real running
stack over HTTP (standard library only, no browser required):

```bash
bash tests/e2e/run-e2e.sh          # up -> test -> down
```

See [`tests/e2e/README.md`](./tests/e2e/README.md) for running against an
instance you already started, and for the environment variables involved.

Dependency pins are checked against `constraints.txt`:

```bash
bash tests/check-deps-drift.sh
```

## Contributing

Some files in this repository are **generated** and
must not be edited here - read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before
opening a pull request.

## Security

Please report vulnerabilities privately - see [`SECURITY.md`](./SECURITY.md).
Do not open a public issue for a security problem.

## License

See [`LICENSE`](./LICENSE).

> **Not settled yet.** The sources this repository was assembled from
> contradict each other (an MIT `LICENSE` file, READMEs announcing MIT).
> [`LICENSE.TODO`](./LICENSE.TODO) states the conflict; it must be resolved
> before this repository is published.
