# Bot/Integration Memory (Audit Snapshot)

Last updated: 2026-06-25
Scope: bot + web integration surfaces relevant to bot operations, retirement automation, and wiki sync

## Current System Picture
- `apps/web` is still the single authority for XP data and staff controls.
- `apps/bot` is the Discord front-end and scheduler layer; it never writes DB directly.
- Chronicle Wiki is now in-web (`/wiki`) and can be updated by bot sync through write-token API endpoints.
- Notion sync and Wiki sync share the same bot script: `apps/bot/src/scripts/discord-notion-sync.ts`.

## Production Ops Posture (2026-04-18)
- Cloud Run spend is currently minimal; lean service profile is pinned and should remain:
  - `cpu=1`, `memory=256Mi`
  - `min-instances=0`, `max-instances=2`
  - `concurrency=80`, `timeout=120`
  - `session-affinity=false`
- Use `./scripts/check-cloudrun-efficiency.sh` after deploys to catch cost-shape drift.
- Bot control-plane polling baseline is now 120s:
  - `CONFIG_SYNC_INTERVAL_MS=120000`
  - `BOT_HEARTBEAT_INTERVAL_MS=120000`
- Retirement automation now has its own short poll loop (default `RETIREMENT_AUTOMATION_INTERVAL_MS=60000`) so Discord-side retirement moves happen promptly.
- Production Turso schema drift caused wiki outage after sync-lock merge; manual reconciliation was applied and `alembic_version` was advanced to `c9b4e1d8f2a0`.

## Important Cross-App Control Plane
- Web settings can signal the bot through DB-backed `AppSetting` keys:
  - `BOT_RESTART_REQUESTED`
  - `BOT_WIKI_SYNC_REQUESTED`
  - `BOT_WIKI_SYNC_STALE_AFTER_SECONDS` (web UI stale threshold)
  - bot feature toggles and selected interval/channel overrides
- Bot polls `/api/bot-config` (120s default) via `ConfigSyncWorker` and updates `liveConfig`.
- Bot reports status back via:
  - `/api/bot-heartbeat`
  - `/api/bot-restart-ack`
  - `/api/wiki-sync-ack`
  - `/api/bot-log`
- Retirement automation queue endpoints:
  - `GET /api/retirement-automation/pending`
  - `POST /api/retirement-automation/{id}/discord-complete`
  - `POST /api/retirement-automation/{id}/discord-failed`
  - `POST /api/retirement-automation/wiki-batch-request`
- Retirement queue retries failed Discord work on capped exponential backoff (5 minutes up to 6 hours); pending endpoint returns only jobs currently due.
- Staff can manually resolve retirement jobs from the Reports page after handling Discord/wiki cleanup outside automation.
- Web now stores sync lifecycle history in `notion_sync_events` (append-only, bounded), including `run_id` correlation.

## Bot Runtime (Current)
- Entry point: `apps/bot/src/index.ts`
- Key services:
  - `reviewNotifier`, `submissionNotifier`, `claimReminderService`
  - `autoPeriodCreator`, `autoPeriodCloser`
  - `passageOfTimeService`, `huntConsequenceMonitor`
  - `configSyncWorker`, `botHeartbeatService`, `botLogForwarder`
  - `wikiSyncScheduler` (nightly scheduled sync trigger)
  - `retirementAutomationWorker` (immediate Discord retirement moves + daily wiki-batch request path)
- Adapter: `apps/bot/src/services/adapter.ts` (scoped read/write token support)

## Wiki/Notion Integration Paths
- Manual run from web UI:
  - staff clicks Settings -> Run Notion Sync (`/settings/request-notion-sync`)
  - web sets `BOT_WIKI_SYNC_REQUESTED=true`
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
- Manual wiki sync lock:
  - web wiki pages now support a staff-controlled per-page sync lock (`sync_locked`).
  - when locked, bot-sync `POST /api/wiki/page` and `DELETE /api/wiki/page/<slug>`
    return `423` with `status=locked`; bot logs skip and continues.
  - staff manual wiki edits remain allowed while lock is active.
- Wiki sync helper extraction (phase 1):
  - shared wiki taxonomy + markdown/slug/domain helpers now live in
    `apps/bot/src/scripts/notionSync/wikiSyncHelpers.ts`.
  - `discord-notion-sync.ts` imports these helpers; orchestration flow is unchanged.
