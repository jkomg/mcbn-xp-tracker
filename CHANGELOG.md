# Changelog

## [2026-09-16] Each Background Blank Returns on Its Own Night

### Deploy Note: Read Before Shipping

- **Deploy when nobody is mid-night.** Migration `8a3e5c7d9b21` copies every
  outstanding blank into the new `character_background_blanks` table once, then
  the new code reads only that table. A blank taken on the *previous* Cloud Run
  revision while the deploy is cutting over is written only to the old columns
  and **will not exist afterwards**. The player can simply blank again. This was
  accepted instead of a three-release dual-write; see
  `openspec/changes/per-blank-background-release/design.md`. If a player reports
  a blank that vanished around deploy time, this is why.
- Rolling back needs `flask db downgrade 3f81c22ad5e7`, not only a code revert.
  The downgrade folds outstanding blanks back into the old columns.

### Per-Blank Release Tracking

- **Behaviour change.** A background used to hold one blank, so a second blank
  before the first returned had to share a single release night. #434 made the
  earlier night win, which stopped held dots being pushed out a whole downtime
  cycle but brought later blanks back too soon. Now every act of blanking is its
  own row with its own release night, and blanking again never moves one already
  out. The #434 interim rule is gone, and so is blanking's inline auto-release:
  release happens only in the two-minute release worker.
- `dots_blanked`, `release_night_number` (the next return) and
  `blanked_at_night_number` are now read-only properties derived from the
  outstanding blanks. The old columns stay in the table, unmapped, until
  `openspec/changes/drop-legacy-blank-columns/` drops them.
- The rating bound is enforced inside the insert, so two coterie members blanking
  the last dot at once cannot both succeed. A write conflict is retried; if it
  persists the player is told to try again, not that no dots are available.
- Lowering a rating (player edit or staff approval of a creator draft) trims
  outstanding blanks newest first, keeping the earliest promised return. Ending a
  donation discards the coterie's outstanding blanks.
- The player sheet, coterie sheet and `/roster/blanks` show each blank with its
  night. `GET /api/backgrounds/status` adds a `blanks` list. The bot is unchanged:
  its schema ignores the new field, and `release-due` keeps one entry per
  background.
- **Audit.** New entries: `coterie_background_blank`,
  `coterie_background_blanks_discarded` (undonate and member removal), and
  `cc_draft_approve`. Creator approval previously wrote no audit entry at all.
  `player_background_set` now notes discarded blanked dots. All are log-only,
  like `player_background_blank`.

### Fixes Found Along the Way

- **Creator-draft approval with backgrounds failed.** `cc_admin.draft_approve`
  called a module-level helper as a `DBService` method. Since 2026-06-18, every
  draft carrying backgrounds raised after its roster entry was committed, so
  staff saw an error and the backgrounds were never created.
- **The migration race retry never retried.** `flask_migrate.upgrade` turns
  Alembic's `CommandError` into `sys.exit(1)`, which `_upgrade_with_race_retry`
  did not catch. An instance that lost the `alembic_version` race exited instead
  of retrying.
- **`db.create_all()` at boot is now retried the same way**, rather than a
  concurrent boot failing on a table the other instance just created.
- Tests: `test_background_blank_lots.py`, `test_background_lots_routes.py`,
  `test_per_blank_migration.py`, and additions to
  `test_coterie_donation_blanking.py` and `test_upgrade_race_retry.py`.

---

## [2026-09-16] Staff View of Blanked Backgrounds, Clearer Release Message (Issue #431)

### Blanked Backgrounds Page

- **New staff page** at **Roster → Blanked Backgrounds** (`/roster/blanks`) listing
  every background with dots blanked: character, background, dots blanked of the
  rating, the night the blank was taken, and the night that returns them with that
  night's calendar start date.
- Each row is marked **Not yet due**, **Due, not released** (the releasing night has
  started but the dots are still out — release runs every two minutes, so this means
  the bot or the night's period needs attention), or **Night not on calendar** (the
  release worker holds these until `app/game_calendar.py` is extended; it currently
  ends at Night 77). Due and off-calendar rows also raise a banner.
