# Release: 2026-04-20 — Wiki Sync Modularization (Phase 7)

Phase 7 adds direct orchestration tests around `runNotionSync` target gating behavior.

## Scope

- Bot sync orchestration test coverage.
- No runtime behavior changes.
- No schema change.
- No web API contract change.

## What Changed

### Added direct `runNotionSync` target tests

Added:

- `apps/bot/src/__tests__/runNotionSyncTargets.test.ts`

Coverage includes:

- fail-fast when no sync targets are enabled
- Notion-only target execution wiring
- Wiki-only target execution wiring

### External dependencies are mocked

The new tests mock Discord REST, Notion client construction, and wiki client construction so they can validate orchestration gating semantics without live API calls.

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

The target-separation work from phase 6 now has direct orchestration-level regression coverage in addition to helper-level unit coverage.
