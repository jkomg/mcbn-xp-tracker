# Release: 2026-04-18 — Wiki Sync Modularization (Phase 1)

## Summary

Starts decomposing `apps/bot/src/scripts/discord-notion-sync.ts` by extracting
wiki-focused pure helpers into a dedicated module, without changing sync
behavior.

## What Changed

### 1) New helper module for wiki sync content/taxonomy logic

Added:

- `apps/bot/src/scripts/notionSync/wikiSyncHelpers.ts`

This module now owns:

- slug helpers (`slugify`, `wikiSlug`)
- Discord markdown cleanup (`sanitizeDiscordMarkdown`)
- wiki markdown body rendering (`messagesToMarkdown`)
- SPC type inference (`inferSpcType`)
- location domain normalization (`mapDomain`)
- coterie/faction wiki taxonomy constants
  (`COTERIE_MEMBERS`, `CHAR_TO_COTERIE`, `FACTIONS`)

### 2) `discord-notion-sync.ts` now imports shared helpers

`apps/bot/src/scripts/discord-notion-sync.ts` was updated to import and reuse
the extracted helpers instead of defining them inline. Runtime flow remains the
same.

### 3) New helper tests

Added:

- `apps/bot/src/__tests__/wikiSyncHelpers.test.ts`

Covers slug generation, markdown sanitization, markdown rendering, SPC typing,
domain mapping, and reverse coterie membership map behavior.

## Validation

- `npm run typecheck` (in `apps/bot`)
- `npm test -- --run src/__tests__/wikiSyncHelpers.test.ts src/__tests__/configSyncWorker.test.ts src/__tests__/wikiSyncScheduler.test.ts`

## Follow-ups

1. Extract Discord ingest and fetch routines into a separate module.
2. Extract Notion write adapters and page upsert payload builders.
3. Add integration tests that exercise `runNotionSync` with mocked Discord and
   web API responses end-to-end.
