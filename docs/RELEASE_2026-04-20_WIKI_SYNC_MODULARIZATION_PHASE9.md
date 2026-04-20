# Release: 2026-04-20 — Wiki Sync Modularization (Phase 9)

Phase 9 deepens orchestration coverage by testing both-target execution against richer Discord fixture data.

## Scope

- Bot sync orchestration tests only.
- No runtime logic changes.
- No schema change.
- No web API contract change.

## What Changed

### Expanded `runNotionSync` fixture coverage

Updated:

- `apps/bot/src/__tests__/runNotionSyncTargets.test.ts`

The fixture now includes:

- City category + location text channel
- lore text channel
- SPC text channel
- `children-of-the-night` forum channel + profile thread
- `retired` forum channel + retired character thread
- pinned hunting-site content

### Added both-target orchestration assertion

A new test validates `runNotionSync` with both targets enabled and verifies all expected write surfaces are exercised:

- Notion database and page writes
- wiki upserts
- wiki stale-page delete path
- retired-character status updates

### Existing separation assertions retained

The same test file continues to assert:

- notion-only runs do not write to wiki
- wiki-only runs do not write to Notion

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

The sync test suite now covers target separation and combined-target orchestration behavior using realistic seeded channel/thread message shapes.
