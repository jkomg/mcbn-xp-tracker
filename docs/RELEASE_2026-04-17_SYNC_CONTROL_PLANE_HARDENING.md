# Release: 2026-04-17 Sync Control Plane Hardening

## Summary

This release hardens the bot/web/wiki sync control plane to prevent overlapping
runs, preserve manual staff intent when scheduled syncs fire, and recover from
stuck `running` states in Settings.

## What Changed

### 1) Shared sync lock in bot runtime

- Added `apps/bot/src/services/wikiSyncLock.ts`.
- Both manual (`ConfigSyncWorker`) and scheduled (`WikiSyncScheduler`) sync
  paths now acquire the same lock before running.
- Competing trigger attempts now skip with lock-busy logs instead of running
  concurrently.

### 2) Source-aware Notion sync acknowledgements

- Bot adapter now sends `source` with `/api/notion-sync-ack`:
  - `manual` for staff-triggered runs
  - `scheduled` for nightly runs
- Web ack endpoint now validates and stores source (`BOT_NOTION_SYNC_SOURCE`).
- Only `source=manual` + `status=running` clears `BOT_NOTION_SYNC_REQUESTED`.
  This prevents scheduled runs from consuming pending manual requests.

### 3) Nightly scheduler behavior tightened

- Nightly scheduled sync now defaults to wiki-only refresh to avoid repeated
  Notion archival imports.
- Scheduler still reports lifecycle state to web for operator visibility.

### 4) Stale running-state recovery in Settings

- Added stale threshold setting:
  - `BOT_NOTION_SYNC_STALE_AFTER_SECONDS` (default `3600`).
- Settings now marks long-running syncs as `Stale` and stops auto-refresh loops.
- Added admin route:
  - `POST /settings/reset-notion-sync`
  - Clears `BOT_NOTION_SYNC_*` state keys so staff can safely requeue.

### 5) Documentation + test coverage updates

- Updated docs:
  - `docs/API_ENDPOINTS.md`
  - `docs/BOT.md`
  - `docs/WEB_APP.md`
  - `docs/ENV_AND_SECRETS.md`
- Added tests:
  - `apps/web/tests/test_notion_sync_ack.py`
  - `apps/web/tests/test_settings_notion_sync_reset.py`

## Validation

- `pytest -q apps/web/tests/test_notion_sync_ack.py apps/web/tests/test_settings_notion_sync_reset.py`
- `pytest -q apps/web/tests/test_bot_heartbeat.py`
- `python3 -m py_compile apps/web/app/blueprints/api.py apps/web/app/blueprints/settings.py apps/web/app/app_settings.py apps/web/config.py`
- `npm run typecheck` (in `apps/bot`)

## Follow-ups

1. Add bot tests for `ConfigSyncWorker` + `WikiSyncScheduler` lock and ack edge cases.
2. Split `discord-notion-sync.ts` into smaller modules (Discord ingest, Notion import, wiki upsert, cleanup).
3. Add operator-visible run history table instead of single current status keys.
