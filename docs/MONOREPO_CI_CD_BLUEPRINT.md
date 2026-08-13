# Monorepo CI/CD Blueprint (Free-Tier Friendly)

> **⚠️ HISTORICAL DESIGN DOC — not current behavior.** This was the plan written
> during the monorepo migration. What actually got built differs in several
> material ways: deploys chain off `workflow_run` rather than path-filtered
> pushes, the bot deploys automatically via a self-hosted GitHub Actions runner
> on Ursula (not a manual `git pull` + `systemctl restart`), `infra/cloudrun/`
> never held any deploy config and has been removed, and the per-app release
> tag scheme below was never adopted. For current behavior see [CONTRIBUTING.md](../CONTRIBUTING.md#deploy-paths)
> and [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md). The CI job/path-filter strategy
> below *was* implemented and is still accurate.

## Objectives

- Keep branch protection stable (`test-and-lint` required check).
- Reduce unnecessary CI minutes with path-aware jobs.
- Keep production deployment split: web on Cloud Run, bot local.

## CI strategy

Use one workflow with three internal jobs:

1. `web-test-and-lint` for `apps/web/**` + `packages/**`
2. `bot-test-and-lint` for `apps/bot/**` + `packages/**`
3. `contract-tests` for `packages/api-contract/**` and `packages/rules/**`

Then create a final aggregate job named `test-and-lint` that depends on the above and always runs to preserve current protected-branch expectations.

## Example trigger filter

```yaml
on:
  pull_request:
  push:
    branches: [main]
```

Use `dorny/paths-filter` (or equivalent) to gate jobs by changed paths.

## Deployment strategy

### Web

- Keep existing `deploy.sh` and Cloud Run service.
- Trigger only on changes in `apps/web/**`, `packages/**`, `infra/cloudrun/**`.

### Bot

- No cloud deployment by default.
- Local host pull + restart workflow:
  - `git pull`
  - `npm ci`
  - `npm run build`
  - `systemctl restart mcbn-tracker-bot` (or launchctl equivalent)

## Release policy

Tag format:

- `web-vYYYY.MM.DD.N`
- `bot-vYYYY.MM.DD.N`
- `shared-vYYYY.MM.DD.N`

Each release note should include:

- affected app(s)
- contract changes
- migration or rollback notes

## Cost controls

- Keep CI fast with path filters and dependency caching.
- Avoid running web integration tests on bot-only PRs.
- Keep bot off Cloud Run unless operational requirements force it.
