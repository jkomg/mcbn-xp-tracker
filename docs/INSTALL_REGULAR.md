# Install Guide (Regular): Web App + Discord Bot

Use this guide if you want both:
- web interface (`apps/web`)
- Discord bot front-end (`apps/bot`)

## Outcome

- Web app running at `http://127.0.0.1:5001`
- Bot running locally and registering commands in your test guild
- No extra managed database/cloud runtime required for bot hosting

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
CLAIM_REMINDER_INTERVAL_MS=900000
CLAIM_REMINDER_HOUR_LOCAL=8
CLAIM_REMINDER_TIMEZONE=America/Chicago
CLAIM_REMINDER_SNOOZE_HOURS=24
```

Notes:
- `CLIENT_ID` must be numeric (Discord snowflake), not OAuth secret-like text.
- Keep this file local; never commit it.
- Cubby notifications match channel/thread names to `character_name` (normalized).
- Auto-night creation runs from the bot timer and calls web API (no cloud scheduler needed).
- In `apps/web/.env`, set `AUTO_CREATE_PERIODS_ENABLED=true` to allow bot-triggered creation.
- Claim reminders DM players at sunrise hour, with `Not Now` (snooze) and `Stop Reminders` controls.

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

Use one of:
- macOS launchd template: `infra/bot-hosting/launchd/`
- Linux systemd template: `infra/bot-hosting/systemd/`

Additional runbook: [RUN_BOT_LOCAL.md](RUN_BOT_LOCAL.md)

## Troubleshooting

- `Value "..." is not snowflake`:
  - Fix `CLIENT_ID` in `apps/bot/.env`.
- Bot connects but commands missing:
  - Check `TEST_GUILD_ID` and rerun `npm run dev`.
- Bot cannot reach web API:
  - Check `WEB_APP_BASE_URL` and ensure web app is running.