- Read-only by design. A manual release button would be a second release path with
  its own timing, which is the kind of bug this page exists to make visible.
- Tests: [`apps/web/tests/test_roster_blanks_view.py`](apps/web/tests/test_roster_blanks_view.py),
  with rows created through `blank_character_background` and the calendar date pinned.

### Release Notification Says the Dots Are Usable Now

- The cubby message now reads *"your **3 dots** of **Mawla** are back and can be used
  now."* It no longer appends `Current night: <period label>`: that label embeds the
  period's date range, and on 2026-09-04 it read as a future date for the release.
- Tests: [`apps/bot/src/__tests__/backgroundBlankReleaseService.test.ts`](apps/bot/src/__tests__/backgroundBlankReleaseService.test.ts).
  The bot ships separately (image tag bump in `home-automation`); the web change does
  not depend on it.

---

## [2026-09-12] Donated Backgrounds Are Spendable Again

### approve_donation Was Blanking Every Dot

- **Bug fix.** Approving a background donation set `dots_blanked = dots_total`,
  driving `dots_available` to 0. That hid the coterie's own Blank control, which
  is gated on `dots_available > 0`, and made `blank_character_background` refuse
  with "only 0 available" — so `blank_donated_background` was **unreachable** for
  a properly donated background, despite having a route, a UI control and a
  "blanked until Night N" badge.
- Donating hands the background to the coterie as an asset its members spend over
  time; it does not withhold the dots from everyone. `undonate_background` and
  `remove_member` still reset `dots_blanked` to 0, cancelling the coterie's
  outstanding blanks and returning the background to its owner whole.
- Tests: [`apps/web/tests/test_coterie_donation_blanking.py`](apps/web/tests/test_coterie_donation_blanking.py),
  exercising approve → blank → undonate through the real routes. The existing
  orphaned-background fixture built its rows with `dots_blanked = 0`, matching the
  intended behaviour rather than the shipped one, which is why this went unnoticed.

---

## [2026-09-12] Background Blank Release Timing (Issue #431)

### Dots Return When the Night Opens, Not When Its Period Does

- **Behaviour change.** Blanked background dots now return at the opening of the
  first night after the next downtime, per the rule
  `game_calendar.next_night_after_downtime` already documented. Previously they
  returned as soon as staff opened that night's play period for submissions,
  which is routinely days earlier — on 2026-09-04 a player was told 3 dots of
  Mawla had refreshed, citing Night 69, which opens 9/8.
- Release was comparing against `_current_open_night()`, resolved from
  `submissions_open`/`active` flags with no reference to `start_date`. Added
  `game_calendar.night_has_started()` / `night_start_date()` and gated release on
  the calendar instead. The period condition is kept as well as the new one, so
  the change can only ever make a release later, never earlier.
- Gated both release paths: the `POST /api/backgrounds/release-due` worker and
  `blank_character_background`'s auto-release of an older due blank, which had
  the same flag-based comparison.
- A releasing night the calendar does not list is now held rather than released —
  the recoverable direction. The calendar currently ends at Night 77 (2027-01-10).
- Blanks released early before this change are left released; dots a player may
  already have spent are not clawed back.
- Tests: [`apps/web/tests/test_game_calendar_night_start.py`](apps/web/tests/test_game_calendar_night_start.py)
  and new cases in [`apps/web/tests/test_background_blanking.py`](apps/web/tests/test_background_blanking.py).

---

## [2026-09-12] Coterie Activity Filters and Purchase Accounting (PR #428 follow-up)

### Review Findings on the Merged Coterie Work

- **Privacy.** `index()` duplicated the member and invitation lookups inline
  without the activity filter the helpers received, so a retired character's
  coterie stayed listed for that player — name, description, status, member
  count — even though the sheet itself was denied. Both now filter on
  `DbCharacter.active`.
- **Accounting.** A member buying an orphaned background carries `coterie_id`,
  the same column coterie XP donations use, so purchases appeared in the
  donations table and inflated its total. Both queries now exclude rows with
  `purchased_background_id`.
