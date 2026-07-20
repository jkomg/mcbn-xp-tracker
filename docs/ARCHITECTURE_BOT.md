# Discord Bot Architecture Map (apps/bot)

Point-in-time snapshot built 2026-07-20 via a full codebase crawl, to guard against losing track of how the app fits together across long sessions. Verify specifics against current code before relying on them as fact. Companion docs: [ARCHITECTURE_WEB.md](ARCHITECTURE_WEB.md), [PROJECT_HISTORY_AND_THEMES.md](PROJECT_HISTORY_AND_THEMES.md), [REGRESSION_HYGIENE_CHECKLIST.md](REGRESSION_HYGIENE_CHECKLIST.md).

## Command map (`apps/bot/src/commands/`)

**Correspondence suite** (deliver, contact, post, prestation, rumor, cobweb, scene) shares one architecture:
1. Config-gated channel check first (`liveConfig.correspondence*ChannelId || config.correspondence*ChannelId`).
2. Character ownership resolved via `resolveOwnedCharacter` (`services/characterOwnership.ts`).
3. `showModal()` collects free text; a per-command in-memory `Map<discordUserId, ...>` smuggles state (recipient/sender/thread id) from the slash command into the eventual `ModalSubmitInteraction`, since modals can't carry custom data directly.
4. Modal-submit handler defers ephemerally, posts an embed (rumor: raw templated plain content, to preserve markdown/spoiler tags exactly) into the configured channel, edits the ephemeral reply with confirmation.
5. A "Reply" button on the posted message re-enters the modal flow; button/modal handlers for all of these are wired into the manual dispatch chain in `index.ts` (buttons ~574-593, modals ~632-661).
6. `prestation` (structured slash options, no modal) and `scene` (staff Claim/Reject buttons on a triage queue, not a reply button) deviate because their data isn't free text.

Per-command notes: `/rumor`'s `resolveTags()` converts `@word`/`#word` to real mentions but **only against a curated role/location allowlist** (`RUMOR_TAGGABLE_ROLE_NAMES`) — never "any guild role," since the bot posts with its own permissions and unrestricted resolution would let a player trigger a real `@Administrator`/mass-ping. `/contact`'s reply-button handler shows the modal *before* resolving the replying character, as a latency optimization against Discord's ~3s ack deadline.

**Other commands**: `/xp` (submit/claim/spend are stubbed to redirect to the web portal — not live in-Discord flows; summary/history read `adapter.getSummary`; spend-cost is a pure local calc). `/lasombra` (configurable name, staff-only catch-all: approve/edit/update/delete/broadcast/sync-cubbies/scan-activity/permissions — approve→`approveWizard.ts`, edit→`editWizard.ts`, permissions→`permissionsWizard.ts`, each a dedicated wizard module). `/coterie status` (direct read). `/combat start` (multi-step wizard via `combatSetupWizard.ts`, 15-min session TTL). `/ping` (health check).

## Background workers — full enabled-flag audit

**Boot mechanism**: every worker is constructed in `applyStartupConfigOverrides().then(...)` and `.start()`'d in `client.once('ready', ...)` (`index.ts:197-443`). **`index.ts` never checks a worker's `enabled` flag before calling `.start()`** — whether it actually does anything is entirely up to that worker's own internals. This is exactly the mechanism that let `CUBBY_SYNC_ENABLED` silently default `false` in production for two days (fixed in PR #363, `cubbySyncWorker.ts`), and the same shape was subsequently fixed in `SheetsReconcileService`, `WikiSyncScheduler`, and `RetirementAutomationWorker` (PR #364).

### Same footgun shape — check before assuming a worker's "started" log means anything

`start()` logs `"..._started"` **unconditionally** in several workers; the actual `enabled` check is buried inside `tick()`/`pollOnce()` — so a wrong/missing env var produces an identical "it's running" log regardless of whether it ever does anything:

| Worker | File | Real gate checked in | Enabled default | Live-toggle (dashboard) without restart? |
|---|---|---|---|---|
| ReviewNotifier | `reviewNotifier.ts` | `pollOnce()` | `false` | Yes |
| AutoPeriodCreator | `autoPeriodCreator.ts` | `tick()` | `false` | Yes |
| AutoPeriodCloser | `autoPeriodCloser.ts` | `tick()` | `false` | Yes |
| ClaimReminderService | `claimReminderService.ts` | `tick()` | `false` | Yes |
| PassageOfTimeService | `passageOfTimeService.ts` | `tick()` | `false` | Yes |
| SubmissionNotifier | `submissionNotifier.ts` | `pollOnce()` | `false` | Yes |
| CharacterSubmissionNotifier | `characterSubmissionNotifier.ts` | `pollOnce()` | `true` (latent) | No |
| CharacterApprovalNotifier | `characterApprovalNotifier.ts` | `pollOnce()` | `true` (latent) | No |

