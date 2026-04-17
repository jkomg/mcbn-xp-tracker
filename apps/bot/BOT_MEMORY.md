# Bot/Integration Memory (Audit Snapshot)

Last updated: 2026-04-17
Scope: bot + web integration surfaces relevant to bot operations and wiki sync

## Current System Picture
- `apps/web` is still the single authority for XP data and staff controls.
- `apps/bot` is the Discord front-end and scheduler layer; it never writes DB directly.
- Chronicle Wiki is now in-web (`/wiki`) and can be updated by bot sync through write-token API endpoints.
- Notion sync and Wiki sync share the same bot script: `apps/bot/src/scripts/discord-notion-sync.ts`.

## Important Cross-App Control Plane
- Web settings can signal the bot through DB-backed `AppSetting` keys:
  - `BOT_RESTART_REQUESTED`
  - `BOT_NOTION_SYNC_REQUESTED`
  - `BOT_NOTION_SYNC_STALE_AFTER_SECONDS` (web UI stale threshold)
  - bot feature toggles and selected interval/channel overrides
- Bot polls `/api/bot-config` (60s) via `ConfigSyncWorker` and updates `liveConfig`.
- Bot reports status back via:
  - `/api/bot-heartbeat`
  - `/api/bot-restart-ack`
  - `/api/notion-sync-ack`
  - `/api/bot-log`

## Bot Runtime (Current)
- Entry point: `apps/bot/src/index.ts`
- Key services:
  - `reviewNotifier`, `submissionNotifier`, `claimReminderService`
  - `autoPeriodCreator`, `autoPeriodCloser`
  - `passageOfTimeService`, `huntConsequenceMonitor`
  - `configSyncWorker`, `botHeartbeatService`, `botLogForwarder`
  - `wikiSyncScheduler` (nightly scheduled sync trigger)
- Adapter: `apps/bot/src/services/adapter.ts` (scoped read/write token support)

## Wiki/Notion Integration Paths
- Manual run from web UI:
  - staff clicks Settings -> Run Notion Sync (`/settings/request-notion-sync`)
  - web sets `BOT_NOTION_SYNC_REQUESTED=true`
  - bot picks it up and runs `runNotionSync(...)`
- Scheduled run:
  - `WikiSyncScheduler` runs `runNotionSync(...)` at configured local time.
  - Scheduler defaults to wiki-only refresh (`notionToken=''`) to avoid repeated archival imports.
- Cross-trigger concurrency guard:
  - `apps/bot/src/services/wikiSyncLock.ts` is a shared in-process lock used by:
    - `ConfigSyncWorker` (owner=`manual`)
    - `WikiSyncScheduler` (owner=`scheduled`)
  - If lock is busy, second trigger skips and logs `*_lock_busy`.
- Wiki API endpoints used by sync:
  - `POST /api/wiki/page`
  - `DELETE /api/wiki/page/<slug>`
  - `PUT /api/character/<name>/status`
- Cover image permanence:
  - web mirrors Discord CDN images to GCS in `app/gcs.py` from `POST /api/wiki/page`.

## High-Signal Current Gaps
- `runNotionSync` is still a large monolithic script (1218 LOC) doing both Notion and Wiki writes.
- Bot tests do not currently cover:
  - `ConfigSyncWorker`
  - `WikiSyncScheduler`
  - Notion/Wiki sync orchestration edge cases.
- Stale-running remediation now exists in web Settings (`/settings/reset-notion-sync`), but there is no automated stale cleanup/alerting yet.
- Scheduled vs manual sync source is persisted (`BOT_NOTION_SYNC_SOURCE`) for operator context, but no historical run log exists beyond current status keys.

## Operational Files to Keep in Mind
- Bot local state:
  - `apps/bot/data/review-notifier-cursor.json`
  - `apps/bot/data/submission-notifier-cursor.json`
  - `apps/bot/data/passage-of-time-state.json`
- Web sync/error persistence:
  - `app_log_entries` and `sheets_sync_errors` tables in web DB.

## Invariants to Preserve
- Web remains system of record; bot stays API-only.
- Scoped token model (`WEB_APP_API_READ_TOKEN` / `WEB_APP_API_WRITE_TOKEN`) remains preferred over legacy token.
- Claims evidence link validation and staff-only command gating stay enforced.
- Scheduler jobs must remain idempotent across restarts and retries.
