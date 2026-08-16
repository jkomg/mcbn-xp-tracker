# Live e2e — driving a real deployment

These specs drive an actual running site (dev by default) with a real Discord
session, real Flask, and a real Turso database. They are **not** part of CI.

That is the whole point: `e2e/character-creation.spec.ts` stubs every
`/api/cc/*` call, so it proves the wizard's own logic but never touches the
backend, approval, or the roster. These do the opposite — they are slower,
they need credentials, and they leave data behind.

## Why they are not in CI

- They need a Discord session, which cannot be obtained headlessly.
- They mutate a shared environment. Dev redeploys on every CI-passing push on
  any branch, so a CI run of these could collide with someone testing by hand.
- A failure would often mean "dev is mid-deploy", not "the code is broken".

Run them deliberately, not automatically.

## One-time setup

Log in once and save the session:

```bash
cd apps/character-app
npm run e2e:live:login          # opens a browser, sign in with Discord
```

That writes `e2e-live/.auth/dev.json` (gitignored) holding the session cookie.
Sessions expire; re-run when the specs start failing at the login check.

Then run the specs:

```bash
npm run e2e:live                # against dev
LIVE_BASE_URL=http://127.0.0.1:5001 npm run e2e:live   # against local
```

## Safety

`playwright.live.config.ts` refuses to start against `mcbn.jkomg.us`. These
specs create characters and submit drafts; production is not a test target.
The guard is on the base URL and fails closed — an unrecognised host is
rejected rather than assumed safe.

## What they leave behind

Characters named `ZZLive_<timestamp>`. The prefix matches
`scripts/generate-test-data.py`, so the same cleanup covers both. Nothing is
deleted automatically — a failed run's data is usually what you want to look
at.
