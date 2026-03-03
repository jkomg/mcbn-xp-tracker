# Monorepo Phase 4 Operations (Executed)

Generated: 2026-03-03

Phase 4 objective: keep web deploy on Cloud Run and make bot local hosting operationally repeatable.

## What was added

1. Service templates for local bot hosting
- launchd template: `infra/bot-hosting/launchd/us.mcbn.tracker-bot.plist.template`
- systemd unit: `infra/bot-hosting/systemd/mcbn-tracker-bot.service`

2. Bot operational scripts
- deploy/restart script: `apps/bot/scripts/deploy-local.sh`
- adapter health probe: `apps/bot/scripts/check-adapter.sh`

3. Bot package scripts
- `npm run ops:check-adapter`
- `npm run ops:deploy-local`

## Standard split deployment flow

### A) Web (Cloud Run)

From repo root:

```bash
./deploy.sh
```

This wrapper delegates to `apps/web/deploy.sh`.

### B) Bot (local host)

From repo root:

```bash
cd apps/bot
npm run ops:check-adapter
npm run ops:deploy-local
```

Behavior:

- Validates required env values in `apps/bot/.env`
- Verifies web API health (`/api/health`)
- Installs deps + builds bot
- Restarts local bot service using:
  - systemd (`mcbn-tracker-bot`) when available
  - launchd (`us.mcbn.tracker-bot`) when available
  - falls back to foreground `npm start` otherwise

## Initial setup checklist (one time)

1. Create `apps/bot/.env` from `apps/bot/.env.example` and set:
- `BOT_TOKEN`
- `CLIENT_ID`
- `WEB_APP_BASE_URL`
- `WEB_APP_API_TOKEN`

2. Install service template for your OS:
- macOS: copy/edit launchd template to `~/Library/LaunchAgents/us.mcbn.tracker-bot.plist`
- Linux: copy/edit systemd unit to `/etc/systemd/system/mcbn-tracker-bot.service`

3. Enable service manager entry:
- launchd:
  - `launchctl load ~/Library/LaunchAgents/us.mcbn.tracker-bot.plist`
- systemd:
  - `sudo systemctl daemon-reload`
  - `sudo systemctl enable mcbn-tracker-bot`

## Post-deploy validation checklist

1. Web reachable: `https://mcbn.jkomg.us`
2. Adapter checks pass: `npm run ops:check-adapter`
3. Bot service shows running state
4. Discord slash command round-trip works (`/xp health`, `/xp summary`)
5. Web audit log records bot claim/spend operations

## Notes

- This phase does not introduce a cloud-hosted bot runtime.
- Cost posture remains: web usage on Cloud Run, bot compute on local host.
