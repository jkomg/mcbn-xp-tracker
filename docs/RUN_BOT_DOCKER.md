# Run Discord Bot in Docker (Audit-Ready Logging)

Use this when you want the bot in a managed container with persistent, queryable logs for 30-day usage and cost audits.

## What this setup gives you

- Bot runtime in Docker (`apps/bot/docker-compose.yml`)
- Optional full-stack profile runtime (`compose.full.yml`, web + bot)
- Automatic restarts (`restart: unless-stopped`)
- Structured JSON app logs to Docker log driver (`json-file`)
- Log retention controls via:
  - `BOT_LOG_MAX_SIZE` (default `25m`)
  - `BOT_LOG_MAX_FILE` (default `120`)
- Persistent bot state volume (`apps/bot/data` mounted to `/app/data`)

## 1) Configure env

```bash
cd apps/bot
cp .env.example .env
```

Populate required keys in `apps/bot/.env`:

- `BOT_TOKEN`
- `CLIENT_ID`
- `TEST_GUILD_ID` (or your target guild)
- `WEB_APP_BASE_URL`
- `WEB_APP_API_TOKEN` (if API auth is enabled)

Optional retention tuning:

```env
BOT_LOG_MAX_SIZE=25m
BOT_LOG_MAX_FILE=120
TZ=America/Chicago
```

## 2) Start bot container

Bot-only workflow:

```bash
cd apps/bot
npm run ops:docker:up
docker ps --filter name=lasombra-bot
```

Full-stack profile (web + bot):

```bash
./scripts/bootstrap-local.sh web+bot
```

Tail logs:

```bash
npm run ops:docker:logs
```

## 3) Stop local non-Docker bot first (important)

If launchd/systemd/manual `npm start` is already running, stop it before Docker run to avoid duplicate bot sessions.

Examples:

```bash
./scripts/macos-services.sh stop bot
pkill -f "node dist/index.js" || true
```

## 4) Export usage window for cost audit

Default: last 30 days ending now.

```bash
cd apps/bot
npm run ops:docker:usage-30d
```

Custom window:

```bash
bash scripts/export-docker-usage-window.sh \
  lasombra-bot \
  "$(pwd)/.run/docker-audit" \
  "2026-02-09T00:00:00Z" \
  "2026-03-11T23:59:59Z"
```

Outputs:

- `.run/docker-audit/lasombra-bot-summary.txt`
- `.run/docker-audit/lasombra-bot-event-counts.txt`
- `.run/docker-audit/lasombra-bot-command-counts.txt`
- `.run/docker-audit/lasombra-bot-daily-counts.txt`
- raw/payload/json logs in same folder

## 5) Recommended operational checks

```bash
docker inspect lasombra-bot --format '{{json .HostConfig.LogConfig}}'
docker logs lasombra-bot --since "24h" --timestamps | tail -n 100
```

## Notes

- This keeps bot hosting local while making usage auditable.
- You do not need to migrate bot to GCP to produce cost modeling inputs.
- For Docker full profile, bot uses `WEB_APP_BASE_URL=http://web:5001`.
