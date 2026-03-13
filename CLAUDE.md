# CLAUDE.md — mcbn-xp-tracker

## Project Overview

Monorepo: Flask web app (Cloud Run) + Discord bot (Node/TypeScript, local) for managing XP and spend workflows for a game community.

```
mcbn-xp-tracker/
  apps/
    web/          # Flask app (Python 3.12) — system of record
    bot/          # Discord bot (Node 20 / TypeScript)
  packages/
    api-contract/ # Shared request/response schemas and enums
    rules/        # Shared XP/spend formulas and fixtures
  infra/
    cloudrun/     # Deploy scripts and service config
  docs/           # Runbooks, architecture, release notes
  scripts/        # Local bootstrap and ops scripts
  compose.web.yml   # Docker profile: web only
  compose.full.yml  # Docker profile: web + bot
```

## Local Development — Docker (preferred)

Bootstrap scripts handle env file creation, container naming conflicts, and startup.

### Web only

```bash
./scripts/bootstrap-local.sh web-only
```

### Web + bot (full stack)

```bash
./scripts/bootstrap-local.sh web+bot
```

### Other actions

```bash
./scripts/bootstrap-local.sh web-only logs
./scripts/bootstrap-local.sh web+bot down
./scripts/bootstrap-local.sh web+bot ps
```

Web runs at `http://127.0.0.1:5001`.
Container names: `mcbn-xp-tracker-web`, `lasombra-bot`.

## Local Development — Host (alternative)

- Web: `cd apps/web && python -m flask run --port 5001`
- Bot: `cd apps/bot && npm start`
- Host workflows remain valid; Docker profiles are additive.

## Environment / Secrets

| App | Local env file | Template |
|-----|---------------|----------|
| web | `apps/web/.env` | `apps/web/.env.example` |
| bot | `apps/bot/.env` | `apps/bot/.env.example` |
| web (prod creds) | `apps/web/credentials/service-account.json` | — |

- **Never commit `.env` files or service-account JSON.**
- In full-stack Docker, bot must use `WEB_APP_BASE_URL=http://web:5001` (not `127.0.0.1`). The bootstrap script patches this automatically.
- Details: `docs/ENV_AND_SECRETS.md`

## Production Deploy (Web)

```bash
cd apps/web
./deploy.sh     # build/push image, deploy Cloud Run revision
./setup-secrets.sh  # sync env values to GCP Secret Manager
```

Bot remains locally hosted (launchd/systemd or Docker on host).

## Bot Docker Audit Logs

```bash
cd apps/bot
npm run ops:docker:up          # start bot container
npm run ops:docker:logs        # tail logs
npm run ops:docker:usage-30d   # export 30-day usage audit
```

Log retention env vars: `BOT_LOG_MAX_SIZE` (default `25m`), `BOT_LOG_MAX_FILE` (default `120`).

## CI

`.github/workflows/ci.yml` runs path-filtered jobs:

| Job | Triggers on |
|-----|------------|
| `web-test-and-lint` | `apps/web/**`, `packages/**` |
| `bot-test-and-lint` | `apps/bot/**`, `packages/**` |
| `contract-tests` | `packages/api-contract/**`, `packages/rules/**` |
| `docker-and-docs-hygiene` | compose files, `scripts/bootstrap-local.sh`, `docs/**`, `README.md` |

The `docker-and-docs-hygiene` job validates all compose files and smoke-starts the web Docker profile.

## Architecture Principles

- `apps/web` is the authority for validation, approvals, and persistence (Turso/libsql database).
- Google Sheets is a best-effort backup mirror — synced in the background after every write, never read for primary data.
- `apps/bot` calls web API endpoints via service token — never writes to Sheets or DB directly.
- Shared packages (`packages/`) prevent category/rule drift between clients.
- Web: Cloud Run (scale to zero). Bot: always-on local process.

## Database

- **Production**: Turso (libsql) — set `DATABASE_URL=libsql+https://...` + `TURSO_AUTH_TOKEN` in env/secrets.
- **Local dev**: SQLite — default when `DATABASE_URL` is omitted or `sqlite:///data/db.sqlite`.
- Schema is created automatically on startup (`db.create_all()`); no manual migration needed for new installs.
- To migrate existing Sheets data: `cd apps/web && python scripts/migrate_sheets_to_db.py`

## Key Docs

- `docs/MONOREPO_ARCHITECTURE.md` — system boundaries and runtime model
- `docs/ENV_AND_SECRETS.md` — env and secrets flow
- `docs/RUN_WEB_DOCKER.md` — web Docker runbook
- `docs/RUN_BOT_DOCKER.md` — bot Docker runbook with audit log instructions
- `docs/INSTALL_LITE.md` / `docs/INSTALL_REGULAR.md` — install guides
- `docs/RELEASE_2026-03-13_TURSO_DB_MIGRATION.md` — latest release notes
