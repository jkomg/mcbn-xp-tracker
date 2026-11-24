# Contributing

Thanks for your interest in contributing.

## Before You Start

- Read [README.md](README.md) for architecture, and [docs/MONOREPO_ARCHITECTURE.md](docs/MONOREPO_ARCHITECTURE.md) for system boundaries.
- **Working as a coding agent, or delegating to one?** Start with
  [AGENTS.md](AGENTS.md) — it front-loads the traps in this repo that cannot be
  inferred from the code. To hand a task to Codex, use
  [docs/CODEX_TASK_BRIEF.md](docs/CODEX_TASK_BRIEF.md).
- Check open issues and existing PRs to avoid duplicate work.
- For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

> **Read this first if you are pushing a branch:** a branch push on its own runs
> no CI and deploys nothing — CI for any branch other than `main` runs only
> through an open PR. But once a PR is open, **every CI run on it that passes
> deploys to the shared dev site** at `dev.mcbn.jkomg.us`, before review and on
> any branch. See [Deploy paths](#deploy-paths) below.

## Repository Layout

This is a monorepo. Almost every command below is run from an **app directory**,
not the repo root.

| Path | What it is | Language |
|------|-----------|----------|
| `apps/web/` | Flask app — system of record, staff + player portal | Python 3.12 |
| `apps/bot/` | Discord bot ("Lasombra") | Node 20.11+ / TypeScript |
| `apps/character-app/` | React character-creator SPA, built into the web image | TypeScript |
| `packages/api-contract/` | Shared spend categories | JSON |
| `packages/rules/` | Shared XP cost formulas | JSON |
| `infra/`, `scripts/`, `docs/` | Deploy config, ops scripts, runbooks | — |

## Required Toolchain

| Tool | Version | Enforced by |
|------|---------|-------------|
| Python | **3.12** | `.github/workflows/ci.yml`, `apps/web/Dockerfile` |
| Node (bot) | **20.11+** | `apps/bot/package.json` (`engines`) |
| Node (character app) | **22+** | `apps/character-app/package.json` (`engines`), `.github/workflows/ci.yml`, `apps/web/Dockerfile` (`spa-builder` stage) |
| ruff | **pinned — see below** | `.github/workflows/ci.yml` |

Python 3.9 (the macOS system Python) **will not work** — several dependencies
require 3.12. On macOS a bare `python3` may be that 3.9: use an explicit
`python3.12` (check `python3.12 --version`) rather than assuming `python3` is
the right interpreter.

> **Never copy a `venv/` between machines or check one into git.** A virtualenv
> hardcodes an absolute path to the interpreter that created it, so a copied
> `venv/` breaks with a confusing `no such file or directory` on its own
> `bin/python`. If that happens, delete it and recreate it with the steps below.

## Local Setup

### Docker (preferred)

Handles env files, container naming, and startup for you:

```bash
./scripts/bootstrap-local.sh web-only     # web only
./scripts/bootstrap-local.sh web+bot      # full stack
```

Web runs at `http://127.0.0.1:5001`. See [docs/RUN_WEB_DOCKER.md](docs/RUN_WEB_DOCKER.md).

### Host — web

```bash
cd apps/web
python3.12 -m venv venv                   # must be 3.12
./venv/bin/pip install -r requirements.txt
cp .env.example .env                      # per-app; the ROOT .env.example is only a pointer
./venv/bin/python -m flask run --port 5001
```

### Host — bot

```bash
cd apps/bot
npm ci
cp .env.example .env
npm start
```

In full-stack Docker the bot must use `WEB_APP_BASE_URL=http://web:5001`, not
`127.0.0.1` — `bootstrap-local.sh` patches this automatically.

Secrets and env flow: [docs/ENV_AND_SECRETS.md](docs/ENV_AND_SECRETS.md).

## Testing and Lint

CI gates on these exact commands (`.github/workflows/ci.yml`). Run them before
opening a PR — not approximations of them.

### Web (`apps/web`)

```bash
cd apps/web
./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30
./venv/bin/python -m pip install ruff==0.15.20
./venv/bin/ruff check app tests
./venv/bin/python -m compileall app tests
```

CI runs the same checks from the repo root with `apps/web/`-prefixed paths, in
this order: `ruff check`, `pytest` with the coverage gate (from `apps/web`), then
`python -m compileall apps/web/app apps/web/tests`. CI installs
`apps/web/requirements-lock.txt` plus `pytest-cov`, `mypy` and `types-requests`;
local setup above uses `requirements.txt`, which also provides `pytest` and
`pytest-cov`.

Things that bite people:

- **Coverage gate**: CI fails under **30%** coverage. A bare `pytest -q` passes
  locally while CI fails.
- **`compileall` is blocking and not redundant with pytest.** Pytest imports
  only what the tests reach, so a syntax error in an unimported module passes
  locally and fails CI.
- **Pin ruff to `0.15.20`.** An unpinned install picks up whatever is newest,
  and a new ruff release can enable new default rules that fail CI with no code
  change — this happened on 2026-07-23 (ruff 0.16.0, 207 new violations). CI
  pins the version; match it locally or you will chase phantom findings.

CI also runs `mypy`, but it is **informational and non-blocking**.

### Bot (`apps/bot`)

```bash
cd apps/bot
npm run check    # lint → format:check → typecheck → test → build
```

This single command is what CI gates on. Don't skip typecheck.

### Character app (`apps/character-app`)

Node **22**, not 20:

```bash
cd apps/character-app
npm ci
npm run lint && npm run test:run && npm run typecheck && npm run build
npx playwright install --with-deps chromium && npm run test:e2e
```

`typecheck` and `test:e2e` are separate blocking CI steps — `npm run build` is
Vite only and does not type-check. The E2E run needs a Playwright browser
installed, so it is the slow one; run it before pushing anything touching this
app. `npm run e2e:live` is a different, manual suite against a real deployment
and is not a CI gate.

### Shared contract (`packages/`)

When `packages/api-contract/**` or `packages/rules/**` changes, CI also
validates both JSON files with `python -m json.tool` and runs the web and bot
contract tests (`apps/web`: `pytest -q tests/test_shared_contract.py`; `apps/bot`:
`npm run test -- src/__tests__/sharedContract.test.ts`).

### Docs and compose hygiene

When the paths below change, CI validates the four compose files with
`docker compose ... config -q`, smoke-builds and starts the `compose.web.yml`
profile, and runs `./scripts/check-docs-parity.sh`. You can run the parity
script yourself without Docker:

```bash
./scripts/check-docs-parity.sh
```

### Which CI jobs run

`ci.yml` runs on every `pull_request`, on `push` to `main`, and on
`workflow_dispatch`. Jobs are path-filtered, and all of them roll up into a
single required `test-and-lint` check. That check fails only when a job
*failed or was cancelled* — a skipped job counts as a pass, so a change that
matches no filter is still a green check.

| Job | Triggers on |
|-----|------------|
| `web-test-and-lint` | `apps/web/**`, `packages/**` |
| `bot-test-and-lint` | `apps/bot/**`, `packages/**` |
| `character-app-test-and-lint` | `apps/character-app/**`, `packages/**` |
| `contract-tests` | `packages/api-contract/**`, `packages/rules/**` |
| `docker-and-docs-hygiene` | `apps/character-app/**`, `packages/**`, `apps/web/Dockerfile`, `compose.web.yml`, `compose.full.yml`, `apps/web/docker-compose.yml`, `apps/bot/docker-compose.yml`, `apps/bot/k8s/**`, `apps/web/k8s/**`, `scripts/bootstrap-local.sh`, `scripts/check-docs-parity.sh`, `README.md`, `docs/**` |
| `deploy-workflow-tests` | `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-web-dev.yml`, `scripts/cloud-run-deploy-retry.sh`, `scripts/test-deploy-workflow-helper.rb` |

Editing `.github/workflows/ci.yml` itself triggers every job.

Editing anything in `packages/` triggers the `web`, `bot`, `character-app` and
`docker-and-docs-hygiene` jobs, plus `contract-tests` when the change is under
`packages/api-contract/` or `packages/rules/`. Both apps load those JSON files at runtime, the
character app's drift guards assert against them, and the web image's Docker
build bakes them in. Validate every consumer locally, not just the one you were
editing for.

## Database Migrations

The database is **Turso (libsql)** in production and dev; local dev defaults to
SQLite. Google Sheets is a best-effort backup mirror only — never a read source.

To change the schema:

```bash
# 1. Edit apps/web/app/db.py
cd apps/web
FLASK_APP=app:create_app ./venv/bin/flask db migrate -m "description"
# 2. REVIEW the generated file in migrations/versions/ — do not trust it blindly
./venv/bin/flask db upgrade
# 3. Commit the migration alongside your code change
```

Two footguns:

- `db.create_all()` runs before Alembic's autogenerate diff on every boot, so a
  `CREATE TABLE` migration autogenerates an **empty body** against a fresh
  database. Such migrations need a hand-written `_table_exists` guard.
- Migrations are applied **automatically on every deploy** by
  `apps/web/entrypoint.sh` before gunicorn starts. A bad migration takes the
  service down on boot — review the generated file.

See `apps/web/migrations/README`.

## Branching and PRs

- Branch from `main`. Use a `type/short-description` prefix, matching existing
  history: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`.
- Keep PRs focused and reasonably small.
- Include tests for behavior changes.
- Update `CHANGELOG.md` and any affected `docs/` page for user-visible changes.
- Commit messages: short imperative summaries, e.g. `Fix advantage cost for
  0->2 purchases`, `Add CSRF protection to staff forms`.

## Deploy Paths

Deploys are chained GitHub Actions `workflow_run` triggers, not manual steps.
The workflows themselves (`.github/workflows/ci.yml`, `deploy-web-dev.yml`,
`deploy-web.yml`, `build-bot-image.yml`) are the source of truth; read them
before describing this to anyone.

| Environment | Service | Trigger |
|------------|---------|---------|
| **Dev web** | Cloud Run `mcbn-xp-tracker-dev` (`dev.mcbn.jkomg.us`) | A **CI run completing successfully**, on any branch (no branch filter) |
| **Prod web** | Cloud Run `mcbn-xp-tracker` (`mcbn.jkomg.us`) | A dev deploy run for **`main`** completing successfully |
| **Bot image** | `ghcr.io/jkomg/lasombra-bot:<sha7>` (published, *not* deployed) | CI completing successfully **on `main`**, when bot-relevant paths changed |

The bot row is not a deploy. `lasombra-bot` runs in Docker Compose on miniplex,
defined in the `home-automation` repo and applied by its pull-based reconciler,
and images there are pinned by commit SHA. So `build-bot-image.yml` only publishes
the image; to ship it, bump the tag in that repo's `compose/bots/compose.yaml`
and commit. (It ran on k0s under Argo CD from 2026-08-28 to 2026-10-25; that
Deployment is held at `replicas: 0`.) The old "Deploy Bot to Ursula" workflow was
removed on 2026-08-29 — after the migration it would have started a *second*
live bot on Ursula holding the same Discord gateway session as the pod.

`build-bot-image.yml` skips the build when nothing the bot ships changed since
the last image it built (it compares against `apps/bot/`, `packages/`,
`.github/docker/Dockerfile.packages` and the workflow itself), and it will not
replace a tag that already exists unless a manual dispatch sets `overwrite`.
So a `main` commit that touches none of those paths has **no** image of its
own. One caveat on what that workflow *says*: its header comments and its
"Summarise the bump this needs" step summary still describe k3s/Argo CD and
`cluster/apps/lasombra-bot/deployment.yaml`. Those are stale — the Compose file
in `home-automation` named above is where the tag is bumped.

Read the dev row carefully: `deploy-web-dev.yml` has **no branch filter**, so any
CI run that passes redeploys the shared dev service and posts a Discord
notification — before review, on any branch. This is deliberate (it lets you
test a PR on real infrastructure pre-merge), but it means **dev is shared**:
coordinate before pushing work-in-progress if someone else is testing there.
Where [docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md) differs on whether a
PR must be open, this section and the workflows are correct.

What this does *not* mean is that a bare branch push deploys. `ci.yml` triggers
on `pull_request`, on `push` to `main` only, and on `workflow_dispatch`. **A
branch pushed with no open PR runs no CI and deploys nothing** — so it is also
completely unvalidated. Open the PR. From then on, each push to the PR branch
runs CI, and each CI run that completes successfully redeploys dev.

On `main`, a passing CI run deploys dev, and a successful dev deploy for `main`
then triggers the prod workflow. That run builds the SHA it takes from the
triggering `workflow_run` event (not whatever `main` points at now) and **skips
itself as "superseded"** when that SHA is no longer the tip of `main`, since the
newer commit has its own chain. A skipped run is green but ships nothing — check the run summary before
assuming a green prod workflow means that commit is live. Prod deploys do not
overlap (`concurrency: deploy-web-prod`).

### Rebase before you push, or dev will fail to boot

**Dev has one database, shared by every branch that deploys to it.** Because
`entrypoint.sh` runs `flask db upgrade` under `set -e` before gunicorn starts,
a branch whose `migrations/versions/` is missing the revision the dev database
is currently stamped at cannot boot at all: Alembic can't locate the current
revision, the entrypoint exits, nothing listens on `$PORT`, and the deploy
fails with

```
ERROR: (gcloud.run.deploy) The user-provided container failed the
configured startup probe checks.
```

This looks like an application crash but is really a stale branch. If someone
merges a migration to `main` after you branched, **rebase onto `main` and
force-push** — that is the fix, not a retry:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

The same failure mode hits prod only via `main`, which is always at head, so
this is specifically a dev/PR-branch hazard.

Prod is reachable **automatically** only through `main`. Nothing here
redeploys the bot: see the bot-image row above.

The manual path is not constrained the same way. `deploy-web.yml`'s `branches:
[main]` filter applies only to its `workflow_run` trigger; its job condition
accepts `workflow_dispatch` unconditionally and resolves the image to
`github.sha`, so `gh workflow run deploy-web.yml --ref <branch>` deploys that
branch to production. Nothing enforces main for a dispatch — treat it as
main-only by convention, or add the check.

**The workflows are the single source of truth** for image build, Cloud Run
resource flags, env vars, and secret bindings. `apps/web/deploy.sh` only
*triggers* a workflow via `workflow_dispatch` (it needs the `gh` CLI); it does
not deploy anything itself. Never add a second `gcloud run deploy` invocation —
two definitions of one service drift, and `--set-env-vars` silently removes any
env var it does not list.

Environment details: [docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md).
The bot's host is **not** configured from this repo: it is Docker Compose on
miniplex, defined in `home-automation`. `infra/ursula/` (including its
`failover/`) describes the pre-2026-08 host and `apps/*/k8s/` manifests are
not what anything runs — treat both as historical.

## Coding Guidelines

- Prefer clear, explicit logic over clever shortcuts.
- **`apps/web` is the authority** for validation, approvals, and persistence.
  The bot calls web API endpoints with a service token — it never writes to the
  database or Sheets directly.
- Keep route handlers thin. Put persistence logic in `app/db_service.py`
  (authoritative) and mirror logic in `app/sheets_sync.py` (best-effort backup).
- **Put shared rules in `packages/`, not in one app.** XP formulas and spend
  categories live in `packages/rules/xp_costs.json` and
  `packages/api-contract/spend_categories.json`, loaded by both apps. Adding a
  category is usually a JSON edit, not new formula code — duplicating a formula
  in one app is how the two clients drift apart.
- Validate all external input server-side. Never trust client-supplied identity
  or state (character ownership, coterie membership) — re-check it server-side.
- Pair every database write with an audit-log entry, and check whether it needs
  a Sheets-mirror counterpart. This is a convention, not something the type
  system enforces; a missing pairing compiles fine and looks done.

Before non-trivial changes, skim
[docs/REGRESSION_HYGIENE_CHECKLIST.md](docs/REGRESSION_HYGIENE_CHECKLIST.md) —
every item in it traces to something that actually broke.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