- **Pricing correction.** An orphaned background is now priced on its full
  rating (`dots_total`), not on unblanked dots. Blanked dots are not spent —
  they return at the next release — so charging on availability let a coterie
  blank a background and then buy it at a discount while still receiving a row
  that returned to full. The row now transfers intact, pending release included,
  so nothing is destroyed in the handover.
- **One character per player per coterie.** Two of a player's characters could
  each accept an invitation to the same coterie and each commit two creation
  dots, while `_get_acting_member` returns only one of them — leaving the other
  a member who can never act but whose dots are spent.

---

## [2026-04-20] Clickable Background Blanking (Issue #174)

### Per-Character Tracking + One-Night Blank/Release Cycle

- Added tracked character backgrounds in web DB (`character_backgrounds`) with per-background dot totals and blanked-dot state.
- Added player-facing Background Blanking UI on character pages:
  - set/update/remove tracked backgrounds
  - blank a chosen number of dots for the current night
  - live display of total/blanked/available dots and scheduled release night
- Added bot API endpoints for background workflows:
  - `GET /api/backgrounds/status`
  - `POST /api/backgrounds/blank`
  - `POST /api/backgrounds/release-due`
- Added `/lasombra blank` command with ownership enforcement for players and staff-targeting support.
- Added automated background release notifications to character cubbies via a new bot release monitor service.
- Added focused web tests in [`apps/web/tests/test_background_blanking.py`](apps/web/tests/test_background_blanking.py).

---

## [2026-04-20] Wiki Sync Modularization (Phase 10)

### Golden Assertions for Sync Payload and Body Output

- Strengthened [`runNotionSyncTargets.test.ts`](apps/bot/src/__tests__/runNotionSyncTargets.test.ts) with concrete output assertions for both-target sync runs.
- Added deterministic payload-builder spies for Notion create payloads and asserted key generated values:
  - location payload includes `locationName: Broadway`
  - hunting-site payload includes `siteName: Site One`
  - SPC payload includes `name: SPC Name`
  - session payload includes `#music-city-histories archive` and retired thread title entries
- Added concrete wiki upsert assertions for generated page shape/content:
  - location page slug/category/title
  - SPC character page slug/category/title/body
  - lore archive page slug/category/title
  - location body contains the expected `Hunting Sites` section and site heading
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE10.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE10.md).

---

## [2026-04-20] Wiki Sync Modularization (Phase 9)

### Full-Flow Orchestration Coverage: Both-Target Runtime

- Expanded [`runNotionSyncTargets.test.ts`](apps/bot/src/__tests__/runNotionSyncTargets.test.ts) with a richer seeded Discord fixture set (city/text/forum channels, profile threads, retired thread, pins, and lore messages).
- Added explicit both-target runtime coverage for `runNotionSync` (`syncToNotion=true`, `syncToWiki=true`) asserting:
  - Notion client/database/page write path executes.
  - Wiki upsert/delete/status write paths execute.
- Preserved existing assertions for target-separated runs:
  - notion-only: no wiki writes
  - wiki-only: no Notion writes
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE9.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE9.md).

---

## [2026-04-20] Wiki Sync Modularization (Phase 8)

### Runtime Efficiency: Skip Disabled Target Work

- Tightened target separation in [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts) so Notion-only runs skip wiki-only execution paths instead of invoking wiki client no-op calls.
- Added explicit `WIKI_ENABLED` gating for:
  - location wiki upserts in hunting-site pass
  - SPC/PC/lore wiki writes
  - stale lore wiki cleanup
  - coteries/factions wiki generation
  - retired-character wiki/status updates
  - PC profile map fetch for children-of-the-night
- Corrected coterie/faction created-count logging to report actual writes performed.
- Expanded orchestration tests in [`runNotionSyncTargets.test.ts`](apps/bot/src/__tests__/runNotionSyncTargets.test.ts) with seeded channel/message fixtures:
  - notion-only runs now assert zero wiki write calls
  - wiki-only runs now assert zero Notion write calls while wiki writes continue
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE8.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE8.md).

