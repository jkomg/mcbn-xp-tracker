# Handing a task to Codex

A template for delegating work to Codex Cloud, plus the rules that make the
handoff land. Codex cannot see the conversation that produced the task, so the
brief **is** the context transfer.

## Before you write a brief: is the task ready?

A task is handoff-ready only if all four hold. If any fails, the brief will
produce guesswork that looks finished.

1. **The outcome is decided, not open.** "Let's just figure it out" is not a
   spec. Every product and game-rules question — what it costs, who may do it,
   what happens at the edges — must already be answered.
2. **It fits one seam.** One app directory, ideally. Work spanning
   `apps/web` + `apps/bot` + schema at once needs splitting first.
3. **Done is checkable by a command.** Not "works well" — a test that fails
   before and passes after.
4. **Nothing else in flight touches the same files.** Check open PRs and other
   agents' branches.

Issues that read like a wish rather than a spec need a design pass first. That
pass is cheap and worth doing properly — an `openspec` proposal
(`openspec/changes/<name>/`) is the repo's existing format for it, and the
resulting `tasks.md` is what you hand over.

## Do not delegate these

- **Schema changes and migrations.** The `db.create_all()`-before-Alembic guard
  rule is repo-specific and a bad migration is a boot-time outage, not a failed
  test.
- **`packages/` edits.** They change both apps at once; one owner per change.
- **Anything mutating live Discord state.**
- **Work where the main risk is "did we decide the right thing,"** rather than
  "did we build it correctly."

## The brief

Copy this, fill every field, delete nothing. Empty fields are how scope drifts.

```text
## Task
<One sentence: the observable change. Not the implementation.>

Issue: #<n> — <title>
Read AGENTS.md first. It lists the commands CI gates on and the traps that
cannot be inferred from the code. Do not skip it.

## Branch
Work on: <type>/<short-description>
Branch from origin/main. Do not commit to main. Do not force-push a
branch you did not create.

## In scope
<Explicit paths. Be specific — "apps/bot/src/commands/" not "the bot".>

## Out of scope — do not edit
- apps/web/migrations/**        (schema is owned elsewhere)
- packages/**                   (shared contracts; changes both apps)
- .github/workflows/**          (deploy config is single-source-of-truth)
- <anything another branch is currently touching>
If you believe the task genuinely requires one of these, stop and say so
in a PR comment instead of doing it.

## Context you would otherwise have to guess
<The 3-6 facts that took a human or a long session to learn. Examples of the
shape: which of two representations of a thing is authoritative; which helper
already does half of this; a convention that is not enforced by types; why the
obvious approach was rejected before.>

## Definition of done
- [ ] <Behavioral change, stated as something testable>
- [ ] New tests cover it, and each new test was confirmed to FAIL against the
      unfixed code — a test that passes either way proves nothing
- [ ] <exact CI command for this seam, from AGENTS.md> passes
- [ ] No unrelated files touched; no formatting-only churn
- [ ] PR description explains WHY, not just what

## When you are blocked or unsure
Do not guess and do not silently narrow the task. Stop, push what you have,
and say in the PR exactly what decision you need. A blocked task reported
early is cheaper than a wrong one delivered complete.
```

## After Codex opens the PR

Codex's own review of its PR is not independent — it wrote the code. Review it
yourself or have a different agent do it, against the same bar you'd apply to a
human PR:

- Does each new test actually fail without the change?
- Did it touch anything in the out-of-scope list?
- Does every database write have its audit-log pairing?
- If it reports something as verified, is there output proving it?

Two review mechanics worth knowing, because the defaults mislead:

- **Codex's review status lives in a bot comment, not in the checks.** A review
  that errored shows as `⚠️ Failed` in that comment while `gh pr view` shows
  nothing, so a green-CI PR can look reviewed when the review never ran.
- **A new commit does not re-trigger review.** Comment `@codex review` after
  pushing, or the findings you're reading are about an older commit.

```bash
# Review status — gh pr view shows neither this nor the findings.
# --paginate matters: without it only the first page comes back, and on a busy
# PR the Codex status comment may not be on it. tail, not head — the status
# comment is edited in place and the newest state is last.
gh api --paginate repos/jkomg/mcbn-xp-tracker/issues/<n>/comments \
  --jq '.[] | select(.user.login|test("codex")) | .body' \
  | grep -E '^\| .*(Running|Completed|Failed)' | tail -1

# Inline findings
gh api --paginate repos/jkomg/mcbn-xp-tracker/pulls/<n>/comments \
  --jq '.[] | "\(.path):\(.line)  \(.body[0:200])"'
```

Check the **commit SHA** in that status row against the PR tip. A review of an
older commit is not a review of what you are about to merge.

## Two agents, one repo

- **One owner per seam per change.** `apps/web` + migrations, `packages/`, and
  the bot's Discord surface are not safely shared mid-change.
- **Rebase before pushing.** Dev has one database shared by every branch that
  deploys to it, so a branch that is behind `main` on migrations cannot boot and
  fails as a startup-probe error that looks like a crash. With two agents
  pushing, this stops being an edge case.
- **Every push to any branch that passes CI redeploys shared dev.** Two agents
  means two claims on one dev site; coordinate or expect confusing results.
- **Archive the coordination artifact when the work ships.** A ticked-off
  `openspec/changes/<name>/tasks.md` left in the tree for a feature that merged
  weeks ago is worse than nothing — it reads as work in progress.
