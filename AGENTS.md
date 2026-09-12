# Repository Agent Guide

Orientation for coding agents working anywhere in this monorepo. Read this
first, then [CONTRIBUTING.md](CONTRIBUTING.md) for the full detail — this file
deliberately does not duplicate it. `apps/character-app/` has its own
[AGENTS.md](apps/character-app/AGENTS.md) for frontend work.

Everything below is here because it **cannot be inferred by reading the code**.
If you skip one section, don't skip [Traps](#traps).

## What this is

A Flask web app (the system of record) plus a Discord bot, managing XP and
spend approvals for a tabletop game community.

| Path | What it is | Language | Run commands from |
|------|-----------|----------|-------------------|
| `apps/web/` | Flask app — validation, approvals, persistence | Python 3.12 | `apps/web/` |
| `apps/bot/` | Discord bot ("Lasombra") | Node 20.11+ / TS | `apps/bot/` |
| `apps/character-app/` | React character-creator SPA | TypeScript | `apps/character-app/` |
| `packages/api-contract/` | Shared spend categories | JSON | — |
| `packages/rules/` | Shared XP cost formulas | JSON | — |

Almost every command runs from an **app directory, not the repo root.**

## Commands CI gates on

Run these before opening a PR. Not approximations of them — these.

**Web** (from `apps/web`):
```bash
./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30
./venv/bin/ruff check app tests
```

**Bot** (from `apps/bot`):
```bash
npm run check      # lint → format:check → typecheck → test → build
```

**Character app** (from `apps/character-app`) — note Node 22 here, not 20:
```bash
npm run lint && npm run test:run && npm run build
```

Jobs are path-filtered but roll up into one required `test-and-lint` check.
**Editing `packages/**` triggers four of them** — `web`, `bot`, `character_app`
and `docker_docs` all list `packages/**`, because the shared JSON is read by both
apps, asserted against by the character app's drift guards, and baked into the
web image's Docker build. Validate all three consumers locally, not just the one
you were editing for.

## Traps

**Tooling**

- `python` is usually **not on PATH** in this project. Use `./venv/bin/python`
  and `./venv/bin/pytest`. Python **must be 3.12**; 3.9 (macOS system Python)
  will not work.
- **Never copy or commit a `venv/`.** It hardcodes an absolute interpreter path
  and breaks with a confusing error on its own `bin/python`. Delete and recreate.
- **A bare `pytest -q` passes locally while CI fails.** The coverage floor is
  30% and only the full command above enforces it.
- **ruff is pinned to `0.15.20`.** An unpinned install picks up new default
  rules and fails CI with no code change (this happened: ruff 0.16.0, 207 new
  violations). Match the pin locally or you will chase phantom findings.
- `mypy` runs in CI but is informational and non-blocking.

**Database**

- **Turso (libsql) is the production database. Google Sheets is a best-effort
  backup mirror and is never read for primary data.** Any reasoning that treats
  Sheets as a source of truth is wrong.
- `db.create_all()` runs **before** Alembic's autogenerate diff on every boot.
  Against a fresh database, autogenerate therefore produces an **empty
  migration body**. Every migration needs a hand-written guard: a table-exists
  check for `CREATE TABLE`, a column-exists check for `ADD COLUMN`. Review the
  generated file; never trust it blindly.
- Migrations **apply automatically on every deploy** via `entrypoint.sh` under
  `set -e`, before gunicorn starts. A bad migration takes the service down on
  boot rather than failing a test.
- **One dev database is shared by every branch that deploys to it**, and
  `entrypoint.sh` runs `flask db upgrade` under `set -e` before gunicorn starts.
  So a branch that cannot locate the revision dev is stamped at does not boot at
  all, and it surfaces as

  ```
  ERROR: (gcloud.run.deploy) The user-provided container failed the
  configured startup probe checks.
  ```

  which reads like an application crash and is not one. The container log says
  `Can't locate revision identified by '<rev>'`. **Check that before debugging
  anything else.** This breaks in two directions:

  - **Your branch is behind.** Someone merged a migration to `main` after you
    branched. Fix: `git fetch origin && git rebase origin/main && git push
    --force-with-lease`. A retry will not help.
  - **Your branch is ahead, and it is everyone else who breaks.** Your *unmerged*
    migration ran on shared dev and stamped it at a revision that exists only on
    your branch, so `main` and every other branch now fail to boot. Rebasing
    fixes nothing here — the revision is not on `main` to rebase onto. Either
    merge your PR, or stamp dev back down to `main`'s head revision (the added
    columns are harmless and guarded migrations re-apply as no-ops). **This
    happened on 2026-09-12 and took dev down for roughly two hours.**

  The practical rule: a branch carrying a migration owns shared dev until it
  merges. Land it promptly, or expect to be the reason someone else's deploy
  fails.

**Conventions the type system does not enforce**

- **Pair every database write with an audit-log entry**, and check whether it
  needs a Sheets-mirror counterpart. A missing pairing compiles fine and looks
  done. Reviewers have caught this exact gap repeatedly.