---

## [2026-04-20] Wiki Sync Modularization (Phase 7)

### Bot Sync Orchestration Coverage: Targeted Runtime Gating

- Added direct orchestration tests for `runNotionSync` in [`runNotionSyncTargets.test.ts`](apps/bot/src/__tests__/runNotionSyncTargets.test.ts).
- Added fail-fast coverage when neither Notion nor Wiki target is enabled.
- Added execution coverage for:
  - Notion-only runs (`syncToNotion=true`, `syncToWiki=false`)
  - Wiki-only runs (`syncToNotion=false`, `syncToWiki=true`)
- Tests use mocked Discord/Notion/wiki clients to validate target gating behavior without external network dependencies.
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE7.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE7.md).

---

## [2026-04-20] Wiki Sync Modularization (Phase 6)

### Explicit Target Separation: Notion vs Wiki

- Added explicit target selection support in [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts):
  - `--notion-only`
  - `--wiki-only`
- Added `syncToNotion` / `syncToWiki` options to `runNotionSync` so callers can run sinks independently.
- Extracted target gating logic into [`syncTargets.ts`](apps/bot/src/scripts/notionSync/syncTargets.ts).
- Sync now fails fast with a clear error when neither target is enabled (for example missing tokens with both targets requested).
- Added focused tests in [`syncTargets.test.ts`](apps/bot/src/__tests__/syncTargets.test.ts).
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE6.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE6.md).

---

## [2026-04-20] Wiki Sync Modularization (Phase 5)

### Bot Web Wiki Client Extraction

- Extracted wiki/status API write wrappers from [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts) into [`webWikiClient.ts`](apps/bot/src/scripts/notionSync/webWikiClient.ts).
- Centralized Chronicle Wiki write endpoint handling for:
  - `POST /api/wiki/page` (upsert)
  - `DELETE /api/wiki/page/{slug}` (delete)
  - `PUT /api/character/{name}/status` (retired status updates)
- Updated `discord-notion-sync.ts` to use a `WebWikiClient` instance with no sync behavior change.
- Added focused tests in [`webWikiClient.test.ts`](apps/bot/src/__tests__/webWikiClient.test.ts) for dry-run, lock-skip, status handling, and error logging semantics.
- Added release notes: [`docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE5.md`](docs/RELEASE_2026-04-20_WIKI_SYNC_MODULARIZATION_PHASE5.md).

---

## [2026-04-18] Production Ops + Efficiency Hardening

### Deploy Guardrails and Cost Baseline Pinning

- Hardened both Cloud Run deploy paths (`apps/web/deploy.sh` and `.github/workflows/deploy-web.yml`) to explicitly set:
  - `cpu=1`, `memory=256Mi`
  - `min-instances=0`, `max-instances=2`
  - `concurrency=80`
  - `timeout=120`
  - `cpu-throttling=true`
  - `session-affinity=false`
- Added `scripts/check-cloudrun-efficiency.sh` to detect runtime drift from the expected lean baseline.
- Updated bot template defaults for control-plane polling to reduce idle API chatter:
  - `CONFIG_SYNC_INTERVAL_MS=120000`
  - `BOT_HEARTBEAT_INTERVAL_MS=120000`
- Added release notes: [`docs/RELEASE_2026-04-18_PROD_OPS_EFFICIENCY_HARDENING.md`](docs/RELEASE_2026-04-18_PROD_OPS_EFFICIENCY_HARDENING.md).

---

## [2026-04-18] Wiki Sync Modularization (Phase 4)

### Bot Notion Payload Builder Extraction

- Extracted Notion page payload construction from [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts) into [`notionPayloadBuilders.ts`](apps/bot/src/scripts/notionSync/notionPayloadBuilders.ts).
- Centralized payload builders for:
  - location entries
  - hunting site entries
  - SPC entries
  - PC tracker entries
  - session/post log entries
