# Bot Memory (Audit Snapshot)

Last updated: 2026-03-09
Scope: `apps/bot` in `mcbn-xp-tracker`

## What This Bot Does
- Exposes Discord slash commands for XP workflows: claims, spends, summary, health, and help.
- Bridges Discord interactions to the web app API (`/api/*`) through `WebAppAdapter`.
- Runs optional background services:
- claim review notifications to character cubbies
- sunrise claim reminders with opt-out/snooze
- automatic period creation trigger
- passage-of-time announcements (sunrise/sunset/downtime cadence)

## Runtime Entry Points
- Main runtime: `src/index.ts`
- Command registration/loading: `src/registerCommands.ts`
- Primary command logic: `src/commands/xp.ts`
- Adapter/network layer: `src/services/adapter.ts`

## Key Internal Modules
- `src/interactiveClaimWizard.ts`: ephemeral multi-step `/xp submit` state machine.
- `src/services/reviewNotifier.ts`: polls review events and posts approvals/denials to cubbies.
- `src/services/claimReminderService.ts`: scheduled reminders + local preferences file.
- `src/services/passageOfTimeService.ts`: cadence-based scheduled message posting.
- `src/services/autoPeriodCreator.ts`: periodic `/api/periods/auto-create` trigger.
- `src/services/cubbyChannels.ts`: normalized cubby channel/thread lookup.
- `src/xpRules.ts` + `src/sharedContract.ts`: spend cost computation from shared JSON rules.

## Commands Exposed
- `/ping`
- `/xp submit`
- `/xp summary`
- `/xp claim`
- `/xp spend`
- `/xp spend-cost`
- `/xp health`
- `/xp help`
- Staff test/admin tools:
- `/xp test-reminder`
- `/xp test-passage`
- `/xp sync-cubby-access`

## Required/Important Env
- Required: `BOT_TOKEN`
- Required for command registration: `CLIENT_ID`
- Backend target: `WEB_APP_BASE_URL` (https required unless localhost)
- Backend auth: `WEB_APP_API_TOKEN` (or read/write split tokens on web side)
- Optional restricted test users: `BOT_TESTER_IDS`, `TEST_REQUESTER_DISCORD_ID`
- Scheduler toggles:
- `REVIEW_NOTIFIER_ENABLED`
- `CLAIM_REMINDER_ENABLED`
- `AUTO_PERIOD_CREATOR_ENABLED`
- `PASSAGE_OF_TIME_ENABLED`

## Local Persistent Data Files
- `data/claim-reminder-preferences.json`: opt-out/snooze state by Discord user id.
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

## Current Audit Findings
1. No critical or high-severity code defects found in the audited bot paths.
2. Automated coverage is strong on command/adapter/rules paths, but limited for scheduled services and Discord posting side effects.
3. JSON state files are path-resolved from `process.cwd()`; service launch working directory must remain `apps/bot`.

## Invariants to Preserve
- Evidence links for claims must remain validated as Discord message links in the same guild.
- Adapter calls must keep timeout + retry + stale-cache behavior for claim context.
- Test/admin commands must stay restricted to `BOT_TESTER_IDS`.
- Scheduler services must remain idempotent (dedupe keys, once-per-window behavior).