- Discord ingest extraction (phase 2):
  - Discord REST pagination helpers now live in
    `apps/bot/src/scripts/notionSync/discordIngest.ts`.
  - `discord-notion-sync.ts` now imports `fetchAllMessages`, `fetchForumThreads`,
    `fetchPins`, and `fetchGuildMember` from this module.
  - dedicated tests added at `apps/bot/src/__tests__/discordIngest.test.ts`.
- Notion writes extraction (phase 3):
  - Notion retry/chunk/cleanup helpers now live in
    `apps/bot/src/scripts/notionSync/notionWrites.ts`.
  - `discord-notion-sync.ts` now imports `notionCall`, `appendBodyBlocks`,
    `cleanupPreImportEntries`, and `SOURCE_TAG` from this module.
  - dedicated tests added at `apps/bot/src/__tests__/notionWrites.test.ts`.
- Notion payload builders extraction (phase 4):
  - Notion page payload construction now lives in
    `apps/bot/src/scripts/notionSync/notionPayloadBuilders.ts`.
  - `discord-notion-sync.ts` now imports payload builders for
    Location/Hunting/SPC/PC/Session create operations.
  - dedicated tests added at
    `apps/bot/src/__tests__/notionPayloadBuilders.test.ts`.
- Web wiki client extraction (phase 5):
  - wiki/status API write wrappers now live in
    `apps/bot/src/scripts/notionSync/webWikiClient.ts`.
  - `discord-notion-sync.ts` now calls `WebWikiClient` methods for
    wiki upsert/delete and retired status updates.
  - dedicated tests added at
    `apps/bot/src/__tests__/webWikiClient.test.ts`.
- Sync target separation (phase 6):
  - target resolution now lives in
    `apps/bot/src/scripts/notionSync/syncTargets.ts`.
  - `discord-notion-sync.ts` now supports independent target toggles:
    `--notion-only` and `--wiki-only`.
  - Notion and Wiki execution are now explicitly gated via
    `syncToNotion` / `syncToWiki` options and token availability.
  - dedicated tests added at
    `apps/bot/src/__tests__/syncTargets.test.ts`.
- Sync orchestration gating coverage (phase 7):
  - added direct `runNotionSync` orchestration tests at
    `apps/bot/src/__tests__/runNotionSyncTargets.test.ts`.
  - coverage now explicitly verifies:
    - fail-fast when no targets are enabled
    - notion-only target wiring
    - wiki-only target wiring
- Runtime target-efficiency hardening (phase 8):
  - `discord-notion-sync.ts` now gates wiki-only execution by `WIKI_ENABLED`
    instead of relying on no-op wiki client token behavior.
  - notion-only runs skip wiki-only work paths (profile-map enrichment,
    stale wiki cleanup, coteries/factions generation, retired updates, and
    wiki upsert/delete/status calls).
  - `runNotionSyncTargets.test.ts` now includes fixture-backed assertions for:
    - notion-only: no wiki writes
    - wiki-only: no Notion writes
- Combined-target orchestration coverage (phase 9):
  - `runNotionSyncTargets.test.ts` now includes richer seeded channel/thread
    fixtures (city/lore/SPC text channels + children/retired forums).
  - added explicit both-target (`syncToNotion=true`, `syncToWiki=true`) test
    asserting Notion writes + wiki upsert/delete/status paths execute.
- Golden payload/body assertions (phase 10):
  - `runNotionSyncTargets.test.ts` now asserts concrete generated output:
    - Notion payload-builder inputs (location/hunting/SPC/session titles)
    - wiki upsert payload fields (slug/category/title/body)
    - location wiki body includes expected Hunting Sites section content.

## High-Signal Current Gaps
- `runNotionSync` orchestration remains large (~1.1k LOC) even after helper extraction and target gating; next split should separate end-to-end step runners (locations/hunting, characters, session log).
- Bot now has direct orchestration tests for `ConfigSyncWorker`, `WikiSyncScheduler`, and `runNotionSync` target/combined runtime with key payload/body assertions, but still lacks snapshot-style assertions for larger markdown bodies across multi-message threads.
- Stale-running remediation now exists in web Settings (`/settings/reset-notion-sync`), but there is no automated stale cleanup/alerting yet.
- Scheduled vs manual sync source + `run_id` are persisted (`BOT_NOTION_SYNC_SOURCE`, `BOT_NOTION_SYNC_RUN_ID`) and mirrored into `notion_sync_events`.

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
