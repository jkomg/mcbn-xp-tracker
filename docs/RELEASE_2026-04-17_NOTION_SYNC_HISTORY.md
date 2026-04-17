# Release: 2026-04-17 Notion Sync History

## Summary

Adds persistent, operator-visible history for Notion/wiki sync lifecycle events.

## What Changed

- Added DB table `notion_sync_events` (migration + model).
- `/api/notion-sync-ack` now appends an event row on every ack (`running|success|error`, `manual|scheduled`, `run_id`, optional error).
- Settings page now shows recent sync history rows under the Notion Sync card.
- History is bounded server-side (keeps most recent 500 events).
- Bot now generates a `runId` per sync run and sends it on all ack phases so lifecycle events correlate cleanly.

## Validation

- `pytest -q apps/web/tests/test_notion_sync_ack.py apps/web/tests/test_settings_notion_sync_reset.py`
- `python3 -m py_compile apps/web/app/db.py apps/web/app/blueprints/api.py apps/web/app/blueprints/settings.py`
- `npm test -- --run src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`
