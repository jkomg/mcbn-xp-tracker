# Install Guide (Regular): Web App + Discord Bot

Use this guide if you want both:
- web interface (`apps/web`)
- Discord bot front-end (`apps/bot`)

Reference: [ENV_AND_SECRETS.md](ENV_AND_SECRETS.md)

## Outcome

- Web app running at `http://127.0.0.1:5001`
- Bot running locally and registering commands in your test guild
- No extra managed database/cloud runtime required for bot hosting

## Fast Path (One Command, Docker)

After completing env and credential setup (Lite + Bot env below), start full local profile:

```bash
./scripts/bootstrap-local.sh web+bot
```

Stop it with:

```bash
./scripts/bootstrap-local.sh web+bot down
```

## 1) Complete Lite Setup First

Start with: [INSTALL_LITE.md](INSTALL_LITE.md)

Do not continue until web login works locally.

## 2) Node Prerequisite

- Node `20+` recommended for bot runtime.

Check:

```bash
node -v
npm -v
```

## 3) Configure Bot Environment

```bash
cd apps/bot
cp .env.example .env
```

Edit `apps/bot/.env`:

```env
BOT_TOKEN=your-rotated-discord-bot-token
CLIENT_ID=your-discord-application-id-numeric-snowflake
TEST_GUILD_ID=your-discord-server-id

WEB_APP_BASE_URL=http://127.0.0.1:5001
WEB_APP_API_TOKEN=optional-if-web-api-token-enabled

# Optional: issue #23 cubby notifications for approved/denied claim/spend
REVIEW_NOTIFIER_ENABLED=true
REVIEW_NOTIFIER_GUILD_ID=your-discord-server-id
REVIEW_NOTIFIER_INTERVAL_MS=60000
REVIEW_NOTIFIER_LOOKBACK_SECONDS=86400

# Optional issue #22: bot-triggered auto creation of next play period
AUTO_PERIOD_CREATOR_ENABLED=true
AUTO_PERIOD_CREATOR_INTERVAL_MS=3600000

# Optional issue #20: sunrise claim reminders
CLAIM_REMINDER_ENABLED=true
CLAIM_REMINDER_GUILD_ID=your-discord-server-id
CLAIM_REMINDER_INTERVAL_MS=900000
CLAIM_REMINDER_WEEKDAY_LOCAL=0
CLAIM_REMINDER_HOUR_LOCAL=12
CLAIM_REMINDER_MINUTE_LOCAL=0
CLAIM_REMINDER_TIMEZONE=America/Chicago
CLAIM_REMINDER_SNOOZE_HOURS=24

# Optional passage-of-time scheduler (bot-only)
PASSAGE_OF_TIME_ENABLED=true
PASSAGE_OF_TIME_GUILD_ID=your-discord-server-id
PASSAGE_OF_TIME_CHANNEL_ID=passage-of-time-channel-id
PASSAGE_OF_TIME_TEST_MODE=true
PASSAGE_OF_TIME_TEST_CHANNEL_ID=bot-testing-channel-id
PASSAGE_OF_TIME_TIMEZONE=America/Chicago
PASSAGE_OF_TIME_KINDRED_ROLE_ID=kindred-role-id
PASSAGE_OF_TIME_GHOUL_ROLE_ID=ghoul-role-id
PASSAGE_OF_TIME_MORTAL_ROLE_ID=mortal-role-id

# Anchor dates in YYYY-MM-DD. Sunrise/Sunset every 2 weeks. Downtime every 8 weeks.
PASSAGE_SUNRISE_ANCHOR_DATE=2026-03-08
PASSAGE_SUNSET_ANCHOR_DATE=2026-03-10
PASSAGE_DOWNTIME_ANCHOR_DATE=2026-03-08

# Optional: URL for `/xp help` to reference your player guide post
PLAYER_GUIDE_URL=
PLAYER_WEB_URL=https://mcbn.jkomg.us/player/
```

Notes:
- `CLIENT_ID` must be numeric (Discord snowflake), not OAuth secret-like text.
- Keep this file local; never commit it.
- Cubby notifications match channel/thread names to `character_name` (normalized).
- Auto-night creation runs from the bot timer and calls web API (no cloud scheduler needed).
- In `apps/web/.env`, set `AUTO_CREATE_PERIODS_ENABLED=true` to allow bot-triggered creation.
- Claim reminders are scheduled by the bot for Sunday noon local time (`CLAIM_REMINDER_WEEKDAY_LOCAL=0`, `CLAIM_REMINDER_HOUR_LOCAL=12`), and post in character cubbies with `Not Now` / `Stop Reminders` controls.
- Passage-of-time announcements are also scheduled by the bot process (no additional cloud scheduler/cost). Use `PASSAGE_OF_TIME_TEST_MODE=true` to test in `#bot-testing` without live role pings.
- Set `PLAYER_GUIDE_URL` to a Discord post or docs page so `/xp help` can point players to your canonical guide.
- Set `PLAYER_WEB_URL` to your public player page URL so `/xp help` does not show localhost.

## 4) Install Bot Dependencies

```bash
npm install
```

## 5) Run Full Bot Sanity Gate

```bash
npm run check
```

Expected: lint, format, typecheck, tests, and build all pass.

## 6) Start Bot

```bash
npm run dev
```

Expected logs include:
- `bot_ready`
- `command_registration_guild`

## 7) Functional Verification in Discord

Run commands:
- `/ping`
- `/xp health`
- `/xp summary`
- `/xp spend-cost`

If these work, your regular setup is complete.

## Optional: Keep Bot Running After Reboot

On macOS, use:

```bash
./scripts/macos-services.sh install bot
./scripts/macos-services.sh status bot
```

If you also want local web dev to run in background:

```bash
./scripts/macos-services.sh install all
```

On Linux, use the systemd template:
- `infra/bot-hosting/systemd/mcbn-tracker-bot.service`

Additional runbook: [RUN_BOT_LOCAL.md](RUN_BOT_LOCAL.md)

## Troubleshooting

- `Value "..." is not snowflake`:
  - Fix `CLIENT_ID` in `apps/bot/.env`.
- Bot connects but commands missing:
  - Check `TEST_GUILD_ID` and rerun `npm run dev`.
- Bot cannot reach web API:
  - For Docker full profile, set `WEB_APP_BASE_URL=http://web:5001` in `apps/bot/.env`.
  - For host web + host bot runtime, keep `WEB_APP_BASE_URL=http://127.0.0.1:5001`.
