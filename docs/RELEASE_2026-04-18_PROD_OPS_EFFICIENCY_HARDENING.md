# Release: 2026-04-18 — Production Ops + Efficiency Hardening

This update codifies production efficiency defaults and adds a repeatable drift check for Cloud Run service shape.

## Why

- Production wiki outage after merge of wiki sync lock changes was caused by schema drift in Turso (`wiki_pages.sync_locked*` columns missing).
- Cloud Run spend is already low, but deploy surfaces needed explicit guardrails so settings do not drift over time.

## Changes

### Cloud Run deploy defaults hardened

Both deploy paths now explicitly set the same runtime knobs:

- `cpu=1`
- `memory=256Mi`
- `min-instances=0`
- `max-instances=2`
- `concurrency=80`
- `timeout=120`
- `cpu-throttling=true`
- `session-affinity=false`

Files:

- `apps/web/deploy.sh`
- `.github/workflows/deploy-web.yml`

### Efficiency audit script added

Added:

- `scripts/check-cloudrun-efficiency.sh`

The script prints current Cloud Run runtime settings and exits non-zero when they drift from the baseline.

### Bot control-plane polling defaults tuned

Updated default bot env template values:

- `CONFIG_SYNC_INTERVAL_MS=120000` (was `60000`)
- `BOT_HEARTBEAT_INTERVAL_MS=120000` (was `60000`)

File:

- `apps/bot/.env.example`

### Ops docs and profile updates

Updated:

- `docs/PRODUCTION_ENV_PROFILE.md`
- `docs/MONOREPO_PHASE4_OPERATIONS.md`
- `docs/ENV_AND_SECRETS.md`

## Production Recovery Note (Executed)

Applied manual Turso schema reconciliation in production to recover wiki availability:

- Added `wiki_pages.sync_locked`
- Added `wiki_pages.sync_locked_by`
- Added `wiki_pages.sync_locked_at`
- Added `ix_wiki_pages_sync_locked`
- Added `notion_sync_events.run_id`
- Added `ix_notion_sync_events_run_id`
- Added missing `ix_characters_status`
- Updated `alembic_version` to `c9b4e1d8f2a0`

Post-fix verification:

- `/wiki/` -> `200`
- `/wiki/loc-downtown` -> `200`
- `/api/health` -> `200`
