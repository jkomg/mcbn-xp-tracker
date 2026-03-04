# Run Discord Bot Locally (Cost-Flat Option)

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
```

For first-time setup, follow [INSTALL_REGULAR.md](INSTALL_REGULAR.md).

### Cubby notifier behavior

- When enabled, the bot polls reviewed claim/spend events and posts approve/deny updates.
- It finds destination cubbies by matching normalized channel/thread names to character names.
- Example: character `Cecelia` matches channel/thread name `cecelia`.
- If no matching cubby exists, the bot logs `review_notifier_channel_missing`.

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

Use launchd so the bot restarts automatically.

1. Start from template: `infra/bot-hosting/launchd/us.mcbn.tracker-bot.plist.template`
2. Create plist at `~/Library/LaunchAgents/us.mcbn.tracker-bot.plist`
3. Point to Node entrypoint in `apps/bot`
4. Set env vars in plist or sourced file
5. Load agent:

```bash
launchctl load ~/Library/LaunchAgents/us.mcbn.tracker-bot.plist
launchctl start us.mcbn.tracker-bot
```

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
