# Release: 2026-04-20 — Wiki Sync Modularization (Phase 6)

Phase 6 adds explicit execution separation between Notion and Wiki targets in the sync pipeline.

## Scope

- Bot sync orchestration behavior controls.
- No schema change.
- No web API contract change.

## What Changed

### Explicit target toggles

`discord-notion-sync.ts` now supports running sinks independently:

- `--notion-only`
- `--wiki-only`

Programmatic callers can also set:

- `syncToNotion?: boolean`
- `syncToWiki?: boolean`

in `runNotionSync` options.

### Target resolution extracted

Added:

- `apps/bot/src/scripts/notionSync/syncTargets.ts`

This module resolves whether each target is active based on:

- requested target toggles
- token availability (`NOTION_TOKEN`, `WEB_APP_API_WRITE_TOKEN`)

and returns warnings for disabled requested targets.

### Fail-fast guard

If neither target is enabled for a run, the sync now exits with a clear error instead of doing silent no-op work.

## Tests

Added:

- `apps/bot/src/__tests__/syncTargets.test.ts`

Coverage includes:

- default both-target behavior
- notion-only behavior
- wiki-only behavior
- missing-token warnings
- explicit all-targets-disabled behavior

## Validation

From `apps/bot/`:

```bash
npm run check
```

From repo root:

```bash
./scripts/check-docs-parity.sh
```

## Operational Result

Sync target execution is now explicitly separated:

- Notion writes can run without wiki writes.
- Wiki writes can run without Notion writes.
- Combined runs still work as before when both targets are enabled.
