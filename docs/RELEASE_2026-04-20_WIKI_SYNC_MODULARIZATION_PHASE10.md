# Release: 2026-04-20 — Wiki Sync Modularization (Phase 10)

Phase 10 adds golden-style assertions for generated Notion payloads and wiki body output in sync orchestration tests.

## Scope

- Bot sync test hardening only.
- No runtime behavior changes.
- No schema change.
- No web API contract change.

## What Changed

### Deterministic Notion payload assertions

Updated:

- `apps/bot/src/__tests__/runNotionSyncTargets.test.ts`

The test now uses deterministic payload-builder spies and asserts concrete generated values in both-target runs, including:

- location payload uses `locationName: Broadway`
- hunting payload uses `siteName: Site One`
- SPC payload uses `name: SPC Name`
- session payload includes archive and retired-thread titles

### Concrete wiki output assertions

The same orchestration test now verifies wiki upsert payload shape/content, including:

- expected slug/category/title for location/character/lore pages
- expected SPC body markdown
- expected location body sections (Hunting Sites heading + site content)

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

`runNotionSync` tests now protect not only execution paths but also key generated page payload/body semantics for combined-target runs.