- Updated `discord-notion-sync.ts` to call the shared payload builders with no behavior change.
- Added focused tests in [`notionPayloadBuilders.test.ts`](apps/bot/src/__tests__/notionPayloadBuilders.test.ts).
- Added release notes: [`docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE4.md`](docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE4.md).

---

## [2026-04-18] Wiki Per-Page Sync Lock

### Manual Guardrail for Discord→Wiki Sync

- Added a per-page `sync_locked` control on wiki pages to prevent bot sync from overwriting/deleting specific pages while staff apply manual fixes.
- Staff can now lock/unlock pages from the wiki page sidebar:
  - `POST /wiki/lock/<slug>`
  - `POST /wiki/unlock/<slug>`
- Bot-facing wiki endpoints now return `423 Locked` with `{ "status": "locked" }` when a page is sync-locked:
  - `POST /api/wiki/page`
  - `DELETE /api/wiki/page/{slug}`
- Bot sync now treats `423` responses as intentional skips (info logs) rather than warnings.
- Added migration: `c9b4e1d8f2a0_add_sync_lock_fields_to_wiki_pages.py`.

---

## [2026-04-18] Wiki Sync Modularization (Phase 3)

### Bot Notion Write Maintainability

- Extracted Notion write/retry helpers from [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts) into [`notionWrites.ts`](apps/bot/src/scripts/notionSync/notionWrites.ts).
- Centralized Notion helper behavior for:
  - `notionCall` retry/backoff wrapper
  - `appendBodyBlocks` chunked block writes
  - `cleanupPreImportEntries` archive pass for non-sync rows
  - shared `SOURCE_TAG` and title extraction helper
- Added focused tests in [`notionWrites.test.ts`](apps/bot/src/__tests__/notionWrites.test.ts) for retry, chunking, and cleanup semantics.
- Added release notes: [`docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE3.md`](docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE3.md).

---

## [2026-04-18] Wiki Sync Modularization (Phase 2)

### Bot Discord Ingest Maintainability

- Extracted Discord REST ingest helpers from [`discord-notion-sync.ts`](apps/bot/src/scripts/discord-notion-sync.ts) into [`discordIngest.ts`](apps/bot/src/scripts/notionSync/discordIngest.ts).
- Centralized typed pagination/fetch behavior for:
  - `fetchAllMessages`
  - `fetchForumThreads`
  - `fetchPins`
  - `fetchGuildMember`
- Added targeted ingest tests in [`discordIngest.test.ts`](apps/bot/src/__tests__/discordIngest.test.ts) to lock pagination/filtering/error behavior before deeper refactors.
- Added release notes: [`docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE2.md`](docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE2.md).

---

## [2026-04-18] Wiki Sync Modularization (Phase 1)

### Bot Wiki Sync Maintainability

- Extracted wiki-focused sync helpers from `apps/bot/src/scripts/discord-notion-sync.ts` into `apps/bot/src/scripts/notionSync/wikiSyncHelpers.ts`.
- Centralized slug generation, markdown sanitization/rendering, SPC type inference, domain mapping, and coterie/faction taxonomy constants used by the sync pipeline.
- Added targeted helper tests in `apps/bot/src/__tests__/wikiSyncHelpers.test.ts`.
- Added release notes: `docs/RELEASE_2026-04-18_WIKI_SYNC_MODULARIZATION_PHASE1.md`.

---

## [2026-03-14] Bulk Approvals, Claim Amendment, and Spend Queue

### Bulk Claim Approval

Staff can now approve multiple pending XP claims in a single action. The pending claims list has a checkbox on every row and a select-all in the header. Checking any claim reveals a sticky bar at the bottom showing how many are selected and the total XP. Clicking "Approve Selected" opens a confirmation modal listing each claim (character, period, XP amount) with an optional shared notes field. All selected claims are approved at their requested XP in one submit — individual review is still available when an amount needs adjusting.

### Claim Amendment

