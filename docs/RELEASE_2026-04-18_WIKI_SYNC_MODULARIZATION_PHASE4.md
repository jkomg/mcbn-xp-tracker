# Release: 2026-04-18 — Wiki Sync Modularization (Phase 4)

## Summary

Continues decomposition of `discord-notion-sync.ts` by extracting Notion page
payload builders into a dedicated module, while preserving existing sync
behavior.

## What Changed

### 1) New Notion payload builder module

Added:

- `apps/bot/src/scripts/notionSync/notionPayloadBuilders.ts`

This module now owns payload construction for Notion page creates:

- location entries
- hunting site entries
- SPC entries
- PC tracker entries
- session/post log entries

### 2) `discord-notion-sync.ts` now imports payload builders

`apps/bot/src/scripts/discord-notion-sync.ts` now calls shared builders instead
of constructing Notion page `properties`/`cover` objects inline for each flow.

### 3) New payload builder tests

Added:

- `apps/bot/src/__tests__/notionPayloadBuilders.test.ts`

Covers optional-field handling and output shape for all extracted builder
functions.

## Validation

- `npm run typecheck` (in `apps/bot`)
- `npm test -- --run src/__tests__/notionPayloadBuilders.test.ts src/__tests__/notionWrites.test.ts src/__tests__/discordIngest.test.ts src/__tests__/wikiSyncHelpers.test.ts src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`

## Follow-ups

1. Extract web wiki write wrappers (`wikiUpsert`, `wikiDelete`,
   `wikiSetCharacterStatus`) into a dedicated client module.
2. Add orchestration-level integration tests around `runNotionSync` with mocked
   Discord + web + Notion APIs.
