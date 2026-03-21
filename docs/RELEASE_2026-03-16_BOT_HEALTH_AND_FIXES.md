# Release: 2026-03-16 — Bot Health Monitoring, Cubby Monitor Fix, Sidebar Pin

## Included

### Bot health monitoring (three-layer)

**Heartbeat API** (`apps/web`)
- `POST /api/bot-heartbeat` — write-scoped endpoint; bot calls this every 60 s to record liveness.
- `GET /api/bot-heartbeat` — read-scoped endpoint; returns `last_heartbeat` ISO timestamp and `age_seconds`.
- Timestamp stored in `AppSetting` DB row under key `BOT_LAST_HEARTBEAT`.
- Replay protection exempt (idempotent by nature).

**Settings widget** (`apps/web`)
- "Bot Status" card added to Settings page.
- Green (Online) if last heartbeat < 3 min ago, yellow (Delayed) < 10 min, red (Offline) otherwise.
- Shows exact timestamp of last heartbeat.

**BotHeartbeatService** (`apps/bot`)
- Pings `POST /api/bot-heartbeat` on `clientReady` and every 60 s via `setInterval(...).unref()`.
- Failures logged as `heartbeat_failed` warnings; no crash on failure.

**macOS LaunchAgent health check script** (`scripts/`)
- `scripts/check-bot-health.sh` — runs four checks: Docker socket, bot container state, web app `/api/health`, heartbeat freshness (stale > 5 min).
- Sends a macOS notification on failure.
- 10-minute alert cooldown via `/tmp/mcbn-health-last-alert` lockfile.
- `scripts/com.mcbn.bot-health-check.plist` — LaunchAgent plist, `StartInterval: 300`, `RunAtLoad: true`.

**Install LaunchAgent (one-time):**
```bash
sed "s|__REPO_ROOT__|${HOME}/Projects/mcbn-xp-tracker|g" \
  scripts/com.mcbn.bot-health-check.plist \
  > ~/Library/LaunchAgents/com.mcbn.bot-health-check.plist
launchctl load ~/Library/LaunchAgents/com.mcbn.bot-health-check.plist
```

### Cubby channel monitor fix (`apps/bot`)

- Extended `CUBBY_CATEGORY_KEYWORDS` to include both `"character cubbies"` and `"character tickets"` (case-insensitive).
- Added `threadCreate` handler: bot joins any thread created under a matching category, so it receives claim reminders and review notifications in ticket threads.
- Root cause: live category name was `"Character Tickets"`, not `"Character Cubbies"`. Diagnosed via debug logging and live log tailing.

### Sidebar pin (`apps/web`)

- Left sidebar now stays fixed while main content scrolls independently.
- Fixed using two independent `height: 100vh; overflow-y: auto` scroll containers rather than `position: sticky`.

### Docker ARM64 / local dev fixes

- Removed `platforms: linux/amd64` from compose files (broke ARM64 Mac builds).
- Added `INSTALL_LIBSQL` build arg to Dockerfile — set to `false` in compose to skip the ARM64-incompatible `libsql-experimental` wheel in local dev.
- Added `DATABASE_URL: sqlite:///data/db.sqlite` to compose web environment, overriding any Turso URL from `.env` so local dev always uses SQLite.
- Bot config now allows Docker service names (no dots) as `WEB_APP_BASE_URL` hostname so `http://web:5001` is accepted in full-stack Docker.

### Local dev seed script (`scripts/`)

- `scripts/seed-local-db.py` — copies production Turso data (characters, play periods, claims, spends, ledger entries) into the local SQLite dev database via the Turso HTTP pipeline API.

### deploy.sh fix (`apps/web`)

- Replaced invalid `--traffic=LATEST` flag with a separate `gcloud run services update-traffic --to-latest` step.

## Upgrade notes

- **LaunchAgent**: Install once per machine (see above). No action needed if already installed.
- **Bot container**: Rebuild required to pick up `BotHeartbeatService`. Run `docker compose build bot` or rebuild manually.
- No DB schema changes. No migration required.
