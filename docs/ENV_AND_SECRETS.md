# Environment Variables and Secrets

For production-safe defaults and rollout order, see [PRODUCTION_ENV_PROFILE.md](PRODUCTION_ENV_PROFILE.md).

## Web App Env Vars (`apps/web/.env`)

Copy the template before editing:

```bash
cp apps/web/.env.example apps/web/.env
```

### Core / Flask

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `FLASK_SECRET_KEY` | Yes | — | Random string used to sign sessions. Set a long random value in production. |
| `FLASK_DEBUG` | No | `false` | Enable Flask debug mode. Never set `true` in production. |
| `SESSION_COOKIE_SECURE` | No | `false` | Set `true` in production (requires HTTPS). |
| `SESSION_COOKIE_SAMESITE` | No | `Lax` | Cookie SameSite policy. |
| `SESSION_LIFETIME_SECONDS` | No | `43200` | Staff session cookie lifetime (12 h). |

### Database

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `DATABASE_URL` | No | `sqlite:///data/db.sqlite` | SQLite for local dev; `libsql+https://...turso.io` for production. |
| `TURSO_AUTH_TOKEN` | Conditional | — | Required when `DATABASE_URL` is a Turso/libsql URL. |

### Google Sheets (backup mirror)

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `SPREADSHEET_ID` | Yes | — | Google Sheet ID (from the URL). |
| `GOOGLE_CREDENTIALS_FILE` | Conditional | — | Path to service account JSON file (local dev). |
| `GOOGLE_CREDENTIALS_JSON` | Conditional | — | Service account JSON as a string (production, from Secret Manager). |
| `SHEETS_CACHE_TTL` | No | `30` | Seconds to cache Sheet reads. |
| `SHEETS_VALIDATE_HEADERS_ON_STARTUP` | No | `false` | Validate Sheet tab headers on startup. |

### Discord OAuth

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `DISCORD_CLIENT_ID` | Yes | — | Discord OAuth2 application client ID. |
| `DISCORD_CLIENT_SECRET` | Yes | — | Discord OAuth2 application client secret. |
| `DISCORD_REDIRECT_URI` | Yes | — | OAuth callback URL (e.g. `http://127.0.0.1:5001/auth/callback`). |
| `ALLOWED_DISCORD_IDS` | Yes | — | Comma-separated Discord IDs with staff access. |
| `SETTINGS_ADMIN_DISCORD_IDS` | No | — | Subset of `ALLOWED_DISCORD_IDS` who can edit Settings at runtime. |

### Bot API Auth

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `WEB_APP_API_TOKEN` | Recommended | — | Legacy all-scope bearer token for bot. Grants read + write. |
| `WEB_APP_API_READ_TOKEN` | No | — | Scoped read-only token. |
| `WEB_APP_API_WRITE_TOKEN` | No | — | Scoped write token (grants read + write). |

At least one token must be set for the bot API to function. If only scoped tokens are set, each endpoint enforces its required scope.

### Replay Protection (bot write routes)

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `BOT_API_REPLAY_PROTECTION_ENABLED` | No | `false` | Require `X-Request-Timestamp` + `X-Request-Nonce` headers on write endpoints. |
| `BOT_API_REPLAY_WINDOW_SECONDS` | No | `300` | Max drift between bot request timestamp and server time. |
| `BOT_API_NONCE_TTL_SECONDS` | No | `600` | How long nonces are tracked. |
| `BOT_API_NONCE_CACHE_SIZE` | No | `10000` | Max nonces held in memory. |
| `BOT_WIKI_SYNC_STALE_AFTER_SECONDS` | No | `3600` | Settings UI threshold before a running wiki sync is marked stale. |

### Auto-Period Management

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `AUTO_CREATE_PERIODS_ENABLED` | No | `false` | Allow bot to trigger next-period creation via `/api/periods/auto-create`. |
| `AUTO_CREATE_PERIODS_OPEN_LEAD_DAYS` | No | `1` | Days before period end to open the next period for submissions. |
| `AUTO_CREATE_PERIODS_DEFAULT_LENGTH_DAYS` | No | `14` | Default period length in days. |
| `AUTO_CREATE_PERIODS_DEFAULT_GAP_DAYS` | No | `0` | Gap between periods in days. |
| `AUTO_CLOSE_PERIODS_ENABLED` | No | `false` | Allow bot to trigger period close via `/api/periods/auto-close`. |

