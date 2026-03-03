# Monorepo CI/CD Blueprint (Free-Tier Friendly)

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
