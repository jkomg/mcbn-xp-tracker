# Repository Agent Guide

Orientation for coding agents working anywhere in this monorepo. Read this
first, then [CONTRIBUTING.md](CONTRIBUTING.md) for the full detail — this file
deliberately does not duplicate it. `apps/character-app/` has its own
[AGENTS.md](apps/character-app/AGENTS.md) for frontend work.

Everything below is here because it **cannot be inferred by reading the code**.
If you skip one section, don't skip [Verify, don't assert](#verify-dont-assert) or
[Traps](#traps) — between them they are most of what separates a change that works
from one that fits.

Handing a whole issue to an agent? [Taking an issue end to
end](#taking-an-issue-end-to-end) is the workflow, and
[docs/CODEX_TASK_BRIEF.md](docs/CODEX_TASK_BRIEF.md) is the template for
delegating one.

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

## Verify, don't assert

Every rule here exists because the opposite cost real time in this repo. They are
cheap; skipping them is what makes a change expensive.

- **Open a file before citing it.** A brief once told an agent to model a new test
  on `sheetImportNotifier.test.ts`, named from its filename. That file only builds
  an embed — it never resolves a channel or sends — so the instruction was worse
  than none.
- **Read the workflow, or run the command, before describing how this repo
  behaves.** `CONTRIBUTING.md` has twice been wrong about deploys, and both errors
  got repeated downstream because they read plausibly. `ci.yml` and
  `.github/workflows/deploy-*.yml` are the truth.
- **Test through the entry point, not just the helper.** A unit test of a transfer
  helper passed while the route it serves charged XP and silently skipped the
  transfer. Assert on what the route did, not only on what the function returned.
- **Search for the operation, not the syntax.** `x.dots_blanked = 0` and
  `Model(dots_blanked=0)` are the same write; `set_character_background` and
  `cc_admin.draft_approve` are the same operation in two blueprints. Three separate
  bugs here came from a fix that matched the spelling in front of it. Ask "what
  else sets this?" and "what other route does this job?"
- **Prove a new regression test fails without the fix.** Revert the change, run the
  test, watch it fail, restore. A test written against fixed code and never run
  against broken code proves nothing, and this repo has shipped green suites
  asserting behaviour that could not occur.
- **Build fixtures by calling the real route.** Hand-constructed rows hid a
  three-month-old bug that made a whole mechanic unreachable, because the fixture
  encoded the intended state rather than the one the code produced.
- **Never truncate before you compute.** `open(path, 'w')` empties the file the
  moment it is called, so any error in the content expression destroys the file.
  Build the new contents, assert they are sane, *then* open for writing.
- **When you notice an edge case and decide to accept it, write it down.**
  Reasoning past one silently is how a P1 shipped here: the problem was spotted
  mid-implementation, judged pre-existing, and was not.
- **After a structural edit to a document, read the whole thing.** Targeted greps
  leave stale cross-references, duplicated paragraphs and contradicted claims one
  section away from what you changed.

## Commands CI gates on

Run these before opening a PR. Not approximations of them — these.

**Web** (from `apps/web`):
```bash
./venv/bin/pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30
./venv/bin/ruff check app tests
./venv/bin/python -m compileall app tests      # blocking in CI
```
`compileall` is not redundant with pytest: pytest imports only what the tests
reach, so a syntax error in an unimported module passes locally and fails CI.

**Bot** (from `apps/bot`):
```bash
npm run check      # lint → format:check → typecheck → test → build
```

**Character app** (from `apps/character-app`) — note Node 22 here, not 20:
```bash
npm run lint && npm run test:run && npm run typecheck && npm run build
npx playwright install --with-deps chromium && npm run test:e2e
```
`typecheck` and `test:e2e` are separate blocking steps — `npm run build` is Vite
only and does not type-check. The E2E run needs a Playwright browser installed,
so it is the slow one; run it before pushing anything touching this app.

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
- **`db.create_all()` runs before Alembic and is not race-guarded.**
  `app/__init__.py` calls it bare, then calls `_upgrade_with_race_retry` — so the
  Alembic step is protected against two instances booting together and the
  `create_all` is not. It does a has-table check then creates, so both can pass and
  one fails. **Retry it; do not swallow the error** — `create_all` walks tables in
  order, so an ignored "already exists" aborts the traversal and leaves every later
  table uncreated, which is worse than failing loudly.
- **You cannot drop a mapped column in the release that stops using it.**
  `entrypoint.sh` migrates before `exec gunicorn`, so the schema changes while the
  *previous* Cloud Run revision is still serving and still mapping that column —
  every read on the live revision fails until cutover. Unmap it in one release,
  drop it in a later one. The mirror of this also bites: merely unmapping makes the
  old revision's *writes* invisible if the new code stops reading the column, so
  whichever way you stage it, say what happens to a write served during cutover.
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

  Two practical rules follow:

  - **A branch carrying a migration owns shared dev until it merges.** Land it
    promptly, or expect to be the reason someone else's deploy fails.
  - **Rebase onto `main` before pushing any branch that will deploy to dev —
    not only branches that touch migrations.** The dev database is as far ahead
    as the last migration merged to `main`, so *any* branch that predates that
    merge fails to boot, whatever it changes. A docs-only branch is just as
    affected as a schema one.

**Conventions the type system does not enforce**

- **Pair every database write with an audit-log entry**, and *check* whether it
  needs a Sheets-mirror counterpart — check, not always add. The repo has ~50
  `log_action` calls to ~36 `sync_log_action`, so log-only is an established
  pattern (blanking routes are log-only). Either mirror it or say why not; silence
  reads as an oversight. A missing pairing compiles fine and looks done, and
  reviewers have caught this gap repeatedly.
- **Some routes have no audit entry at all.** `cc_admin.draft_approve` and
  `coteries.blank_donated_background` both commit without one. If you touch their
  write path, add it — inheriting the gap is how it persists.
- **A write is not only `x.y = z`.** Constructor keyword arguments are writes too:
  `DbCharacterBackground(dots_blanked=0, ...)` appears in both
  `db_service.set_character_background` and `cc_admin.draft_approve`, and a grep
  for assignments finds neither.
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
  - Blank state is **mid-migration by design**: `dots_blanked` is a column today,
    and `openspec/changes/per-blank-background-release/` specifies moving it to one
    row per blank. That spec is merged but **not implemented** — read its
    `design.md` Decisions before touching blanking, because several
    obvious-looking simplifications were tried there and disproved.
- **"Current night" means two different things, and they diverge.**
  `_current_open_night()` resolves it from `submissions_open`/`active` flags, which
  staff routinely switch on days before the night begins; `game_calendar` holds the
  real dates. Submission and claim decisions want the flag. Anything a player
  experiences as game time — a release, an expiry — wants the calendar. Using the
  flag for the latter returned blanked dots four days early.
- **Build test fixtures by calling the real route.** A hand-built `DbCharacterBackground`
  row encoding the *intended* post-donation state kept a suite green for three
  months while the actual route produced something else, making a whole mechanic
  unreachable in production.
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

## Taking an issue end to end

The goal is a PR that reads like the rest of this history — not a change that works
and then needs someone else to make it fit.

**1. Decide whether the issue is actually specified.** Most issues here are a
sentence of intent: *"let's just figure it out"*, *"write it I guess"*. That is a
priority, not a task. Before writing code, the outcome, the edge cases and any
game rule have to be decided. If they are not, you are guessing, and a faithfully
executed guess is the expensive failure — more expensive than asking.

Signals an issue is not ready: it says what to build but not what it should do when
two things collide; it implies a cost, duration or eligibility rule that is not
written down anywhere; it spans `apps/web` *and* `apps/bot` *and* the schema at
once.

**2. If it is not ready, write the spec, not the code.** `openspec/changes/<name>/`
with `proposal.md`, `design.md`, `tasks.md` and a spec delta — copy the shape of an
existing change. Specs are cheap to review and cheap to be wrong in; code is not.
Put the decisions you *cannot* make in front of the owner as concrete options with
a recommendation, rather than picking silently and mentioning it later.

A good `design.md` records the approaches that were rejected and why. Several
sections of this repo's specs exist only to stop a plausible simplification being
re-attempted.

**3. Check the issue against the code before believing it.** Issue text is often a
symptom description, and the stated cause is frequently wrong. One issue asked to
stop blanking using "a 30-day timer"; there was no timer, and the real defect was
that release compared against a staff flag instead of the calendar. Another asked
for a feature that already had a route and a UI control, unreachable because an
unrelated line set a field to zero.

**4. Pick the seam and stay in it.** One owner per seam per change — `apps/web` +
migrations, `packages/`, and the bot's Discord surface are not safely shared
mid-change. Do not widen scope because something adjacent looks wrong; note it and
raise it separately.

**5. Do not silently narrow it either.** If part of the issue turns out to be
blocked or to need a decision, finish everything else and say explicitly what you
left and why. Scaling the work down is the owner's call.

**6. Leave the trail.** The commit message explains *why*, including what you
considered and rejected. The PR body carries the real commands you ran with their
output, and a Risks/Rollback that names what you deliberately did not do. If you
corrected an earlier decision of your own, say so — this history does that
throughout, and it is the reason the traps above are known.

## Branching and PRs

- Branch from `main`, prefixed `feat/`, `fix/`, `chore/`, `docs/`, or
  `refactor/`. Keep PRs focused. **Rebase onto `main` before pushing** — see the
  shared-dev hazard above.
- Include tests for behavior changes. **Revert the fix, run the test, watch it
  fail, restore.** State in the PR that you did this and what failed. A test that
  passes either way proves nothing.
- Short imperative commit summaries, lower-case after the first word, no trailing
  period, no `type:` prefix. Explain *why* in the body — what the defect was, why
  this fix and not the obvious alternative, and anything you deliberately left
  undone. Look at `git log` before writing one; the register is plain and
  explanatory, not terse.
- The PR body follows `.github/pull_request_template.md`. **Validation means the
  commands you actually ran and what they printed**, not a restatement of intent.
  **Risks/Rollback names what you chose not to do** and how to undo what you did.
- Update `CHANGELOG.md` and affected `docs/` pages for user-visible changes — and
  check whether an older release note now contradicts you. One described a bug as
  the design for three months.
- A green CI is not a finished PR. Codex reviews here, and its findings are inline
  comments that `gh pr view` does not show: use
  `gh api --paginate repos/<owner>/<repo>/pulls/<n>/comments`. Pushing a new commit
  does **not** re-trigger review — comment `@codex review`, and check the status
  row's commit SHA against the PR tip before trusting any finding.
- Verify the push succeeded *before* requesting a review, or the review runs against
  a tip without your fixes.

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