### Optional / Misc

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `LOCAL_STATUS_ENABLED` | No | `false` | Enable `/local/status` diagnostics page (staff + localhost only). |
| `LOCAL_STATUS_ACCESS_LOG_FILE` | No | — | Path to access log file for the status page. |
| `LOCAL_STATUS_LOG_LINES` | No | `120` | How many log lines to show on the status page. |
| `WEB_LOG_DIR` | No | — | If set, writes JSON error logs to this directory. |
| `DISCORD_WEBHOOK_URL` | No | — | Optional Discord webhook for web app alerts. |

---

## Bot Env Vars (`apps/bot/.env`)

Copy the template before editing:

```bash
cp apps/bot/.env.example apps/bot/.env
```

### Core

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `BOT_TOKEN` | Yes | — | Discord bot token from the Developer Portal. |
| `CLIENT_ID` | Yes (for registration) | — | Discord application client ID. Required to register slash commands. |
| `WEB_APP_BASE_URL` | No | `http://127.0.0.1:5001` | Base URL of the web app. Use `http://web:5001` in Docker full-stack mode. |
| `WEB_APP_API_TOKEN` | Conditional | — | Legacy all-scope bearer token (fallback when scoped tokens are not set). |
| `WEB_APP_API_READ_TOKEN` | No | — | Preferred read-scoped token (maps to web `WEB_APP_API_READ_TOKEN`). |
| `WEB_APP_API_WRITE_TOKEN` | No | — | Preferred write-scoped token (maps to web `WEB_APP_API_WRITE_TOKEN`). |
| `TEST_GUILD_ID` | No | — | Guild ID for guild-scoped command registration during development. |
| `BOT_TESTER_IDS` | No | — | Comma-separated Discord IDs allowed to use staff-only bot commands. |
| `TEST_REQUESTER_DISCORD_ID` | No | — | Additional Discord ID added to `BOT_TESTER_IDS` at runtime. |

### Adapter Tuning

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `REQUEST_TIMEOUT_MS` | No | `10000` | HTTP request timeout to web app (ms). |
| `CLAIM_CONTEXT_CACHE_TTL_MS` | No | `30000` | How long to cache claim context responses (ms). |
| `CLAIM_CONTEXT_STALE_IF_ERROR_MS` | No | `300000` | Serve stale cache if web app is unreachable (ms). |
| `CLAIM_CONTEXT_MAX_RETRIES` | No | `2` | Retries on claim context fetch failure. |
| `CLAIM_CONTEXT_RETRY_BASE_MS` | No | `250` | Base delay for retry backoff (ms). |
| `CONFIG_SYNC_INTERVAL_MS` | No | `120000` | Poll interval for `GET /api/bot-config` (ms). |
| `BOT_HEARTBEAT_INTERVAL_MS` | No | `120000` | Interval for `POST /api/bot-heartbeat` pings (ms). |

### Review Notifier

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `REVIEW_NOTIFIER_ENABLED` | No | `false` | Enable posting approve/deny notifications to character cubbies. |
| `REVIEW_NOTIFIER_GUILD_ID` | Conditional | — | Guild ID where cubby channels live. Required when enabled. |
| `REVIEW_NOTIFIER_INTERVAL_MS` | No | `120000` | Poll interval (ms). |
| `REVIEW_NOTIFIER_LOOKBACK_SECONDS` | No | `86400` | How far back to look for review events on (re)start. |

### Submission Notifier

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `SUBMISSION_NOTIFIER_ENABLED` | No | `false` | Enable staff-channel alerts for new claim/spend submissions. |
| `SUBMISSION_NOTIFIER_CHANNEL_ID` | Conditional | — | Staff channel ID to post to. Required when enabled. |
| `SUBMISSION_NOTIFIER_INTERVAL_MS` | No | `120000` | Poll interval (ms). |
| `SUBMISSION_NOTIFIER_LOOKBACK_SECONDS` | No | `86400` | How far back to look on (re)start. |

