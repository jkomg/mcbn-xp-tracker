# Discord Bot

## Overview

The bot (`apps/bot`) is a Discord.js / TypeScript application intended to run as a locally hosted process (launchd, systemd, or Docker on a local machine). It is always on, unlike the Cloud Run web app which scales to zero.

The bot calls the web app's REST API (`/api/*`) using a bearer token. It never writes directly to the database or Google Sheets.

**Runtime entry point:** `src/index.ts`

## Slash Commands

| Command | Who Can Use | Description |
|---------|-------------|-------------|
| `/ping` | Everyone | Basic liveness check |
| `/xp submit` | Players | Interactive multi-step wizard to submit an XP claim |
| `/xp claim` | Players | Submit an XP claim directly |
| `/xp spend` | Players | Submit an XP spend request |
| `/xp spend-cost` | Everyone | Calculate the XP cost of a potential spend without submitting |
| `/xp summary` | Players | Show a character's XP totals (earned, spent, available) |
| `/xp health` | Everyone | Check bot and web app connectivity status |
| `/xp help` | Everyone | Show player help and links |
| `/xp test-reminder` | Staff only | Trigger a claim reminder DM for testing |
| `/xp test-passage` | Staff only | Trigger a passage-of-time announcement for testing |
| `/xp sync-cubby-access` | Staff only | Resync channel access for character cubbies |
| `/combat` | Players / Staff | Combat setup wizard (initiates multi-step modal flow) |

Staff-only commands are restricted to Discord IDs in `BOT_TESTER_IDS`.

## Background Services

### reviewNotifier

Polls `GET /api/review-events` on a configurable interval (default 120 s). When a claim or spend is approved or denied, it posts a notification to the character's "cubby" channel or thread (a channel/thread whose name matches the character name). State is persisted to `data/review-notifier-cursor.json` so the bot does not re-post after a restart.

Requires: `REVIEW_NOTIFIER_ENABLED=true`, `REVIEW_NOTIFIER_GUILD_ID`.

### submissionNotifier

Polls `GET /api/submission-events` on a configurable interval (default 120 s). When new XP claims or spend requests arrive, it posts a summary to a designated staff channel so staff do not need to poll the dashboard. State is persisted to `data/submission-notifier-cursor.json`.

Requires: `SUBMISSION_NOTIFIER_ENABLED=true`, `SUBMISSION_NOTIFIER_CHANNEL_ID`.

### claimReminderService

Sends DM reminders to players who have not yet submitted an XP claim for the current open play period. Runs on a configurable schedule (commonly Sunday 12:00 America/Chicago in project templates; code fallback default is Sunday 08:00 if env vars are omitted). Players can opt out or snooze via buttons in the DM. Opt-out/snooze state is persisted to `data/claim-reminder-preferences.json`.

Requires: `CLAIM_REMINDER_ENABLED=true`, `CLAIM_REMINDER_GUILD_ID`.

### passageOfTimeService

Posts in-world passage-of-time announcements (sunrise, sunset, downtime) to a designated channel on a bi-weekly or 8-week cadence. Sunrise and sunset run every two weeks; downtime runs every eight weeks. Cadence scheduling uses a configurable anchor date and local timezone. Dedupe keys prevent reposting after a restart and are persisted to `data/passage-of-time-state.json`.

Requires: `PASSAGE_OF_TIME_ENABLED=true`, `PASSAGE_OF_TIME_CHANNEL_ID`, `PASSAGE_OF_TIME_GUILD_ID`. Set `PASSAGE_OF_TIME_TEST_MODE=false` to go live.

### autoPeriodCreator

Periodically calls `POST /api/periods/auto-create` (default every 60 min). The web app decides whether a new period is due based on its settings; the bot simply triggers the check. No action is taken if creation is disabled server-side or not yet due.

Requires: `AUTO_PERIOD_CREATOR_ENABLED=true` (bot side) and `AUTO_CREATE_PERIODS_ENABLED=true` (web side).

### autoPeriodCloser

Periodically calls `POST /api/periods/auto-close` (default every 60 min). When the web app closes a period, it returns the list of players who had not submitted a claim; the bot DMs those players a close notification.

Requires: `AUTO_PERIOD_CLOSER_ENABLED=true` (bot side) and `AUTO_CLOSE_PERIODS_ENABLED=true` (web side).

### huntConsequenceMonitor

Monitors designated hunt channels for consequence trigger messages posted by the Eldest bot (a separate dice-rolling bot). When a messy critical or bestial failure trigger is detected, the monitor rolls a d10, determines the consequence from the V5 charts, and posts the result with an action button for staff to confirm. Runs only when the monitored channels are configured.

Requires: `HUNT_CONSEQUENCE_ENABLED=true`, `HUNT_CONSEQUENCE_CHANNEL_IDS`, `HUNT_CONSEQUENCE_STAFF_CHANNEL_ID`.

### configSyncWorker

Polls `GET /api/bot-config` periodically to pick up feature flag changes made on the web app Settings page. This allows toggling bot services at runtime without restarting the bot process.

### botHeartbeatService

POSTs to `POST /api/bot-heartbeat` on a 60-second interval. The web app records the timestamp, which is displayed on the Settings page so staff can verify the bot is alive.

### cubbyChannelMonitor

Monitors channel creation and deletion events in the guild and keeps the internal cubby-channel lookup cache up to date. Used by `reviewNotifier` to find the correct channel or thread for each character.

## Persistent State Files

All state files are written relative to the bot's working directory (`apps/bot/`). The `data/` directory is created automatically.

| File | Used By | Contents |
|------|---------|----------|
| `data/review-notifier-cursor.json` | reviewNotifier | Last processed review event epoch and event key |
| `data/submission-notifier-cursor.json` | submissionNotifier | Last processed submission event epoch and event key |
| `data/claim-reminder-preferences.json` | claimReminderService | Per-user opt-out and snooze state |
| `data/passage-of-time-state.json` | passageOfTimeService | Dedupe keys for posted cadence messages |

## Docker Ops

```bash
npm run ops:docker:up          # start bot container (detached)
npm run ops:docker:down        # stop and remove bot container
npm run ops:docker:logs        # tail container logs
npm run ops:docker:usage-30d   # export 30-day JSON usage audit to stdout
```

Log retention is controlled by `BOT_LOG_MAX_SIZE` (default `25m`) and `BOT_LOG_MAX_FILE` (default `120` files). Full Docker runbook: [RUN_BOT_DOCKER.md](RUN_BOT_DOCKER.md).

## Local Dev

```bash
npm install
npm run dev         # tsx watch mode
npm run build       # compile to dist/
npm start           # run compiled output
npm run check       # type-check
npm test            # run vitest
npm run ops:check-adapter   # connectivity preflight against web app
```
