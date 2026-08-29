# Contributing

Thanks for your interest in contributing.

## Before You Start

- Read [README.md](README.md) for architecture, and [docs/MONOREPO_ARCHITECTURE.md](docs/MONOREPO_ARCHITECTURE.md) for system boundaries.
- Check open issues and existing PRs to avoid duplicate work.
- For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

> **Read this first if you are pushing a branch:** every push that passes CI
> deploys to the **shared dev site** at `dev.mcbn.jkomg.us` — on *any* branch,
> with or without an open PR. See [Deploy paths](#deploy-paths) below.

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
| Node | **20.11+** | `apps/bot/package.json` (`engines`) |
| ruff | **pinned — see below** | `.github/workflows/ci.yml` |

Python 3.9 (the macOS system Python) **will not work** — several dependencies
require 3.12.

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

CI gates on these exact commands. Run them before opening a PR.

### Web (`apps/web`)

```bash
cd apps/web
./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30
./venv/bin/python -m pip install ruff==0.15.20
./venv/bin/ruff check app tests
```

Two things that bite people:

- **Coverage gate**: CI fails under **30%** coverage. A bare `pytest -q` passes
  locally while CI fails.
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

### Which CI jobs run

Jobs are path-filtered, and all of them roll up into a single required
`test-and-lint` check:

| Job | Triggers on |
|-----|------------|
| `web-test-and-lint` | `apps/web/**`, `packages/**` |
| `bot-test-and-lint` | `apps/bot/**`, `packages/**` |
| `contract-tests` | `packages/api-contract/**`, `packages/rules/**` |
| `docker-and-docs-hygiene` | compose files, `scripts/bootstrap-local.sh`, `docs/**`, `README.md` |

Editing anything in `packages/` triggers **both** app suites, because both apps
load those JSON files at runtime.

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

| Environment | Service | Trigger |
|------------|---------|---------|
| **Dev web** | Cloud Run `mcbn-xp-tracker-dev` (`dev.mcbn.jkomg.us`) | CI passing on **any branch** |
| **Prod web** | Cloud Run `mcbn-xp-tracker` (`mcbn.jkomg.us`) | Dev deploy succeeding **on `main`** |
| **Bot image** | `ghcr.io/jkomg/lasombra-bot:<sha7>` (published, *not* deployed) | CI passing **on `main`** |

The bot row is not a deploy. `lasombra-bot` runs on the k3s cluster under Argo
CD, which syncs from the `home-automation` repo, and images there are pinned by
commit SHA. So `build-bot-image.yml` only publishes the image; to ship it, bump
the tag in that repo's `cluster/apps/lasombra-bot/deployment.yaml` and commit.
The old "Deploy Bot to Ursula" workflow was removed on 2026-08-29 — after the
migration it would have started a *second* live bot on Ursula holding the same
Discord gateway session as the pod.

Read the dev row carefully: `deploy-web-dev.yml` has **no branch filter**. Any
push to any branch that passes CI redeploys the shared dev service and posts a
Discord notification — before review, and without an open PR. This is
deliberate (it lets you test a PR on real infrastructure pre-merge), but it
means **dev is shared**: coordinate before pushing work-in-progress if someone
else is testing there.

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

Prod is only reachable through `main`, and the bot only redeploys when
`apps/bot/**` or `packages/**` actually changed.

**The workflows are the single source of truth** for image build, Cloud Run
resource flags, env vars, and secret bindings. `apps/web/deploy.sh` only
*triggers* a workflow via `workflow_dispatch` (it needs the `gh` CLI); it does
not deploy anything itself. Never add a second `gcloud run deploy` invocation —
two definitions of one service drift, and `--set-env-vars` silently removes any
env var it does not list.

Environment details: [docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md).
Bot host setup: `infra/ursula/README.md`.

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
