# Run Discord Bot Locally (Cost-Flat Option)

Prefer containerized local hosting with audit-ready retention? Use [RUN_BOT_DOCKER.md](RUN_BOT_DOCKER.md).

## Why local hosting

A Discord bot relies on a persistent gateway connection. Running it locally avoids always-on cloud runtime costs while keeping the web app on Cloud Run.

## Prerequisites

- Stable machine that can stay online (desktop, mini PC, home server, VPS)
- Node.js LTS
- Bot token
- Web API base URL/token

## Required bot environment variables

Primary bot env file: `apps/bot/.env`

```env
BOT_TOKEN=...
CLIENT_ID=your-discord-application-id-numeric-snowflake
TEST_GUILD_ID=your-discord-server-id
WEB_APP_BASE_URL=https://mcbn.jkomg.us
WEB_APP_API_TOKEN=...

# Optional reviewed-claim/spend notifier (issue #23)
REVIEW_NOTIFIER_ENABLED=true
REVIEW_NOTIFIER_GUILD_ID=your-discord-server-id
REVIEW_NOTIFIER_INTERVAL_MS=60000
REVIEW_NOTIFIER_LOOKBACK_SECONDS=86400

# Optional issue #22: auto-create next night when due
AUTO_PERIOD_CREATOR_ENABLED=true
AUTO_PERIOD_CREATOR_INTERVAL_MS=3600000

# Optional issue #20: sunrise claim reminders
CLAIM_REMINDER_ENABLED=true
CLAIM_REMINDER_GUILD_ID=1168638982012293200
CLAIM_REMINDER_INTERVAL_MS=900000
CLAIM_REMINDER_WEEKDAY_LOCAL=0
CLAIM_REMINDER_HOUR_LOCAL=12
CLAIM_REMINDER_MINUTE_LOCAL=0
CLAIM_REMINDER_TIMEZONE=America/Chicago
CLAIM_REMINDER_SNOOZE_HOURS=24
BOT_TESTER_IDS=101109440702353408
PLAYER_GUIDE_URL=
PLAYER_WEB_URL=https://mcbn.jkomg.us/player/

# Optional issue #24: passage-of-time announcements
PASSAGE_OF_TIME_ENABLED=true
PASSAGE_OF_TIME_GUILD_ID=1168638982012293200
PASSAGE_OF_TIME_CHANNEL_ID=<passage-of-time-channel-id>
PASSAGE_OF_TIME_TEST_MODE=true
PASSAGE_OF_TIME_TEST_CHANNEL_ID=<bot-testing-channel-id>
PASSAGE_OF_TIME_TIMEZONE=America/Chicago
PASSAGE_OF_TIME_KINDRED_ROLE_ID=<kindred-role-id>
PASSAGE_OF_TIME_GHOUL_ROLE_ID=<ghoul-role-id>
PASSAGE_OF_TIME_MORTAL_ROLE_ID=<mortal-role-id>
PASSAGE_SUNRISE_ANCHOR_DATE=2026-03-08
PASSAGE_SUNSET_ANCHOR_DATE=2026-03-10
PASSAGE_DOWNTIME_ANCHOR_DATE=2026-03-08
```

For first-time setup, follow [INSTALL_REGULAR.md](INSTALL_REGULAR.md).

### Cubby notifier behavior

- When enabled, the bot polls reviewed claim/spend events and posts approve/deny updates.
- It finds destination cubbies by matching normalized channel/thread names to character names.
- Example: character `Cecelia` matches channel/thread name `cecelia`.
- If no matching cubby exists, the bot logs `review_notifier_channel_missing`.

### Auto-night creator behavior

- When enabled, the bot periodically calls `/api/periods/auto-create`.
- The web app creates the next night only when due, based on latest period dates/cadence.
- This is idempotent: if not due or already created, the API returns a skip reason.

### Claim reminder behavior

- At configured local day/time, bot pulls reminder targets for the current open night.
- For each eligible character, bot posts in that character's cubby channel/thread.
- Message mentions linked player (`player_discord`) and includes quick actions:
  - `Start Claim` (use `/xp submit` or `/xp claim`)
  - `Not Now` (snoozes reminders)
  - `Stop Reminders` (opt-out)
