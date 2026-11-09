# Live e2e — driving a real deployment

These specs drive an actual running site (dev by default) with a real Discord
session, real Flask, and a real Turso database. They are **not** part of CI.

That is the whole point: `e2e/character-creation.spec.ts` stubs every
`/api/cc/*` call, so it proves the wizard's own logic but never touches the
backend, approval, or the roster. These do the opposite — they are slower,
they need credentials, and they leave data behind.

## What they cover

- A draft autosaves to the database and survives a reload.
- A neonate from the wizard to the roster: spent XP survives a reload, staff see
  the figures approval will use, and `creation_xp` matches them.
- The revision cycle, including Edit opening the right draft with nothing in
  localStorage.
- An In-Memoriam ancilla: Starting XP offers only the banked era XP.
- Clan and age normalisation, and tampered budgets, on hand-built drafts.

Sets 1–8 of `docs/MANUAL_TEST_PLAN_CHARACTER_CREATION.md` remain the source of
truth. These do **not** cover the Discord sign-in, the In-Memoriam mode,
generation and disciplines pickers (the In-Memoriam test converts a finished
character instead), era-XP purchases, or how the wizard feels to use.

## Why they are not in CI

- They need a Discord session, which cannot be obtained headlessly.
- They mutate a shared environment. Dev redeploys on every CI-passing push on
  any branch, so a CI run of these could collide with someone testing by hand.
- A failure would often mean "dev is mid-deploy", not "the code is broken".

Run them deliberately, not automatically.

## One-time setup

Log in once and save the session. **The account must be staff**, because the
specs approve drafts:

```bash
cd apps/character-app
npm run e2e:live:login          # opens a browser, sign in with Discord
```

That writes `e2e-live/.auth/dev.json` (gitignored) holding the session cookie.
Sessions expire; re-run when the specs start failing at the login check.

The creator must also be enabled for that account: **Settings → Web App · Flags
& Tuning → Character Creation** set to `staff` or `everyone`. The specs fail
with a message saying so if it is not.

Then run the specs:

```bash
npm run e2e:live                # against dev
LIVE_BASE_URL=http://127.0.0.1:5001 npm run e2e:live   # against local
```

Check nothing is mid-deploy first (`gh run list --workflow=deploy-web-dev.yml
--limit 3`), and that dev is running the commit you mean to test.

## Safety

`playwright.live.config.ts` refuses to start against `mcbn.jkomg.us`. These
specs create characters and approve drafts; production is not a test target.
The guard is on the base URL and fails closed — an unrecognised host is
rejected rather than assumed safe.

The specs only act on drafts they created: the id comes from the creator or the
create response, never from searching the draft list, which holds other people's
work on a shared environment.

## What they leave behind

Approved drafts and active roster characters named `ZZLive_<timestamp>_<n>`.
Nothing else is deleted automatically, since a failed run's data is usually what
you want to look at. A run interrupted before its character has a name can also
leave an untitled draft under the signed-in account; delete that one from My
Characters.

`--cleanup` in `scripts/generate-test-data.py` removes everything prefixed
`ZZLive_` or `ZZTest_`, drafts included. It needs the **dev** database
credentials and refuses a target it cannot confirm is non-production:

```bash
DATABASE_URL=<dev libsql url> TURSO_AUTH_TOKEN=<dev token> \
./apps/web/venv/bin/python scripts/generate-test-data.py --mode db --cleanup --yes
```

If the mirror sheet on that environment is synced, approved `ZZLive_` characters
will appear there too, and cleanup does not remove them.