The above still have this shape as of 2026-07-20 — lower residual risk than the ones already fixed (`CubbySyncWorker`, `SheetsReconcileService`, `WikiSyncScheduler`, `RetirementAutomationWorker`) because the first six *do* have a `liveConfig` mirror (dashboard-visible, no restart needed to check/fix), but `CharacterSubmissionNotifier`/`CharacterApprovalNotifier` do not — worth the same treatment if touched.

### Safe pattern (the fix to copy for any worker still using the unsafe shape)

- `cubbySyncWorker.ts` — checks `!this.cfg.enabled` as the first thing in `start()`, logs a **distinct** `cubby_sync_worker_disabled` warning with an explanatory hint instead of the generic `_started` event, and never sets up the interval at all when disabled. In-code comment documents the incident.
- `sheetImportNotifier.ts` — `if (!this.config.enabled) return;` is the literal first line of `start()`.
- `StaffRoleSyncService`/`MemberEventTracker` — never constructed at all when their flag is off (`config.xEnabled && xGuildId ? new X(...) : null` in `index.ts`), so `?.start()` on `null` produces no misleading log.

**Event-driven "monitors"** (attach a listener once, check `liveConfig.xEnabled` fresh inside every event handler — genuinely live, no restart needed): `characterTicketMonitor.ts`, `huntConsequenceMonitor.ts`, `honeypotMonitor.ts`, `mentionSpamBreaker.ts`, `newMemberGate.ts` (has its own `warnIfMisconfigured` — a good model for surfacing enabled-but-broken config), `cubbyChannelMonitor.ts` (no flag at all, always active).

**Other workers**: `ConfigSyncWorker` (pulls DB-backed dashboard settings into `liveConfig` every `CONFIG_SYNC_INTERVAL_MS`, default 60s; also handles bot-restart-requested and manual-wiki-sync-requested dashboard flags — no enabled flag), `BotHeartbeatService` (posts `liveConfig` snapshot to web app, staggered via `setTimeout(...,15000)` against ConfigSyncWorker), `BotLogForwarder` (drains warn/error buffer to `/api/bot-log` every 30s — this is how bot warnings reach the web Error Alerts page), `ActivityBackfillScanner` (one-shot, manually invoked via `/lasombra scan-activity`, guarded by an in-process flag not an enabled flag).

## `adapter.ts` — the single web-API client (`services/adapter.ts`, ~1880 lines)

