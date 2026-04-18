# Release: 2026-04-18 — Wiki Sync Modularization (Phase 3)

## Summary

Continues decomposition of `discord-notion-sync.ts` by extracting Notion
write/retry helpers into a dedicated module and adding focused tests.

## What Changed

### 1) New Notion writes module

Added:

- `apps/bot/src/scripts/notionSync/notionWrites.ts`

This module now owns:

- `notionCall` (retry/backoff wrapper for transient Notion API errors)
- `appendBodyBlocks` (chunked children append in batches of 100)
- `cleanupPreImportEntries` (archive pre-import rows not tagged as sync-owned)
- `SOURCE_TAG` constant and `getPageTitle` extraction helper

### 2) `discord-notion-sync.ts` imports Notion helpers

`apps/bot/src/scripts/discord-notion-sync.ts` now imports the Notion helper
functions from `notionWrites.ts` instead of defining them inline. Runtime flow
and sync behavior remain unchanged.

### 3) New Notion helper tests

Added:

- `apps/bot/src/__tests__/notionWrites.test.ts`

Covers:

- transient Notion error retry behavior
- non-transient failure passthrough
- append chunk sizing for body block writes
- pre-import cleanup archival selection and dry-run behavior

## Validation

- `npm run typecheck` (in `apps/bot`)
- `npm test -- --run src/__tests__/notionWrites.test.ts src/__tests__/discordIngest.test.ts src/__tests__/wikiSyncHelpers.test.ts src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`

## Follow-ups

1. Extract Notion page payload builders (PC/SPC/location/session) into
   reusable adapter functions.
2. Extract wiki web-API write client (`wikiUpsert` / `wikiDelete` /
   `wikiSetCharacterStatus`) into a dedicated module.
3. Add orchestration-level integration tests around `runNotionSync` with
   mocked Discord + web + Notion clients.