Staff can re-open a denied claim for player correction instead of asking them to re-submit from scratch. On the denied claim's review page, a "Re-open for Amendment" card lets staff write an optional note explaining what to fix (e.g. "wrong link on the posted_once category"). The claim enters a new *Awaiting Amendment* state.

On the player's character page, a blue alert appears for each claim awaiting amendment, showing the staff's note inline with an "Edit & Resubmit" button. That button opens a pre-filled form with all the original evidence links — the player fixes what was wrong and resubmits. The original record is updated in place (no duplicate created), review fields are cleared, and the claim returns to the pending queue for re-review.

### Spend Queue Dependency Tracking

Players can now submit the full upgrade chain for a trait upfront without waiting for each step to be approved first. On the spend form, a "Queue after" dropdown appears when the character has pending spends — selecting one marks the new request as depending on that one.

On the staff spend review page, a dependency chain card shows which spend this one is waiting on (with its current approval status and a direct link) and which spends are queued behind it. Dependencies are informational — staff can approve in any order — but the chain gives full context at a glance and eliminates the back-and-forth of "approve this, now submit the next one."

---

## [2026-03-14] Turso DB Migration, Security Hardening, and Developer Practices

### Breaking Changes

- **Database**: Google Sheets is no longer the primary data store. Turso (libsql) is now the system of record. All reads and writes go through SQLAlchemy models. Sheets sync continues as a best-effort background mirror.
- **`DATABASE_URL` required in production**: Set `DATABASE_URL=libsql+https://...` and `TURSO_AUTH_TOKEN` in Cloud Run secrets. See `docs/ENV_AND_SECRETS.md`.

### Database Migration (Turso / libsql)

- Replaced Sheets-as-primary-DB with SQLAlchemy + Turso (libsql) for all claims, spends, characters, ledger, and audit log.
- Local dev defaults to SQLite when `DATABASE_URL` is unset.
- SQLite path is now resolved to absolute at config load time so containers and migrations agree on the file path.
- Added Flask-Migrate for schema change management. Baseline revision stamped; future changes use `flask db migrate` / `flask db upgrade`.
- Added `platforms: linux/amd64` to all Docker compose build targets to fix libsql-experimental ARM wheel absence.
- See release notes: `docs/RELEASE_2026-03-13_TURSO_DB_MIGRATION.md`.

### Security

- Fixed `require_character_owner` auth guard to use DB service instead of stale Sheets reference.
- Added input length caps on all free-text fields: `wildcard_reason` ≤500, `justification` ≤1000, staff notes ≤1000, roster reason ≤500.
- Added rate limits to player-facing claim and spend submit endpoints (10/min).

### Performance

- `GET /api/review-events` now filters claims and spends at the DB level (`review_date >= since_date_str`, `status IN ('approved', 'denied')`) instead of fetching all rows and filtering in Python.
- Added composite DB index on `(character_name, play_period)` for claim lookups.

### API Documentation

- Added `docs/API_ENDPOINTS.md` documenting all 8 bot-facing endpoints with auth model, replay protection headers, request/response schemas, error codes, and pagination pattern.

### Developer Practices

- Added `.pre-commit-config.yaml`: ruff lint+format for `apps/web/`, plus yaml/json/trailing-whitespace/merge-conflict/large-file hooks.
- Added `apps/web/requirements-lock.txt` (pip-compiled): all transitive Python dependencies pinned for reproducible CI and local installs.
- Added `apps/web/pyproject.toml`: pytest and coverage config (`--cov-fail-under=30`, missing-line reporting).
- CI (`web-test-and-lint`) now installs from `requirements-lock.txt`, runs pytest with 30% coverage gate, and runs mypy as an informational (non-failing) type check.
- Added Flask-Migrate skeleton: `apps/web/migrations/` with baseline revision and schema change workflow documented in `apps/web/migrations/README`.

## [2026-03-11] Containerized Local Profiles, Notification Tuning, and Review Stability

### Containerized Local Profiles

- Added root compose profiles:
  - `compose.web.yml` for web-only local runtime.
  - `compose.full.yml` for local web + bot runtime.
