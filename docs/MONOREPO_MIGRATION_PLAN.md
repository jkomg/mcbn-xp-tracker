# Monorepo Migration Plan (Low-Risk Sequence)

## Constraints

- Keep current production behavior stable.
- Keep Cloud Run cost profile unchanged for web app.
- Avoid contract drift between web and bot.

## Phase 0: Freeze and inventory

1. Freeze bot-to-web API endpoints and payload shapes.
2. Capture current env vars for both repos.
3. Snapshot deployment commands and release process.

Deliverables:

- API endpoint map
- Environment variable matrix
- Current release checklist

## Phase 1: Repository structure

1. Create monorepo root structure (`apps`, `packages`, `infra`, `docs`).
2. Move web code into `apps/web` without behavior changes.
3. Move bot code into `apps/bot` without behavior changes.
4. Add root-level docs and workspace tooling.

Acceptance:

- Web tests pass from new path.
- Bot tests pass from new path.
- No runtime logic changes yet.

## Phase 2: Shared contracts and rules

1. Create `packages/api-contract`.
2. Move spend category enums and payload schemas into contract package.
3. Create `packages/rules` for XP formula fixtures/tests.
4. Update web and bot to import from shared packages.

Acceptance:

- Existing tests still pass.
- New contract tests pass in CI.
- No API behavior changes.

## Phase 3: CI split by paths

1. Keep required check name `test-and-lint` for branch protection continuity.
2. Add path-aware jobs:
   - Web job triggers on `apps/web/**`, `packages/**`
   - Bot job triggers on `apps/bot/**`, `packages/**`
3. Add contract test job for shared package changes.

Acceptance:

- PRs touching only bot do not run full web stack unnecessarily.
- Required check still reports green with same name.

## Phase 4: Deployment split

1. Keep web deploy on Cloud Run.
2. Run bot locally using service manager (launchd/systemd).
3. Document bot restart, logs, and token rotation.

Acceptance:

- Bot remains online after reboot/crash.
- Web deploy process unchanged from current cost profile.

Status:

- Executed (see `docs/MONOREPO_PHASE4_OPERATIONS.md`).

## Phase 5: Hardening

1. Add API token scope enforcement for bot endpoints.
2. Add replay/rate controls for bot-facing API calls.
3. Add release checklist for shared contract changes.

Acceptance:

- Breaking contract changes are blocked by tests.
- Security checklist is part of PR template/release notes.

Status:

- Executed (see `docs/MONOREPO_PHASE5_HARDENING.md`).

## Rollback strategy

- Keep old repos tagged at migration start.
- Use phased cutovers with no dual-write behavior.
- If phase fails, revert to last known stable branch and redeploy web only.

## Estimated effort

- Phase 0-1: 0.5-1.5 days
- Phase 2: 1-2 days
- Phase 3: 0.5-1 day
- Phase 4: 0.5 day
- Phase 5: 0.5-1 day

Total: ~3-6 focused engineering days depending on bot complexity and test quality.
