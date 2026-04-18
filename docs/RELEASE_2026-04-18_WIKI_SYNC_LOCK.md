# Release: 2026-04-18 — Wiki Per-Page Sync Lock

## Summary

Adds a staff-controlled sync lock per wiki page so Discord/Notion bot sync can
skip selected pages during troubleshooting or manual wiki corrections.

## What Changed

### 1) Wiki page model fields

Added to `wiki_pages`:

- `sync_locked` (bool, indexed)
- `sync_locked_by` (string)
- `sync_locked_at` (datetime)

Migration:

- `apps/web/migrations/versions/c9b4e1d8f2a0_add_sync_lock_fields_to_wiki_pages.py`

### 2) Staff lock/unlock controls in wiki UI

New staff routes:

- `POST /wiki/lock/<slug>`
- `POST /wiki/unlock/<slug>`

The wiki page sidebar now shows Sync Lock status and provides lock/unlock
buttons for staff.

### 3) Bot sync API enforcement

Bot-facing wiki endpoints now enforce sync lock for existing pages:

- `POST /api/wiki/page` returns `423` when target page is locked.
- `DELETE /api/wiki/page/<slug>` returns `423` when target page is locked.

Response shape:

```json
{
  "status": "locked",
  "slug": "example-page",
  "error": "wiki page is sync-locked"
}
```

### 4) Bot-side handling

`apps/bot/src/scripts/discord-notion-sync.ts` now treats `423` responses as
intentional skips for wiki upsert/delete operations, logging informational
messages instead of warnings.

## Validation

- `pytest -q apps/web/tests/test_wiki.py`
- `npm run typecheck` (in `apps/bot`)
- `npm test -- --run src/__tests__/discordIngest.test.ts src/__tests__/wikiSyncHelpers.test.ts src/__tests__/notionWrites.test.ts src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`
- `./scripts/check-docs-parity.sh`