### Auto-Period Creator

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `AUTO_PERIOD_CREATOR_ENABLED` | No | `false` | Enable bot-side trigger. Also requires `AUTO_CREATE_PERIODS_ENABLED=true` on web. |
| `AUTO_PERIOD_CREATOR_INTERVAL_MS` | No | `3600000` | How often to call `/api/periods/auto-create` (ms). |

### Auto-Period Closer

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `AUTO_PERIOD_CLOSER_ENABLED` | No | `false` | Enable bot-side trigger. Also requires `AUTO_CLOSE_PERIODS_ENABLED=true` on web. |
| `AUTO_PERIOD_CLOSER_GUILD_ID` | No | falls back to `REVIEW_NOTIFIER_GUILD_ID` | Guild ID for close notifications in character cubby channels. |
| `AUTO_PERIOD_CLOSER_INTERVAL_MS` | No | `3600000` | Poll interval (ms). |

### Wiki Sync

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `WIKI_SYNC_ENABLED` | No | `false` | Enable nightly scheduled wiki sync trigger. |
| `WIKI_SYNC_HOUR_LOCAL` | No | `4` | Local hour (0–23) for scheduled run. |
| `WIKI_SYNC_MINUTE_LOCAL` | No | `0` | Local minute (0–59) for scheduled run. |
| `WIKI_SYNC_TIMEZONE` | No | `America/Chicago` | IANA timezone for scheduler calculations. |
| `WIKI_SYNC_INTERVAL_MS` | No | `300000` | Tick interval for scheduler window checks (ms). |
| `DISCORD_GUILD_ID` | Conditional | `TEST_GUILD_ID` fallback | Discord guild used by sync scripts and channel discovery. |
| `NOTION_TOKEN` | Historical | — | No longer consumed by the current wiki-only runtime; retained here only for historical configuration reference. |
| `NOTION_SYNC_MSG_LIMIT` | Historical | `200` | No longer consumed by the current wiki-only runtime; retained here only for historical configuration reference. |

The current runtime uses `apps/bot/src/scripts/discord-wiki-sync.ts` and writes to the
web-hosted Chronicle Wiki. Older release notes refer to the former combined
Discord/Notion sync; those notes describe historical changes and are not current runtime
instructions.

### Character Creator Notifications

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `CC_SUBMISSION_NOTIFIER_ENABLED` | No | `false` | Enable Discord notifications for submitted character drafts. Explicitly enable in production if needed. |
| `CC_SUBMISSION_NOTIFIER_INTERVAL_MS` | No | `60000` | Poll interval for submitted drafts (ms). Production template uses `120000`. |
| `CC_SUBMISSION_NOTIFIER_LOOKBACK_SECONDS` | No | `86400` | How far back to look on startup (seconds). |
| `CC_APPROVAL_NOTIFIER_ENABLED` | No | `false` | Enable Discord notifications for approved character drafts. Explicitly enable in production if needed. |
| `CC_APPROVAL_NOTIFIER_INTERVAL_MS` | No | `60000` | Poll interval for approved drafts (ms). Production template uses `120000`. |
| `CC_APPROVAL_NOTIFIER_LOOKBACK_SECONDS` | No | `86400` | How far back to look on startup (seconds). |

