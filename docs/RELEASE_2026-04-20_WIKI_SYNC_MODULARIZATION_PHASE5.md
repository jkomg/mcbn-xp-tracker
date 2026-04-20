# Release: 2026-04-20 — Wiki Sync Modularization (Phase 5)

Phase 5 extracts web wiki write calls from sync orchestration into a dedicated client module.

## Scope

- Bot-only maintainability refactor.
- No schema change.
- No API contract change.
- No intended behavior change.

## What Changed

### New module: Web wiki client

Added:

- `apps/bot/src/scripts/notionSync/webWikiClient.ts`

This module now owns the bot-side calls to web wiki/status endpoints:

- `POST /api/wiki/page`
- `DELETE /api/wiki/page/{slug}`
- `PUT /api/character/{name}/status`

It preserves existing semantics:

- skip on dry-run or missing write token
- `423` sync-lock handling for wiki upsert/delete
- non-fatal warnings on HTTP/network failures
- best-effort status updates for retired characters

### Orchestration update

Updated:

- `apps/bot/src/scripts/discord-notion-sync.ts`

`runNotionSync` now creates a `WebWikiClient` once and calls:

- `wikiClient.upsertPage(...)`
- `wikiClient.deletePage(...)`
- `wikiClient.setCharacterStatus(...)`

### New tests

Added:

- `apps/bot/src/__tests__/webWikiClient.test.ts`

Covered behaviors:

- dry-run no-op behavior
- lock skip logs (`423`) for upserts/deletes
- `404`/`423`/`200` delete handling
- status update warnings for non-404 failures
- network error logging paths

## Validation

From `apps/bot/`:

```bash
npm run typecheck
npm run test -- src/__tests__/webWikiClient.test.ts
```

## Follow-On

`runNotionSync` is now split across helper modules for:

- Discord ingest
- Notion writes
- Notion payload builders
- Wiki helper taxonomy/rendering
- Web wiki API writes

Next maintainability slice can target higher-level orchestration decomposition and integration-style sync tests.