- Added one-command bootstrap script:
  - `./scripts/bootstrap-local.sh web-only`
  - `./scripts/bootstrap-local.sh web+bot`
- Added web Docker runbook: `docs/RUN_WEB_DOCKER.md`.

### Review Workflow Fixes

- Hardened claim/spend status normalization against case and trailing/leading whitespace from sheet values.
- Fixed claim review lock-state mismatch between local/prod when status formatting differs.
- Fixed roster edit crash when `Creation / Audit XP` is left blank.
- Made spend justification links clickable in staff review UI.

### Bot Notification Fixes

- Updated review notifier copy so approved **claim** notifications no longer request sheet upload.
- Kept approved **spend** notification sheet-upload guidance.

### Documentation and CI

- Added release note: `docs/RELEASE_2026-03-11_CONTAINERIZATION_AND_FIXES.md`.
- Added env/secrets standardization runbook: `docs/ENV_AND_SECRETS.md`.
- Added docs parity check script: `scripts/check-docs-parity.sh`.
- Extended CI with compose validation + web Docker smoke startup checks.

## [2026-03-10] Web UI Overhaul — Design, Mobile, and Player Features

### Visual Design

- Added Nashville neon cityscape (`music.png`) as login page background, sidebar logo banner, and player navbar background.
- Added blood-drop SVG favicon.
- Applied Cinzel (Google Fonts) to all headings for VtM gothic aesthetic.
- Introduced 18-clan color identity system: `--clan-color` CSS variable per clan, applied as left-border on roster rows, character list items, character hero, and clan badges. Clan CSS class derived from `char.clan | lower | replace(' ', '-')`.
- Added stat cards with color-coded top borders and Bootstrap Icons to the staff dashboard.
- Added amber action-strip alert banner to dashboard when claims or spends are pending.

### Player-Facing Features

- **Character hero**: Replaced plain header with a styled hero card showing character name (Cinzel), clan/sect/age metadata, XP breakdown (Total / Earned / Spent), a progress bar, and a large "Available XP" number. Hero border color follows clan identity.
- **Claim form UX**: Collapses by default; auto-expands when an unclaimed open period exists. Period pills in the header show claimed (green) vs. unclaimed (grey) status at a glance.
- **Approved spends view**: Replaced tabular list with a character-sheet-style grouped view using `groupby('spend_category')` and five dot pips showing progression per trait.
- **Mobile bottom nav**: Fixed bottom navigation bar on the character page (mobile only) with quick-access buttons for Claim XP, Spend XP, Wish List, and History.
- **Open period banner**: Player landing page now shows a pulsing green banner listing currently open play periods when submissions are active.
- **Chronicle Calendar**: Game calendar widget on the player landing page. Shows a hero block for the currently active night (with days-remaining countdown) or the next upcoming night (with days-until countdown). Displays the last few past entries (greyed), current entry highlighted, and upcoming entries with a "Show full calendar" toggle for the full season view. Calendar data lives in `apps/web/app/game_calendar.py`.
- **Wish List**: Per-character purchase planner on the character page, stored in `localStorage`. Players add planned trait purchases (category, trait name, from/to dots); XP cost is calculated live using the same V5 rules as the spend form. A running summary shows total XP planned vs. available, and whether they're short. Each wish list item has a one-tap "pre-fill spend form" shortcut.

### Staff-Facing Features

- **Dashboard**: Filter tabs (All / Active / No Claims), clickable rows (`data-href`), clan badges in Clan column, ⚠ badge on active characters with no submissions.
- **Claims / Spends pending**: Clickable rows, XP as colored badge, empty-state card with icon, History button in header.
- **Claims review**: Two-column layout — evidence cards with ✓/✗ icons and clickable Discord links (col-lg-7) and sticky approve/deny panel with character quick-link (col-lg-5). Locked state displayed for already-reviewed claims.
- **Spends review**: Two-column layout — trait card with dot pip progression, justification as quoted card, cost validation with Can Afford badge, sticky approve/deny panel.
- **Roster**: Clan badges on clan column, clickable rows, sortable columns, `has-clan-color` left-border on rows.