### Retirement Automation

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `RETIREMENT_AUTOMATION_ENABLED` | No | `true` | Enable queue-driven retirement automation worker. |
| `RETIREMENT_AUTOMATION_INTERVAL_MS` | No | `60000` | Poll interval for pending retirement jobs (ms). |
| `RETIREMENT_AUTOMATION_GUILD_ID` | No | falls back to `DISCORD_GUILD_ID` / `TEST_GUILD_ID` | Guild used for retirement Discord actions. |
| `RETIREMENT_CHILDREN_FORUM_ID` | No | `1168655581486252042` | Source forum for active profile posts ("Children of the Night"). |
| `RETIREMENT_RETIRED_FORUM_ID` | No | `1168669113871257682` | Target forum for retired profile posts. |
| `RETIREMENT_WIKI_BATCH_ENABLED` | No | `true` | When `WIKI_SYNC_ENABLED=false`, allow retirement automation to request one daily wiki batch if retirement jobs are waiting for wiki propagation. |
| `RETIREMENT_WIKI_BATCH_HOUR_LOCAL` | No | falls back to `WIKI_SYNC_HOUR_LOCAL` or `4` | Local hour for the daily wiki batch request check. |
| `RETIREMENT_WIKI_BATCH_MINUTE_LOCAL` | No | falls back to `WIKI_SYNC_MINUTE_LOCAL` or `0` | Local minute for the daily wiki batch request check. |
| `RETIREMENT_WIKI_BATCH_TIMEZONE` | No | falls back to `WIKI_SYNC_TIMEZONE` or `America/Chicago` | IANA timezone for the daily wiki batch request check. |

Behavior notes:
- Cubby moves happen immediately after a character is marked `retired`.
- Discord does not support moving a forum thread between forums by changing parent ID. The bot clones the matching "Children of the Night" post into the Retired forum, then archives and locks the source thread.
- Failed Discord-side retirement jobs retry on capped exponential backoff, starting at 5 minutes and capping at 6 hours.
- Wiki updates remain deferred until the next successful wiki sync batch.

### Claim Reminder Service

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `CLAIM_REMINDER_ENABLED` | No | `false` | Enable scheduled reminder posts in character cubby channels for players who haven't claimed. |
| `CLAIM_REMINDER_GUILD_ID` | Conditional | — | Guild ID. Required when enabled. |
| `CLAIM_REMINDER_INTERVAL_MS` | No | `900000` | How often to check the schedule (ms). |
| `CLAIM_REMINDER_WEEKDAY_LOCAL` | No | `0` (Sunday) | Weekday to send reminders (0=Sun … 6=Sat). |
| `CLAIM_REMINDER_HOUR_LOCAL` | No | `12` (template) / `8` (code fallback) | Hour to send (0–23, local timezone). |
| `CLAIM_REMINDER_MINUTE_LOCAL` | No | `0` | Minute to send (0–59). |
| `CLAIM_REMINDER_TIMEZONE` | No | `America/Chicago` | IANA timezone for reminder scheduling. |
| `CLAIM_REMINDER_SNOOZE_HOURS` | No | `24` | How long a snooze lasts. |

### Passage of Time Service

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `PASSAGE_OF_TIME_ENABLED` | No | `false` | Enable in-world passage-of-time announcements. |
| `PASSAGE_OF_TIME_GUILD_ID` | Conditional | — | Guild ID. Required when enabled. |
| `PASSAGE_OF_TIME_CHANNEL_ID` | Conditional | — | Channel to post announcements in. Required when enabled. |
| `PASSAGE_OF_TIME_TEST_MODE` | No | `true` | When `true`, posts to `PASSAGE_OF_TIME_TEST_CHANNEL_ID` instead. |
| `PASSAGE_OF_TIME_TEST_CHANNEL_ID` | No | — | Test channel ID used in test mode. |
| `PASSAGE_OF_TIME_INTERVAL_MS` | No | `900000` | How often to check the schedule (ms). |
| `PASSAGE_OF_TIME_TIMEZONE` | No | `America/Chicago` | IANA timezone for scheduling. |
| `PASSAGE_OF_TIME_KINDRED_ROLE_ID` | No | — | Discord role ID to mention in announcements. |
| `PASSAGE_OF_TIME_GHOUL_ROLE_ID` | No | — | Discord role ID to mention in announcements. |
| `PASSAGE_OF_TIME_MORTAL_ROLE_ID` | No | — | Discord role ID to mention in announcements. |

**Cadence anchor dates** (format `YYYY-MM-DD`, local timezone). Sunrise/sunset repeat every 2 weeks; downtime every 8 weeks.

