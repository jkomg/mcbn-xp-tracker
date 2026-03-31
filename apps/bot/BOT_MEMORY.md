# Bot Memory (Audit Snapshot)

Last updated: 2026-03-30
Scope: `apps/bot` in `mcbn-xp-tracker`

## What This Bot Does
- Exposes Discord slash commands for XP workflows: claims, spends, summary, health, help, and combat setup.
- Bridges Discord interactions to the web app API (`/api/*`) through `WebAppAdapter`.
- Runs optional background services:
  - claim review notifications to character cubbies (`reviewNotifier`)
  - staff-channel alerts for new submissions (`submissionNotifier`)
  - sunrise claim reminders with opt-out/snooze (`claimReminderService`)
  - automatic period creation trigger (`autoPeriodCreator`)
  - automatic period close trigger (`autoPeriodCloser`)
  - passage-of-time announcements (sunrise/sunset/downtime cadence) (`passageOfTimeService`)
  - hunt consequence dice result monitor (`huntConsequenceMonitor`)
  - bot heartbeat reporting to web app (`botHeartbeatService`)
  - runtime feature flag sync from web app settings (`configSyncWorker`)
  - cubby channel cache maintenance (`cubbyChannelMonitor`)

## Runtime Entry Points
- Main runtime: `src/index.ts`
- Command registration/loading: `src/registerCommands.ts`
- Primary XP command logic: `src/commands/xp.ts`
- Combat command: `src/commands/combat.ts`
- Adapter/network layer: `src/services/adapter.ts`

## Key Internal Modules
- `src/interactiveClaimWizard.ts`: ephemeral multi-step `/xp submit` state machine.
- `src/combatSetupWizard.ts`: multi-step modal flow for `/combat`.
- `src/services/reviewNotifier.ts`: polls review events and posts approvals/denials to cubbies.
- `src/services/submissionNotifier.ts`: polls submission events and posts to staff channel.
- `src/services/claimReminderService.ts`: scheduled reminders + local preferences file.
- `src/services/passageOfTimeService.ts`: cadence-based scheduled message posting.
- `src/services/autoPeriodCreator.ts`: periodic `/api/periods/auto-create` trigger.
- `src/services/autoPeriodCloser.ts`: periodic `/api/periods/auto-close` trigger.
- `src/services/huntConsequenceMonitor.ts`: monitors hunt channels for messy crit/bestial failure triggers.
- `src/services/botHeartbeatService.ts`: POSTs heartbeat to `/api/bot-heartbeat` every 60 s.
- `src/services/configSyncWorker.ts`: polls `/api/bot-config` to pick up runtime flag changes.
- `src/services/cubbyChannels.ts`: normalized cubby channel/thread lookup.
- `src/services/cubbyChannelMonitor.ts`: keeps cubby channel cache up to date on channel create/delete.
- `src/xpRules.ts` + `src/sharedContract.ts`: spend cost computation from shared JSON rules.
- `src/liveConfig.ts`: in-process mutable flag state updated by `configSyncWorker`.

## Commands Exposed
- `/ping`
- `/xp submit`
- `/xp summary`
- `/xp claim`
- `/xp spend`
- `/xp spend-cost`
- `/xp health`
- `/xp help`
- `/combat`
- Staff test/admin tools (restricted to `BOT_TESTER_IDS`):
  - `/xp test-reminder`
  - `/xp test-passage`
  - `/xp sync-cubby-access`

## Required/Important Env
- Required: `BOT_TOKEN`
- Required for command registration: `CLIENT_ID`
- Backend target: `WEB_APP_BASE_URL` (default `http://127.0.0.1:5001`; use `http://web:5001` in Docker full-stack)
- Backend auth: `WEB_APP_API_TOKEN`
- Optional restricted test users: `BOT_TESTER_IDS`, `TEST_REQUESTER_DISCORD_ID`
- Service enable toggles:
  - `REVIEW_NOTIFIER_ENABLED`
  - `SUBMISSION_NOTIFIER_ENABLED`
  - `CLAIM_REMINDER_ENABLED`
  - `AUTO_PERIOD_CREATOR_ENABLED`
  - `AUTO_PERIOD_CLOSER_ENABLED`
  - `PASSAGE_OF_TIME_ENABLED`
  - `HUNT_CONSEQUENCE_ENABLED`

## Local Persistent Data Files
- `data/review-notifier-cursor.json`: cursor (epoch + eventKey) for review event polling.
- `data/submission-notifier-cursor.json`: cursor for submission event polling.
- `data/claim-reminder-preferences.json`: opt-out/snooze state by Discord user ID.
- `data/passage-of-time-state.json`: dedupe keys for posted cadence messages.

## Operational Runbook
1. Install + validate
   - `npm install`
   - `npm run check`
2. Adapter connectivity preflight
   - `npm run ops:check-adapter`
3. Local deploy/restart helper
   - `npm run ops:deploy-local`
4. Bot runtime
   - Dev: `npm run dev`
   - Prod/local service: `npm run build && npm start`
5. Docker ops
   - `npm run ops:docker:up` / `ops:docker:down` / `ops:docker:logs` / `ops:docker:usage-30d`

## Current Audit Findings
1. No critical or high-severity code defects found in the audited bot paths.
2. Automated coverage is strong on command/adapter/rules paths, but still thinner for scheduler side effects (reminder cadence, passage windows, and cross-restart dedupe behavior).
3. JSON state files are path-resolved from `process.cwd()`; service launch working directory must remain `apps/bot`.
4. Docs had drift around claim-reminder defaults (template noon vs code fallback 08:00); normalized in `docs/BOT.md` and `docs/ENV_AND_SECRETS.md`.

## Invariants to Preserve
- Evidence links for claims must remain validated as Discord message links in the same guild.
- Adapter calls must keep timeout + retry + stale-cache behavior for claim context.
- Test/admin commands must stay restricted to `BOT_TESTER_IDS`.
- Scheduler services must remain idempotent (dedupe keys, once-per-window behavior).
- `configSyncWorker` updates `liveConfig` in-process; services must read from `liveConfig`, not the initial `config` snapshot, to pick up runtime flag changes.
