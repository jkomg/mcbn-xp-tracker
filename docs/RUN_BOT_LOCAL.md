# Run Discord Bot Locally (Cost-Flat Option)

## Why local hosting

A Discord bot relies on a persistent gateway connection. Running it locally avoids always-on cloud runtime costs while keeping the web app on Cloud Run.

## Prerequisites

- Stable machine that can stay online (desktop, mini PC, home server, VPS)
- Node.js LTS
- Bot token
- Web API base URL/token

## Required bot environment variables

```env
DISCORD_BOT_TOKEN=...
WEB_APP_BASE_URL=https://mcbn.jkomg.us
WEB_APP_API_TOKEN=...
LOG_LEVEL=info
```

## Local run (manual)

```bash
cd apps/bot
npm ci
npm run build
npm start
```

## Launchd (macOS) managed run

Use launchd so the bot restarts automatically.

1. Create plist at `~/Library/LaunchAgents/us.mcbn.tracker-bot.plist`
2. Point to Node entrypoint in `apps/bot`
3. Set env vars in plist or sourced file
4. Load agent:

```bash
launchctl load ~/Library/LaunchAgents/us.mcbn.tracker-bot.plist
launchctl start us.mcbn.tracker-bot
```

## systemd (Linux) managed run

Create `/etc/systemd/system/mcbn-tracker-bot.service`:

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

## Security checklist

- Never commit bot token.
- Rotate `WEB_APP_API_TOKEN` on staff turnover/security events.
- Restrict bot host shell access.
- Keep OS patches current on bot host.

## Cost notes

- Local hosting adds no Cloud Run runtime cost for bot connectivity.
- Cloud Run costs remain tied to web/API traffic only.