### Mobile Responsiveness (Staff)

Applied `d-none d-sm/md/lg-table-cell` across all staff tables to preserve usability on small screens:

| View | Always visible | Hidden until sm/md/lg |
|---|---|---|
| Dashboard | Character, Available XP | Clan (md), XP columns (lg), Last Submission (md) |
| Claims Pending | Character, XP, Actions | Period (md), Submitted (sm) |
| Spends Pending | Character, Trait, XP, Actions | Category (md), Dots (sm), Submitted (sm) |
| Roster | Name, Available XP | Clan (sm), Age/Sect (md), Active (sm) |
| Claims History | Character, Status | Period (sm), XP columns (md), Reviewer (lg) |
| Spends History | Character, Trait, Status | Category/Costs (md), Dots (sm), Reviewer (lg) |

### Bug Fixes

- Fixed `parents[4]` `IndexError` in `audit.py` and `local_status.py` when running inside Docker (container path depth is 4, not 5). Now uses `_parents[min(4, len(_parents) - 1)]`.

## [2026-03-03] Monorepo Migration Completion

### Ops and Reliability

- Standardized single canonical local workspace to `/Users/jasonkennedy/Projects/mcbn-xp-tracker`.
- Added go-live runbook checklist at `docs/GO_LIVE_CHECKLIST.md`.
- Added release note document for migration completion at `docs/RELEASE_2026-03-03_MONOREPO_MIGRATION.md`.

### Validation

- Bot quality gate passed (`lint`, `format:check`, `typecheck`, `test`, `build`).
- Backend pytest suite passed (`12 passed`).
- Bot startup validated with successful guild command registration.

### Configuration Fixes

- Corrected bot runtime configuration expectations:
  - `apps/bot/.env` is the authoritative bot env file.
  - `CLIENT_ID` must be numeric Discord application ID (snowflake).

### Documentation

- Added explicit installation paths:
  - `docs/INSTALL_LITE.md` (web-only)
  - `docs/INSTALL_REGULAR.md` (web + bot)
- Updated README to direct users to Lite vs Regular setup paths.
- Updated `docs/RUN_BOT_LOCAL.md` env variable guidance to match bot runtime (`BOT_TOKEN`, `CLIENT_ID`, `TEST_GUILD_ID`).

## [2026-02-26] Security, Performance, and XP Rule Update

### Security

- Added CSRF protection for session-authenticated form actions.
- Added secure session cookie defaults and session lifetime configuration.
- Hardened bot token auth with constant-time comparison.
- Added rate limits to bot-facing API endpoints.
- Added safe post-login redirect handling to prevent open redirect behavior.
- Added stronger server-side bounds validation for XP approval and spend inputs.

### Performance

- Reduced Google Sheets write overhead by caching next write row per tab.
- Replaced multiple per-cell writes with batch/range updates where appropriate.
- Optimized dashboard aggregation to precompute claim/spend/ledger totals.
- Removed duplicate audit-log reads in the audit view.
- Removed roster page N+1 XP total computations.

### Usability and Correctness

- Fixed roster filter query parameter mismatch (`clan`/`sect`).
- Fixed spend review template field bindings.
- Added keyboard-accessible table sorting states in roster view.
- Extended confirm-dialog handling for button-based confirmations.
- Updated dev startup script to prefer repo venv Python.
- Fixed Advantage (Merit/Background) XP cost model to `3 XP per dot purchased`
  (for example `0->2 = 6 XP`).

### Testing

- Added pytest configuration scoped to project tests.
- Added tests for:
  - safe auth redirect handling
  - bot token auth checks
  - dashboard aggregation behavior
  - Advantage XP cost behavior

### Open Source Readiness

- Added `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `SUPPORT.md`, and `NOTICE.md`.
- Added GitHub issue templates and pull request template under `.github/`.
- Added GitHub Actions CI (`pytest` + `ruff`) and Dependabot updates.

### Toolchain Hygiene

- Standardized project guidance to Python `3.12+` (non-EOL baseline).
