# CLAUDE.md — mcbn-xp-tracker

> **Database: Turso (libsql) is the primary production database — NOT Google Sheets.**
> Google Sheets is a best-effort backup mirror only. The app never reads from Sheets for primary data.
> See the [Database](#database) section for details.

## Project Overview

Monorepo: Flask web app (Cloud Run) + Discord bot (Node/TypeScript, local) for managing XP and spend workflows for a game community.

```
mcbn-xp-tracker/
  apps/
    web/          # Flask app (Python 3.12) — system of record
    bot/          # Discord bot (Node 20 / TypeScript)
    character-app/# React character-creator SPA, built into the web image at deploy time
  packages/
    api-contract/ # Shared request/response schemas and enums
    rules/        # Shared XP/spend formulas and fixtures
  infra/
    ursula/       # Bot host: agents, dashboard, failover (Cloud Run config lives in CI)
    bot-hosting/  # systemd / launchd unit templates for the bot
    web-hosting/  # launchd template for a local dev web instance
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
- Bot control-loop cadence can be tuned via `CONFIG_SYNC_INTERVAL_MS` and `BOT_HEARTBEAT_INTERVAL_MS` (defaults: 120000 ms each).
- Retirement automation now queues web-side jobs when a character becomes `retired`; the bot moves cubby/forum Discord content immediately and leaves wiki updates to the next successful batch sync.
- Wiki sync manual run in Settings is capability-gated by bot heartbeat state (`BOT_LIVE_WIKI_SYNC_CAPABLE`) and requires the bot's `DISCORD_GUILD_ID` capability. The current runtime performs Discord-to-Chronicle-Wiki sync; older Notion references are historical.
- Details: `docs/ENV_AND_SECRETS.md`

## Production Deploy (Web)

```bash
cd apps/web
./setup-secrets.sh  # sync env values to GCP Secret Manager
./deploy.sh         # trigger prod deploy workflow (workflow_dispatch, needs gh)
./deploy.sh dev     # trigger dev deploy workflow from the current branch
```

`deploy.sh` no longer builds or deploys anything itself — it only triggers the
GitHub Actions workflow. The workflows are the single source of truth for image
build, Cloud Run resource flags, env vars, and secret bindings; do not add a
second `gcloud run deploy` invocation anywhere.

Deploys are normally automatic, not run by hand. GitHub Actions chains them:
CI passing on **any branch** deploys to dev (`deploy-web-dev.yml` has no branch
filter — dev is shared, and a feature-branch push replaces what's deployed
there); a dev deploy succeeding **on `main`** then gates prod; the bot
redeploys on CI passing **on `main`** via a self-hosted runner on Ursula. See
[CONTRIBUTING.md](CONTRIBUTING.md#deploy-paths).

Current deployment topology: production web runs on Cloud Run service
`mcbn-xp-tracker` at `mcbn.jkomg.us`; dev web runs on the separate Cloud Run service
`mcbn-xp-tracker-dev` at `dev.mcbn.jkomg.us`. Both use Turso, with separate production
and dev databases/credentials. The Discord bot runs in Docker on Ursula, with a
heartbeat-triggered failover bot on little-mac. Kubernetes manifests under
`apps/*/k8s/` are migration preparation only and are not current production infrastructure.

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
- **Schema changes**: edit `app/db.py`, then `cd apps/web && FLASK_APP=app:create_app flask db migrate -m "description"`, review the file in `migrations/versions/`, then `flask db upgrade`. Commit the migration with your code. See `apps/web/migrations/README` for details.

## Key Docs

- `CONTRIBUTING.md` — **development rules and paths**: required toolchain versions, local setup, the exact test/lint commands CI gates on, migration workflow, branch/PR conventions, deploy paths per environment
- `docs/REGRESSION_HYGIENE_CHECKLIST.md` — pre/post-change checklist; every item traces to a real incident
- `docs/API_ENDPOINTS.md` — bot-facing API reference (auth, all routes, request/response schemas)
- `docs/MONOREPO_ARCHITECTURE.md` — system boundaries and runtime model
- `docs/ENV_AND_SECRETS.md` — env and secrets flow
- `docs/RUN_WEB_DOCKER.md` — web Docker runbook
- `docs/RUN_BOT_DOCKER.md` — bot Docker runbook with audit log instructions
- `docs/RUN_BOT_DEV.md` — running a second, dev-only bot against a test Discord server + dev web dashboard
- `docs/INSTALL_LITE.md` / `docs/INSTALL_REGULAR.md` — install guides
- `docs/RELEASE_2026-03-13_TURSO_DB_MIGRATION.md` — Turso DB migration release notes
- `docs/RELEASE_2026-03-16_BOT_HEALTH_AND_FIXES.md` — bot health monitoring, cubby monitor fix, sidebar pin, Docker ARM64 fixes
- `docs/RELEASE_2026-04-17_SYNC_CONTROL_PLANE_HARDENING.md` — source-aware sync acks, stale reset controls, and shared sync config constants
- `docs/RELEASE_2026-04-17_NOTION_SYNC_HISTORY.md` — persisted sync events with run-level settings summaries (started/finished/duration/final status)
- `docs/RELEASE_2026-04-07_BROADCAST_AND_SCHEDULER_FIX.md` — staff broadcast overhaul, passage-of-time scheduler fix, MONOREPO_ROOT Docker fix
- `docs/RELEASE_2026-04-21_BACKGROUNDS_GHOUL_DISCIPLINE_WIKI_OPS.md` — background blanking, Ghoul Discipline spend, error dismissal, wiki bulk delete + sync block tombstones, migration safety fixes
- `docs/RELEASE_2026-05-20_CHARACTER_APPROVAL_WORKFLOW.md` — character approval workflow: /lasombra approve, edit, update, delete; full roster API
- `docs/RELEASE_2026-06-18_COTERIE_SYSTEM.md` — full coterie lifecycle: player proposal/formation, background donation, XP spend donation, domain ratings, /coterie status bot command, CC schema v7 backgrounds field
- `docs/RELEASE_2026-07-10_SETTINGS_CONTROL_PANEL.md` — Settings page control-panel redesign: left sub-nav, cross-section search, grouped channel IDs with "used by" badges, Integrations values + why-change copy
- `docs/RELEASE_2026-07-10_SCENE_REQUESTS.md` — **latest release notes** (`/scene request` queue: player asks for a scene with an SPC, ST Claim/Reject buttons with atomic claim + cubby-channel outcome notification)