| Var | Default weekday | Default time |
|-----|----------------|--------------|
| `PASSAGE_SUNRISE_WEEKDAY_LOCAL` / `_HOUR_LOCAL` / `_MINUTE_LOCAL` / `_ANCHOR_DATE` | 0 (Sun) | 12:00 |
| `PASSAGE_SUNSET_WEEKDAY_LOCAL` / `_HOUR_LOCAL` / `_MINUTE_LOCAL` / `_ANCHOR_DATE` | 2 (Tue) | 12:00 |
| `PASSAGE_DOWNTIME_WEEKDAY_LOCAL` / `_HOUR_LOCAL` / `_MINUTE_LOCAL` / `_ANCHOR_DATE` | 0 (Sun) | 12:00 |

### Hunt Consequence Monitor

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `HUNT_CONSEQUENCE_ENABLED` | No | `false` | Enable monitoring hunt channels for dice consequence triggers. |
| `HUNT_CONSEQUENCE_CHANNEL_IDS` | Conditional | — | Comma-separated channel IDs to monitor. |
| `HUNT_CONSEQUENCE_STAFF_CHANNEL_ID` | Conditional | — | Channel to post consequence results to. |
| `HUNT_CONSEQUENCE_STAFF_ROLE_ID` | No | — | Role to mention when a consequence triggers. |
| `HUNT_CONSEQUENCE_ELDEST_BOT_ID` | No | `814857851406647309` | Discord ID of the Eldest dice-rolling bot. |
| `HUNT_CONSEQUENCE_TEST_MODE` | No | `false` | Route all output to `HUNT_CONSEQUENCE_TEST_CHANNEL_ID`. |
| `HUNT_CONSEQUENCE_TEST_CHANNEL_ID` | No | — | Test channel ID. |

### Player-Facing URLs

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `PLAYER_GUIDE_URL` | No | — | URL to a player quickstart guide (linked in `/xp help`). |
| `PLAYER_WEB_URL` | No | `{WEB_APP_BASE_URL}/player/` | Player portal URL (linked in `/xp help`). |

### Docker Log Retention

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `BOT_LOG_MAX_SIZE` | No | `25m` | Max size per Docker log file. |
| `BOT_LOG_MAX_FILE` | No | `120` | Max number of log files to retain. |
| `TZ` | No | `America/Chicago` | Container timezone. |

### Misc

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `HEALTH_ALERT_WEBHOOK` | No | — | Discord webhook URL for bot health alerts (used by `scripts/check-bot-health.sh`). |
| `COMBAT_SYSTEM_HELPER_ROLE_ID` | No | — | Discord role ID pinged when `/combat start` is used. |

---

## Local Dev Setup

1. Copy env templates:
   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/bot/.env.example apps/bot/.env
   ```
2. Fill in the required values in each file.
3. For web: place your Google service account JSON at `apps/web/credentials/service-account.json`.
4. For bot (Docker full-stack): the bootstrap script sets `WEB_APP_BASE_URL=http://web:5001` automatically. See Docker notes below.

---

## Production Secrets (Web App, Cloud Run)

Production secrets are managed via GCP Secret Manager:

```bash
cd apps/web
./setup-secrets.sh    # interactive: reads values from .env, pushes to Secret Manager
./deploy.sh           # build/push image and deploy new Cloud Run revision
```

To add or remove staff Discord IDs without a full redeploy:

```bash
cd apps/web
./update-staff-access.sh
```

**Rules:**
- Never commit `.env` files.
- Never commit `service-account.json`.
- Commit only `*.example` templates.
- Keep one enabled version per secret to stay within the GCP free tier.

---

## Docker Notes

In the full-stack Docker profile (`compose.full.yml`), the bot and web app run in the same Docker network. The bot must use the Docker service name to reach the web app:

```
WEB_APP_BASE_URL=http://web:5001
```

`http://127.0.0.1:5001` will not resolve inside the bot container.

The bootstrap script patches this automatically for new setups:

```bash
./scripts/bootstrap-local.sh web+bot
```

For web-only Docker, the default `WEB_APP_BASE_URL=http://127.0.0.1:5001` is correct for bot processes running on the host.
