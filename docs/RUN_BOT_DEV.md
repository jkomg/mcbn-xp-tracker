# Run a Dev/Test Discord Bot

Use this when you want to exercise bot features (especially the [Correspondence
commands](./API_ENDPOINTS.md) — `/deliver`, `/contact`, `/prestation`, `/post`,
`/cobweb`, `/rumor`) against a separate test Discord server and the dev web
dashboard, without touching production data or the live server.

This is a second, independent bot process — a different Discord application,
pointed at a different guild and a different web backend. It runs alongside
(never instead of) the production Lasombra bot; nothing here changes how
production is deployed or run.

## Why a separate bot, not just a test channel in the main server

Several Correspondence commands are inherently multi-party — a `/contact`
group text, or `/prestation`'s two-step debtor-proposes/creditor-confirms
repayment — and can't be fully verified by one person testing solo. A
dedicated test guild also means slash commands can be registered
guild-scoped (see `TEST_GUILD_ID` below), which applies changes instantly
instead of waiting up to an hour for global command propagation.

## 1) Configure env

```bash
cd apps/bot
cp .env.dev.example .env.dev
```

Populate `apps/bot/.env.dev`:

- `BOT_TOKEN` / `CLIENT_ID` — the dev bot's own Discord application, **not**
  production Lasombra's.
- `TEST_GUILD_ID` — the test server's guild ID.
- `WEB_APP_BASE_URL`, `WEB_APP_API_READ_TOKEN`, `WEB_APP_API_WRITE_TOKEN` —
  point these at the **dev** web dashboard, not production, so nothing here
  can write real player data.
- Any other vars a feature you're testing needs (staff role IDs, other
  feature flags) — copy from `.env.example` as needed. `.env.dev` is a
  minimal overlay, not a full copy of `.env.example`.

## 2) Create the test channels

```bash
npm run ops:setup-test-channels
```

Creates a "Correspondence (Test)" category and the six channels the
Correspondence commands post to (reusing any that already exist by name), and
prints the six `CORRESPONDENCE_*_CHANNEL_ID` lines — paste them into
`.env.dev`.

## 3) Link test characters to real Discord accounts

Several flows (group texts, boon repayment, reply-notifies-others) need more
than one real, distinct Discord account with a linked active character on the
**dev** web dashboard. Recruit a player or two to sit in the test server for
this — one account can't exercise "does the creditor's confirmation actually
require a different person than the debtor" on its own.

## 4) Run the dev bot

```bash
npm run dev:test-guild
```

This loads `.env.dev` (via `DOTENV_CONFIG_PATH`) instead of `.env`, and
registers commands guild-scoped to `TEST_GUILD_ID` — changes to command
definitions show up in the test server within seconds, not up to an hour.

## Notes

- `.env.dev` is gitignored — never commit it (same rule as `.env`).
- This is a plain local process (`tsx src/index.ts`), not a Docker profile —
  simpler to iterate on, and nothing here needs the container logging/restart
  guarantees the production Docker setup exists for. See
  [`RUN_BOT_DOCKER.md`](./RUN_BOT_DOCKER.md) if you want the dev bot
  containerized too; point its env file at `.env.dev` instead of `.env`.