- **`db_service.rename_character` holds an explicit list of tables keyed by
  `character_name` as a string** (not a foreign key). Adding such a table or
  column without adding it there silently orphans the data on rename.
- **Some domain objects have two representations. Changing one means changing
  both.** Known pairs:
  - Backgrounds: `character_data['backgrounds']` (sheet JSON, XP-gated through
    the spend pipeline) **and** `DbCharacterBackground` (donation/blanking
    tracker, player-editable directly).
  - Spends: the `DbSpendRequest` ORM row **and** the `SpendRequest` dataclass in
    `app/models.py`. `db_service` hands blueprints the *dataclass*, so a new
    column needs the model, the dataclass, and `_row_to_spend` updated together
    or attribute access fails at runtime.
- **Shared rules belong in `packages/`, not in one app.** XP formulas and spend
  categories are JSON loaded by both apps; duplicating a formula in one app is
  how the two clients drift.
- **`apps/web` is the authority.** The bot calls web API endpoints with a
  service token and never writes to the database or Sheets directly.
- **Re-validate identity and state server-side** — character ownership, coterie
  membership, staff status. Never trust a submitted ID or name.
- `apps/web` templates have **no JavaScript test harness**. Verify inline JS by
  isolated Jinja render plus route-level tests, and say so rather than implying
  browser coverage.

**Deploys**

- **A branch push with no open PR runs no CI at all.** `ci.yml`'s `push` trigger
  is restricted to `main`; every other branch runs CI through `pull_request`. So
  pushing a branch alone validates nothing and deploys nothing — open the PR, or
  your work is untested.
- **Once a PR is open, every CI pass on it redeploys the shared dev site**
  (`dev.mcbn.jkomg.us`), before review and on any branch. Dev is shared;
  coordinate.
- Prod deploys **automatically** only via `main`, gated on the dev deploy
  succeeding. But `deploy-web.yml` also accepts `workflow_dispatch`
  unconditionally and resolves it to `github.sha` with no main-tip check, so a
  manual `gh workflow run ... --ref <branch>` can put a feature branch straight
  into production. Treat manual prod dispatch as main-only by convention; the
  workflow does not enforce it.
- **Nothing in this repo deploys the bot.** CI on `main` publishes
  `ghcr.io/jkomg/lasombra-bot:<sha7>`; the bot runs on k3s under Argo CD, which
  syncs from the separate `home-automation` repo where images are pinned by
  commit SHA. Shipping it is a deliberate commit in that repo.
- **The GitHub Actions workflows are the single source of truth** for image
  build, Cloud Run flags, env vars, and secret bindings. `apps/web/deploy.sh`
  only triggers a workflow. Never add a second `gcloud run deploy` — two
  definitions drift, and `--set-env-vars` silently drops any var it omits.

**Stale references in-tree**

`infra/ursula/failover/` describes a failover bot whose launchd job is no
longer installed, and `apps/*/k8s/` manifests predate the k3s migration and are
not what the cluster runs. Don't treat either as current.

## Ask before doing these

Stop and ask rather than guessing:

- **Schema changes and migrations.** The guard rules above are subtle and a bad
  migration is a boot-time outage.
- **Editing `packages/`.** It changes both apps at once.
- **Anything that mutates live Discord state** (roles, channels, command
  registration). Test against the dev guild first — see `docs/RUN_BOT_DEV.md`.
- **Product or game-rules decisions.** Costs, what a mechanic does, who may do
  it. These are the owner's call, not an implementation detail to infer.

## Branching and PRs

- Branch from `main`, prefixed `feat/`, `fix/`, `chore/`, `docs/`, or
  `refactor/`. Keep PRs focused.
- Include tests for behavior changes. **Verify a new regression test actually
  fails against the unfixed code** — a test that passes either way proves
  nothing.
- Short imperative commit summaries. Explain *why* in the body, not just what.
- Update `CHANGELOG.md` and affected `docs/` pages for user-visible changes.

## Read next

- [CONTRIBUTING.md](CONTRIBUTING.md) — full toolchain, setup, testing, deploy paths
- [docs/REGRESSION_HYGIENE_CHECKLIST.md](docs/REGRESSION_HYGIENE_CHECKLIST.md) —
  pre/post-change checklist; every item traces to a real incident
- [docs/ARCHITECTURE_WEB.md](docs/ARCHITECTURE_WEB.md) — web internals, including the
  exact 4-file Sheets-mirror pattern and `rename_character`'s current table list
- [docs/ARCHITECTURE_BOT.md](docs/ARCHITECTURE_BOT.md) — bot internals and a
  footgun audit of the background workers
- [docs/PROJECT_HISTORY_AND_THEMES.md](docs/PROJECT_HISTORY_AND_THEMES.md) — why
  things are the way they are
- [docs/MONOREPO_ARCHITECTURE.md](docs/MONOREPO_ARCHITECTURE.md) — system boundaries
- [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) — bot-facing API reference
- [CLAUDE.md](CLAUDE.md) — the same ground, oriented toward Claude Code sessions
