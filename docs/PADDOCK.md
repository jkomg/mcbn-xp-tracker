# Paddock

How this repository uses [Paddock](../.paddock/RULES.md): a lightweight process
for coordinating coding agents and keeping evidence of what was checked. This
page is orientation for people and agents. The binding text is
[`.paddock/RULES.md`](../.paddock/RULES.md); if the two disagree, the rules file
and the project instructions ([AGENTS.md](../AGENTS.md),
[CLAUDE.md](../CLAUDE.md), [CONTRIBUTING.md](../CONTRIBUTING.md)) win.

Paddock **does not grant** publishing, deployment, credential or any other
access. Opening a PR here still triggers CI and, once CI passes, a deploy of the
shared dev site — see [Deploy Paths](../CONTRIBUTING.md#deploy-paths).

## What is installed

The CLI is `.paddock/paddock.py`, a single-file Python script. It reports
version `0.1.0-preview` (`paddock.py --version`), and it is a preview: expect
rough edges. Its subcommands are listed by `paddock.py --help`.

| Path | Tracked in Git? | What it is |
|------|-----------------|------------|
| `.paddock/RULES.md` | yes | The project process rules |
| `.paddock/paddock.py` | yes | The CLI |
| `.paddock/unittest_receipt.py` | yes | A standalone `unittest` runner that writes a completion receipt (not wired into the current checks) |
| `.paddock/project.json` | yes | Which checks Paddock runs (see [Checks](#checks)) |
| `.paddock/crew.json` | **no, git-ignored** | Maps roles to *this machine's* approved agent resources |
| `.paddock/runs/<task>/` | **no, git-ignored** | Per-task evidence: requests, contracts, review packets, raw outputs |
| marker block in `AGENTS.md` / `CLAUDE.md` | yes | One line pointing agents at `RULES.md` |

The policy files (`RULES.md`, `project.json`, the marker blocks) are portable
and meant to be shared. `crew.json` is **machine-local** — it names resources
that exist on one person's machine — so it is ignored and must be re-created
on another machine (see `paddock.py --help` for the `interview` and `bind`
commands) rather than copied. Local bindings and runs are ignored for the same
reason: run evidence may contain company data, so nothing under
`.paddock/runs/` is committed, and only inspected, relevant evidence should be
shared with an approved agent.

Paddock files that are new on a branch are untracked until staged. A check that
looks at the diff — notably `git diff --check` — does **not** cover them until
they are staged (`git add`).

## Approved connections

Only the repository owner's existing connections are approved: the current
ChatGPT Business connection and the current Claude Pro connection. There is
no authorisation for API keys, another organisation's account, or any other
provider as a fallback. If an agent role is unbound or unavailable, the work is
**blocked** — it is not permission to substitute another account or provider.
Local models are off.

Account identities, emails and resource IDs are deliberately not recorded in
this repository.

## Roles

The coordinator is the thread that owns the task, delegation and integration.
In the current local configuration the roles map as follows (see `crew.json` on
the machine for the actual bindings; this page is a description, not a
configuration source):

| Role | Current mapping | Job |
|------|-----------------|-----|
| Coordinator | Codex (ChatGPT Business) | Owns the task, delegates bounded work, integrates, runs the checks |
| Builder | Claude, Sonnet by default | Implements one bounded piece of work. One builder at a time |
| Code reviewer | Codex, in a **fresh** session | Examines correctness of the frozen change |
| Process adversary | Claude Opus, in a **separate** process | Examines instruction adherence, factual claims, omissions, error reporting |

- **Every change requires both reviews** — code review by Codex and a separate
  Opus process adversary — including small and docs-only changes. The
  "trivial work" exemption in the installed skill is not available here. If
  either review cannot run, report it as **pending**; do not claim the change is
  ready to merge.
- The coordinator counts as a builder whenever it edits, so it cannot also be
  the independent reviewer of its own edits.
- Reviews need distinct real sessions and inspectable receipts. A review is never
  manufactured: if the tools are unavailable, hand over a packet for another
  session and report the review pending.
- At most two automatic repair/review rounds. Changed source invalidates the
  final review; changed instructions invalidate the instruction review.
  Unresolved findings are reported with evidence, not hidden or called approved.
- Concurrent builders need host-created isolated worktrees and one integration
  owner; the default is a single builder.

## What Paddock does not enforce

Paddock records process; it does not enforce isolation or security.

- **There is no enforced account isolation.** A provider being available, or a
  local CLI being logged in, does not prove which identity a delegated session
  used. Authentication evidence and its limits are recorded separately, and
  nothing here claims that account labels or Paddock's editable records form a
  security boundary.
- Files under `.paddock/` are editable; they are not attestations. An
  evidence-completeness result is not proof of correctness or honest behaviour.
- The CLI cannot sign providers in, dispatch agents or prove host enforcement;
  the active coordinator does that with supported host tools.

## Python versions

Two different Python requirements apply, and they are not the same:

| Used for | Needs |
|----------|-------|
| Running `.paddock/paddock.py` | Python **3.11+** (it exits with "Python 3.11 or newer is required" otherwise) |
| The Flask web app and its tests (`apps/web`) | Python **3.12** — see [CONTRIBUTING.md](../CONTRIBUTING.md#required-toolchain) |

On macOS the system `python3` may be **3.9**, which satisfies neither. Do not
assume `python3` is usable: find an interpreter explicitly.

```bash
python3 --version                  # often 3.9 on macOS — too old for Paddock
command -v python3.12 python3.13   # look for an explicit, newer interpreter
python3.13 .paddock/paddock.py --version   # substitute whichever one you found
```

The `{python}` placeholder in `.paddock/project.json` is replaced by the
interpreter that is running `paddock.py`, so run the CLI with the explicit
interpreter you found and the checks that need Python will use it too. Web
commands should keep using the app's own virtualenv (`./venv/bin/python`).

## Checks

Paddock runs whatever commands `.paddock/project.json` lists. By design it
starts empty and must be given real commands; the checks are **configurable**.
Do not claim verification beyond what is configured and actually ran.

The configuration currently covers **documentation and Paddock onboarding
only**: the docs parity script (`bash scripts/check-docs-parity.sh`), a
`git diff --check origin/main` whitespace check, a syntax parse of the Paddock
Python files, and `paddock.py doctor`. These are command checks, not
application tests, and they say nothing about test counts or whether the apps
work.

Before any application, dependency, workflow or shared-package change, configure
the exact affected CI checks first — the commands in
[AGENTS.md](../AGENTS.md#commands-ci-gates-on) and
[CONTRIBUTING.md](../CONTRIBUTING.md#testing-and-lint), read against
`.github/workflows/ci.yml` — and run them.

How to read a check result:

- Exit 0 does not prove tests ran. No tests collected, all tests skipped, a
  timeout, missing output or unavailable data is **not** a success.
- Preserve raw output and failures; do not smooth them over.
- Report checks, code review, adversary review, host controls, CI and deployment
  as separate states. Unknown is unknown.
- Do not invent token or cost figures.

## Evidence and records

Evidence for a task lives in `.paddock/runs/<task>/` and stays local. The usual
contents are the original request (kept verbatim, so the user's goal is not
replaced by a summary of it), the accepted scope and acceptance contract, host
receipts for delegated sessions, raw check output and review packets. For
substantial work a fresh instruction review checks ambiguity and contradictions
before implementation; it must not replace the user's goal.

Because those records are git-ignored, a PR description or the commit message
is where the outcome has to be written down for other people — see
[Branching and PRs](../AGENTS.md#branching-and-prs) for what a PR body must carry.
