# Release: 2026-04-18 — Wiki Sync Modularization (Phase 2)

## Summary

Continues the `discord-notion-sync.ts` decomposition by extracting Discord
ingest/pagination helpers into a dedicated module and adding focused tests.

## What Changed

### 1) New Discord ingest module

Added:

- `apps/bot/src/scripts/notionSync/discordIngest.ts`

This module now owns:

- Discord data interfaces (`DiscordChannel`, `DiscordThread`, `DiscordMessage`,
  `DiscordGuildMember`)
- message pagination (`fetchAllMessages`)
- forum thread retrieval (`fetchForumThreads`)
- pin fetch (`fetchPins`)
- guild member lookup (`fetchGuildMember`)

### 2) `discord-notion-sync.ts` now imports ingest helpers

`apps/bot/src/scripts/discord-notion-sync.ts` now imports the ingest helpers
instead of defining these routines inline. Sync behavior remains unchanged.

### 3) New ingest tests

Added:

- `apps/bot/src/__tests__/discordIngest.test.ts`

Covers:

- paginated message fetch + oldest-first output ordering
- empty message handling
- guild-member lookup error fallback
- active/archived forum thread merge behavior and parent-forum filtering

## Validation

- `npm run typecheck` (in `apps/bot`)
- `npm test -- --run src/__tests__/discordIngest.test.ts src/__tests__/wikiSyncHelpers.test.ts src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`

## Follow-ups

1. Extract Notion write adapters/payload builders into a `notionWrites` module.
2. Extract web wiki upsert/delete/status write wrappers into a dedicated client module.
3. Add orchestration-level integration tests for `runNotionSync` with mocked Discord + web APIs.