Every bot→web-app call goes through `TrackerAdapter`/`WebAppAdapter` — no command or worker calls `fetch` directly. `fetchWithTimeout` wraps requests in an `AbortController` (default 10s timeout — **note this is longer than Discord's ~3s autocomplete ack window**, a known cause of "Loading options failed" under Cloud Run cold starts). Mutations go through `post()`, which adds replay-protection headers and converts non-2xx into `{ok:false, message}` rather than throwing. Auth: legacy single `apiToken` plus optional scoped `readToken`/`writeToken`. Every response is validated through a dedicated zod schema (`.parse()` throws on contract drift, `.safeParse()` where a soft failure is tolerable).

Call categories (not exhaustive): roster/character CRUD, claims/spends, backgrounds, periods, character-creator pipeline, retirement, boons, coteries, contact threads, scene requests, bot control-plane (config/heartbeat/restart-ack/wiki-sync-ack/log), reminders, sheets/wiki triggers, staff-sync/activity recording.

**`getClaimContextResult`** (`adapter.ts:1454-1575`) is the most elaborate call — in-memory cache keyed by requester Discord ID with TTL, a stale-if-error fallback window, bounded retries with backoff, and in-flight de-duplication so concurrent interactions from the same user share one network call. Worth knowing before "optimizing" claim-context fetches elsewhere.

## `config.ts` vs `liveConfig.ts`

`config.ts` is a single zod schema over `process.env`, parsed once at module load — **an invalid env var crashes the process at import time**, not at first use. Enabled-flag convention: `(env.FOO_ENABLED ?? 'false').toLowerCase() === 'true'`, most default `false`; a handful (`ccTicketMonitorEnabled`, `ccSubmissionNotifierEnabled`, `ccApprovalNotifierEnabled`, `retirementAutomationEnabled`, `retirementWikiBatchEnabled`) default `true` — these are the ones at risk if ever explicitly (and silently) disabled. Guild-scoping uses a fallback chain (`*_GUILD_ID ?? DISCORD_GUILD_ID ?? TEST_GUILD_ID`).

`liveConfig.ts` is a plain **mutable, unvalidated** object holding *live* runtime state — seeded from `config` once at boot, then overwritten every `CONFIG_SYNC_INTERVAL_MS` by `ConfigSyncWorker` pulling from the web app's DB-backed Settings dashboard. It exists because `config` is frozen at process start but staff need to flip feature flags from the web UI **without restarting the bot**. Not everything in `config` has a `liveConfig` mirror — see the "Live-toggle?" column above; anything without one requires a full container recreate to change.

## Command registration (`registerCommands.ts`)

Walks `commands/*.{js,ts}`, collects each `command.data.toJSON()`, then issues a single Discord REST **`PUT`** to either `Routes.applicationGuildCommands` (if `guildId = config.testGuildId ?? config.discordGuildId` is truthy — instant propagation) or `Routes.applicationCommands` (global — ~1hr propagation). PUT semantics are a **full replace of that scope**: anything not in this call's array is deleted from that scope; anything in it is created/updated.

**Confirmed real gotcha**: because the PUT only ever targets *one* scope per boot, switching a deployment between guild-scoped and global (e.g. adding/removing `TEST_GUILD_ID`) never clears the *other* scope — orphaned commands stay live in Discord's UI indefinitely, pointing at a bot process whose `client.commands` collection no longer recognizes them. **No cleanup path exists in this codebase** — clearing an abandoned scope requires a manual one-off `rest.put(Routes.applicationGuildCommands(...), {body: []})` (or the global equivalent). Worth checking first next time a command "that shouldn't exist" shows up — though it might also just belong to an entirely different bot application in the same server.

## Interaction dispatch (`index.ts:450-736`)

One large `client.on('interactionCreate', ...)` handler — a manual, sequential-return-early router, not discord.js's built-in framework: access-role gate → autocomplete → string-select-menu chain (combat/claim-wizard/approve/edit/permissions-rollback) → button chain (~10 handlers, correspondence reply buttons included) → modal-submit chain (~12 handlers) → chat-input command (checked against `liveConfig.disabledCommands`, a live per-command kill switch, then `cmd.execute(...)`).

**Error handling**: Discord error `40060` ("already acknowledged") and `10062` ("interaction expired", the ~3s ack deadline) are both logged as `warn` and swallowed — expected/recoverable, not bugs. All other errors log `error`/`command_failure` and attempt a best-effort ephemeral reply, itself wrapped in try/catch (a prior uncaught rejection here once crashed the *entire* bot for every user, not just the failing interaction — this is why). The `Client`'s own `'error'` event is caught and logged. **Deliberately no process-wide `unhandledRejection` handler** — would mask a genuinely fatal startup failure behind a half-initialized, silently-alive container.

**Privileged intent gating**: `GatewayIntentBits.GuildMembers` is only requested if `staffRoleSyncEnabled || memberEventTrackerEnabled || newMemberGateEnabled` — kept opt-in so a fresh install without the Developer Portal privileged-intent toggle doesn't hard-crash.

**Wiki sync mutual exclusion**: `ConfigSyncWorker`'s manual-trigger path and `WikiSyncScheduler`'s nightly path both call the same `runWikiSync()` and both acquire a shared mutex (`wikiSyncLock.ts`) first — the loser skips and logs `*_skipped_lock_busy` rather than racing.

## Test suite

46+ files in `apps/bot/src/__tests__/`. Conventions: `vi.mock('../logger', ...)` to silence/observe `logEvent`; `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync()` for interval-driven worker tests (see `cubbySyncWorker.test.ts` for the canonical example, including asserting the disabled-worker-logs-distinct-warning behavior); hand-built minimal adapter/client stand-ins per test file, no shared mock factory. `docsCommandSemanticsParity.test.ts` reads `docs/BOT.md` off disk and asserts specific rows exist — catches doc/behavior drift directly. `sharedContract.test.ts` cross-checks `SPEND_CATEGORIES`/`XP_COSTS` stay in sync internally.

Commands: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check` (all four + build — this is what CI's `bot-test-and-lint` job runs).

## Dev/test guild (`docs/RUN_BOT_DEV.md`)

A second, fully independent bot process — own Discord application, own `TEST_GUILD_ID`, own dev web backend — running *alongside* production, never instead of it. Exists because several Correspondence commands are inherently multi-party (`/contact` group texts, `/prestation`'s two-step propose/confirm) and can't be solo-tested in production; also gets guild-scoped (instant) command registration for fast iteration. Setup: `.env.dev` from `.env.dev.example`, `npm run ops:setup-test-channels` to create the test channel category, recruit a second real Discord account with a dev-DB character, `npm run dev:test-guild` to run it locally (not Dockerized). This is the mechanism behind the standing "test risky Discord changes on the dev guild first" rule.