- Buttons are locked to the linked player for that reminder post.
- Important: cubby channel/thread names must match character names (normalized).

### Passage-of-time behavior

- Runs entirely in the local bot process, no external scheduler.
- Posts sunrise/sunset messaging every 2 weeks from configured anchor dates.
- Posts downtime messaging every 8 weeks from configured anchor date.
- In test mode, posts to `PASSAGE_OF_TIME_TEST_CHANNEL_ID` without role pings.
- In live mode, posts to `PASSAGE_OF_TIME_CHANNEL_ID` and prepends configured role mentions.

### Robust Discord test harness

- Add your Discord ID to `BOT_TESTER_IDS` in `apps/bot/.env`.
- Use `/xp test-reminder` to post a dummy reminder to a cubby channel without touching Google Sheets.
- Recommended command for full UI/button test:
  - `/xp test-reminder character:"Dummy One" target_user:@you current_night:"Night TEST"`
- Then click:
  - `Start Claim`: confirms manual claim path.
  - `Not Now`: writes a snooze preference.
  - `Stop Reminders`: writes opt-out preference.
- Preference state file (local bot host):
  - `apps/bot/data/claim-reminder-preferences.json`

### Bulk grant bot access to all cubbies

If the bot cannot post in character cubbies, run:

1. Dry run (no changes): `/xp sync-cubby-access dry_run:true`
2. Apply changes: `/xp sync-cubby-access dry_run:false`

Behavior:
- Scans category names containing `Character Cubbies`
- Updates permission overwrites for bot on each matched category and child text channel
- Grants: `View Channel`, `Send Messages`, `Read Message History`, `Use Application Commands`, `Send Messages in Threads`

Requirements:
- Command caller must be in `BOT_TESTER_IDS`
- Bot role must have permission to manage channel overwrites (`Manage Channels` or `Manage Roles`)

## Local run (manual)

```bash
cd apps/bot
npm ci
npm run build
npm start
```

Quick health check against web adapter:

```bash
npm run ops:check-adapter
```

## Launchd (macOS) managed run

Use launchd so the bot keeps running even when terminal windows are closed.

This repo includes a helper script:

```bash
# Install and start bot service
./scripts/macos-services.sh install bot

# Optional: include local web dev service too
./scripts/macos-services.sh install all

# Service controls
./scripts/macos-services.sh status all
./scripts/macos-services.sh restart bot
./scripts/macos-services.sh stop bot
./scripts/macos-services.sh logs bot err
```

Details:
- Bot label: `us.mcbn.tracker-bot`
- Web label: `us.mcbn.web-dev`
- Generated plists live in `~/Library/LaunchAgents`
- Logs live in `.run/logs/`
- Services load environment from `apps/bot/.env` and `apps/web/.env` (no secrets in plist files)

## systemd (Linux) managed run

Create `/etc/systemd/system/mcbn-tracker-bot.service`:

Start from template: `infra/bot-hosting/systemd/mcbn-tracker-bot.service`

```ini
[Unit]
Description=MCbN Tracker Discord Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/mcbn/apps/bot
EnvironmentFile=/opt/mcbn/apps/bot/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=bot

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcbn-tracker-bot
sudo systemctl start mcbn-tracker-bot
sudo systemctl status mcbn-tracker-bot
```

## Health and recovery checklist

- Check bot online in Discord server member list.
- Confirm command round-trip to web API succeeds.
- Verify logs show successful gateway READY event.
- After reboot, confirm auto-start works.
- Use scripted deploy/restart path after updates:
  - `npm run ops:deploy-local`

## Security checklist

- Never commit bot token.
- Rotate `WEB_APP_API_TOKEN` on staff turnover/security events.
- Restrict bot host shell access.
- Keep OS patches current on bot host.

## Cost notes

- Local hosting adds no Cloud Run runtime cost for bot connectivity.
- Cloud Run costs remain tied to web/API traffic only.
