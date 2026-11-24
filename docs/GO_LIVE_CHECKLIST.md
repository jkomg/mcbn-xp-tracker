# Go-Live Checklist (Monorepo Migration)

> **Historical record — not a current operational backlog.** The checklist
> below was written for the March 2026 promotion of the merged web + bot
> monorepo to production. Its checkboxes are kept exactly as they were left and
> **an unchecked box does not mean work is outstanding** — nor does a checked
> one prove anything today. Several items describe a setup that no longer
> exists (a bot on a "Local Host / Pi / VM" under `systemd` or `pm2`,
> `apps/bot/.env` on that host, `npm run dev` startup tests). Do not tick them
> off or use them as a to-do list. For what to verify on a release now, use the
> next section.

## Current release verification

What follows is guidance for verifying a release against the current setup. It
is a procedure, not a record of anything having been done. The workflows are
the source of truth; if this page and a workflow disagree, the workflow wins
(`.github/workflows/ci.yml`, `deploy-web-dev.yml`, `deploy-web.yml`,
`build-bot-image.yml`).

Authoritative references:

- [CONTRIBUTING.md — Testing and Lint](../CONTRIBUTING.md#testing-and-lint) and
  [Deploy Paths](../CONTRIBUTING.md#deploy-paths) — exact gating commands and how
  each environment is triggered.
- [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md) — traps, bot hosting
  topology, stale-reference warnings.
- [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md), [ENV_AND_SECRETS.md](ENV_AND_SECRETS.md)
  and [PRODUCTION_ENV_PROFILE.md](PRODUCTION_ENV_PROFILE.md) — environments,
  secrets and the production env baseline.
- [API_ENDPOINTS.md](API_ENDPOINTS.md) and [BOT.md](BOT.md) — the endpoints and
  commands referred to below.
- [REGRESSION_HYGIENE_CHECKLIST.md](REGRESSION_HYGIENE_CHECKLIST.md) and
  [MANUAL_TEST_PLAN_CHARACTER_CREATION.md](MANUAL_TEST_PLAN_CHARACTER_CREATION.md)
  — pre/post-change checks and manual passes.
- `README.md` and `docs/RUN_LOCAL_FROM_BACKUP.md` — topology summary and
  running locally against a Turso dump.

> Two bot-runbook pages are known to lag the topology: `docs/RUN_BOT_DOCKER.md`
> still describes the primary bot as on Ursula, and the header comments and
> step summary in `build-bot-image.yml` still describe k3s/Argo CD. The bot runs
> in Docker Compose on miniplex (see below) — trust `CLAUDE.md`, `AGENTS.md` and
> `CONTRIBUTING.md` over those.

### Web release (automatic through `main`)

1. **Before merging**: the PR's required `test-and-lint` check is green *and* you
   have read which jobs actually ran — a skipped job counts as a pass. Run the
   commands in
   [Testing and Lint](../CONTRIBUTING.md#testing-and-lint) locally; a bare
   `pytest -q` is not the gate. Rebase onto `main` first: dev has one shared
   database, so a stale branch can fail to boot it.
2. **After merge**: CI runs on the `main` push, then the dev deploy, then — if the
   dev deploy for `main` succeeds — the prod deploy. Look at each run rather
   than assuming the chain completed:

   ```bash
   gh run list --workflow=ci.yml --branch main --limit 3
   gh run list --workflow=deploy-web-dev.yml --limit 3
   gh run list --workflow=deploy-web.yml --limit 3
   ```

3. **A green prod run can ship nothing.** If `main` has moved on since the dev
   deploy that triggered it, `deploy-web.yml` skips itself as "superseded" and
   still reports success. Open the run summary and confirm it says
   `Deploying <sha>` rather than `Skipped — superseded`.
4. **Check the service answers.** The dev workflow smoke-tests `/api/health`
   itself; the prod workflow only prints the service URL and does not. So check
   prod directly:

   ```bash
   curl -fsS https://mcbn.jkomg.us/api/health   # expect HTTP 200 and {"ok": true}
   ```

5. **Migrations** apply on every boot (`apps/web/entrypoint.sh`, under `set -e`).
   A deploy that fails with "container failed the configured startup probe checks"
   is usually a migration or revision problem, not an application crash — read
   the revision's container log for `Can't locate revision` before debugging
   anything else (see [AGENTS.md](../AGENTS.md)). The deploy helper retries when
   the startup probe fails, e.g. while Turso is unreachable.
6. **Settings that are workflow-defined** (prod `BOT_API_REPLAY_PROTECTION_ENABLED=true`,
   `--min-instances 0`, secret bindings) live in `deploy-web.yml`. Confirm what a
   service is actually running with `gcloud run services describe
   mcbn-xp-tracker --region us-central1` rather than from memory, and change them
   in the workflow, never with a one-off `gcloud run deploy`.
7. **OAuth redirect** values must match the callback URL the workflow sets
   (`DISCORD_REDIRECT_URI`) for each environment.

### Bot release (a deliberate second step)

Nothing in this repository deploys the bot.

1. **Image**: CI completing on `main` triggers `build-bot-image.yml`, which
   publishes `ghcr.io/jkomg/lasombra-bot:<sha7>` — but only when bot-relevant
   paths changed (`apps/bot/`, `packages/`, the wrapper Dockerfile or the
   workflow), and it will not replace a tag that already exists. Read the run
   summary: "Bot image published", "Already published", or a skipped build are
   all normal outcomes.
2. **Ship**: bump the image tag in the `home-automation` repo's
   `compose/bots/compose.yaml` and commit. Its pull-based `scripts/reconcile.sh`
   (via `stacks/stacks-miniplex.yaml`) applies it on miniplex, where the container
   is `bots-lasombra-bot-1`. Secrets live in that repo's SOPS-managed files, not
   in this one. Never scale up the held k0s Deployment: two copies of the token
   double-process every command.
3. **Verify** on miniplex: the container is running the new tag
   (`docker inspect bots-lasombra-bot-1 --format '{{.Config.Image}}'`) and its logs
   show `bot_ready` (`docker logs bots-lasombra-bot-1`).
   Then check the web side sees it: `GET /api/bot-heartbeat` (read-scoped token)
   should show an `age_seconds` within the configured heartbeat interval
   (`BOT_HEARTBEAT_INTERVAL_MS`), and `/api/bot-config` returns the flag payload.
4. **Slash-command registration** mutates live Discord state; test it on the dev
   guild first ([RUN_BOT_DEV.md](RUN_BOT_DEV.md)).

### Smoke tests worth running after a release

- `/ping` and `/xp health` (web adapter reachable) — see [BOT.md](BOT.md).
- A player-portal claim and spend submission end to end, and the web UI and bot
  agreeing on XP totals afterwards. For character creation use the numbered sets
  in [MANUAL_TEST_PLAN_CHARACTER_CREATION.md](MANUAL_TEST_PLAN_CHARACTER_CREATION.md).
- `GET /api/meta/claim-context` with the bot's read token returns the expected
  JSON shape ([API_ENDPOINTS.md](API_ENDPOINTS.md)).

### Rollback

- **Preferred**: revert the change on `main` and let the normal chain
  (CI → dev → prod) redeploy. `deploy-web.yml` also accepts `workflow_dispatch`
  and resolves it to the dispatched ref's commit with **no main-tip check**, so
  dispatching it from a feature branch puts that branch in production. Treat it
  as main-only by convention.
- **Code rollback does not undo schema.** Migrations apply forward on boot;
  see the column-drop and shared-dev traps in [AGENTS.md](../AGENTS.md) before
  planning a rollback across a migration.
- **Bot**: re-pin the previous image tag in `home-automation`'s
  `compose/bots/compose.yaml`; the workflow does not replace an existing tag
  unless a manual dispatch sets `overwrite`, but confirm the old tag still exists
  on GHCR before relying on it.
- Database recovery: [RUN_LOCAL_FROM_BACKUP.md](RUN_LOCAL_FROM_BACKUP.md)
  describes restoring from the nightly Turso dump locally; it is not a
  production restore procedure.

---

# Historical checklist (March 2026 migration)

Preserved as written. Do not treat unchecked boxes as open work. See the
banner at the top of this page.

## 1) Repository and Branch Hygiene
- [x] `main` is up to date with merged migration PRs.
- [x] Branch protection is enabled on `main` with required status checks.
- [x] No local-only files are pending (`.env*`, backup files, temp scripts).
- [x] CI checks are green on the release commit.

## 2) Secrets and Environment
- [ ] Discord bot token is rotated and current.
- [ ] `apps/bot/.env` is present on the bot host (not in git).
- [ ] Bot env values are valid:
  - [ ] `BOT_TOKEN`
  - [ ] `CLIENT_ID` (numeric Discord application snowflake)
  - [ ] `TEST_GUILD_ID` (for controlled command registration)
  - [ ] `WEB_APP_BASE_URL` (prod URL, HTTPS)
  - [ ] `WEB_APP_API_READ_TOKEN` and `WEB_APP_API_WRITE_TOKEN` (preferred)
  - [ ] `WEB_APP_API_TOKEN` unset unless intentionally using legacy fallback
- [ ] Web app prod secrets are set in GCP Secret Manager / Cloud Run env.
- [ ] `BOT_API_REPLAY_PROTECTION_ENABLED=true` in production.

## 3) Web Application Production Validation
- [x] Deploy latest release commit to Cloud Run.
- [x] Confirm custom domain mapping is healthy (`mcbn.jkomg.us`).
- [x] Confirm health endpoint:
  - [x] `GET /api/health` returns OK
- [ ] Confirm adapter endpoint used by bot:
  - [ ] `GET /api/meta/claim-context` returns expected JSON (auth if required)
- [ ] Confirm OAuth redirect URI values exactly match production callback URL.

## 4) Bot Runtime Validation (Local Host / Pi / VM)
- [ ] Bot host uses Node 20+ LTS.
- [x] Install deps and run checks:
  - [x] `npm run check` in `apps/bot`
- [ ] Startup test:
  - [ ] `npm run dev` logs `bot_ready`
  - [ ] command registration succeeds for `TEST_GUILD_ID`
- [ ] Config sync health:
  - [ ] `/api/bot-config` returns expected flag payload
- [ ] Heartbeat health:
  - [ ] `/api/bot-heartbeat` age remains within expected range after startup
- [ ] Process supervisor configured (`systemd` or `pm2`) with auto-restart.
- [ ] Logs are persisted and rotated.

## 5) Functional Smoke Tests
- [ ] `/ping` works.
- [ ] `/xp health` reports web adapter as healthy.
- [ ] `/xp summary` returns expected character data.
- [ ] `/xp submit` / `/xp claim` / `/xp spend` redirect to the player portal URL.
- [ ] Player portal claim and spend submissions succeed end-to-end.
- [ ] Web UI and bot show consistent XP totals after a test claim/spend.

## 6) Cost Guardrails (Free-Tier Focus)
- [ ] Bot remains locally hosted (not Cloud Run) unless intentionally changed.
- [ ] No Cloud SQL is provisioned for bot runtime.
- [x] Cloud Run min instances remain `0` unless explicitly required.
- [ ] Monitoring/alerts are limited to free-tier friendly defaults.

## 7) Release and Rollback
- [ ] Publish release notes summarizing migration + XP rule changes.
- [x] Tag the release commit.
- [x] Document rollback target (previous stable commit/tag).
- [ ] Validate rollback procedure in advance (deploy + smoke test).

Rollback target documented: `v2026-03-13-turso-db-migration` (current release tag: `v2026-04-20-wiki-sync-phase10`).
