# Release: 2026-04-20 — Wiki Sync Modularization (Phase 8)

Phase 8 improves sync runtime efficiency by skipping disabled-target work during execution.

## Scope

- Bot sync orchestration runtime behavior.
- No schema change.
- No web API contract change.

## What Changed

### Skip wiki-only work when Wiki target is disabled

`discord-notion-sync.ts` now explicitly gates wiki-only operations behind `WIKI_ENABLED` instead of relying on no-op write token behavior in the wiki client.

This now skips:

- location wiki upserts in the hunting-site pass
- SPC/PC/lore wiki page writes
- stale lore cleanup deletes
- coteries and factions page generation
- retired character wiki/status updates
- children-of-the-night profile-map fetch used for wiki character enrichment

### Corrected write-count logs

Coteries/factions completion logs now report the actual number of pages written during the run.

### Expanded orchestration target tests

Updated:

- `apps/bot/src/__tests__/runNotionSyncTargets.test.ts`

New fixture-backed assertions verify:

- notion-only runs perform no wiki write/delete/status calls
- wiki-only runs perform no Notion write calls while still executing wiki writes

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

Target separation is now both semantic and runtime-efficient: disabled targets are skipped earlier, reducing unnecessary sync work.
