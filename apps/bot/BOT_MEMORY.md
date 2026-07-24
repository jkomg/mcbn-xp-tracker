# Bot/Integration Memory (Current Snapshot)

Last updated: 2026-07-24
Scope: bot + web integration surfaces relevant to bot operations, retirement automation, and wiki sync.

## Current System Picture

- `apps/web` is the authority for XP data, characters, staff controls, and the Chronicle Wiki.
- `apps/bot` is the Discord front end and scheduler layer; it calls web APIs and does not write the database directly.
- Wiki sync is implemented by `apps/bot/src/scripts/discord-wiki-sync.ts`.
- The `src/scripts/notionSync/` directory retains legacy naming for shared Discord/wiki helpers. The current runtime has no Notion API writer.

## Production and Cost Posture

- Current deployment: web runs on separate production/dev Cloud Run services backed by
  separate Turso databases; the primary bot runs in Docker on Ursula, with heartbeat-backed
  bot failover on little-mac.
- Kubernetes manifests are migration preparation only; they are not current production infrastructure.
- Cloud Run baseline: `cpu=1`, `memory=256Mi`, `min-instances=0`, `max-instances=2`, `concurrency=80`, `timeout=120`.
- Bot control-plane baseline: `CONFIG_SYNC_INTERVAL_MS=120000` and `BOT_HEARTBEAT_INTERVAL_MS=120000`.
- Character submission and approval notifiers default to disabled in code and are explicitly enabled in the production template at 120 seconds.
- Retirement automation remains a 60-second queue worker because Discord-side retirement moves are intentionally prompt.
- Run `./scripts/check-cloudrun-efficiency.sh` after deploys and during monthly operations review.

## Cross-App Control Plane

- Web settings signal the bot through DB-backed settings such as `BOT_RESTART_REQUESTED` and `BOT_WIKI_SYNC_REQUESTED`.
- `ConfigSyncWorker` polls `/api/bot-config` and updates live settings.
- Bot status is reported through `/api/bot-heartbeat`, `/api/bot-restart-ack`, `/api/wiki-sync-ack`, and `/api/bot-log`.
- Retirement automation uses pending, completion, failure, and wiki-batch endpoints under `/api/retirement-automation`.
- Wiki sync history is persisted in `notion_sync_events`; the table name is historical and does not imply a live Notion writer.

## Bot Runtime

- Entry point: `apps/bot/src/index.ts`.
- Core services include review/submission notifiers, claim reminders, period automation, passage-of-time announcements, config sync, heartbeat, wiki scheduling, retirement automation, and activity tracking.
- Adapter: `apps/bot/src/services/adapter.ts`, with scoped read/write token support.

## Wiki Integration Paths

- Manual run: staff requests a wiki sync in Settings; the web app sets `BOT_WIKI_SYNC_REQUESTED`; the bot runs `runWikiSync(...)`.
- Scheduled run: `WikiSyncScheduler` runs `runWikiSync(...)` at the configured local time.
- `wikiSyncLock.ts` prevents overlapping manual and scheduled runs.
- Wiki API writes use `POST /api/wiki/page`, `DELETE /api/wiki/page/<slug>`, and `PUT /api/character/<name>/status`.
- Discord ingest helpers live in `src/scripts/notionSync/discordIngest.ts`.
- Wiki taxonomy and markdown helpers live in `src/scripts/notionSync/wikiSyncHelpers.ts`.
- Web API wrappers live in `src/scripts/notionSync/webWikiClient.ts`.
- Discord CDN cover images are mirrored to GCS by the web app.

Older release notes describe the former combined Discord/Notion sync and remain historical records. They are not current runtime instructions.

## Operational State

- Bot cursor/state files live under `apps/bot/data/` and are intentionally ignored except for `.gitkeep`.
- Web error and sync persistence uses `app_log_entries`, `sheets_sync_errors`, and `notion_sync_events`.

## Current Gaps

- `runWikiSync` remains a large end-to-end integration flow and could be split into location/hunting, character, and session-log runners.
- Larger markdown bodies across multi-message threads lack snapshot-style regression assertions.
- Stale-running sync remediation exists in web Settings, but automated stale alerting is not yet implemented.

## Invariants

- Web remains the system of record; bot stays API-only.
- Scoped `WEB_APP_API_READ_TOKEN` and `WEB_APP_API_WRITE_TOKEN` remain preferred over the legacy token.
- Claims evidence-link validation and staff-only command gating must remain enforced.
- Scheduler jobs must remain idempotent across restarts and retries.
