# Web App Architecture Map (apps/web)

Point-in-time snapshot built 2026-07-20 via a full codebase crawl, to guard against losing track of how the app fits together across long sessions. Verify specifics against current code before relying on them as fact. Companion docs: [ARCHITECTURE_BOT.md](ARCHITECTURE_BOT.md), [PROJECT_HISTORY_AND_THEMES.md](PROJECT_HISTORY_AND_THEMES.md), [REGRESSION_HYGIENE_CHECKLIST.md](REGRESSION_HYGIENE_CHECKLIST.md).

## Blueprint map (`apps/web/app/blueprints/`, registered in `app/__init__.py:159-189`)

| Blueprint | Prefix | Owns | Auth tier |
|---|---|---|---|
| dashboard | `/` | Discord OAuth login, staff "view as player" preview toggle | mixed |
| claims | `/claims` | XP claim review/approve/deny/reopen/bulk-approve | staff |
| spends | `/spends` | Spend review/approve/deny/**reverse**/bulk-approve | staff |
| roster | `/roster` | Character CRUD, rename, manual XP/ledger adjust, CSV import/export | staff |
| periods | `/periods` | Play-period lifecycle, ICS export | staff |
| audit | `/audit` | Read-only audit trail, error-log dismissal | staff |
| player | `/player` | Character home, claim/spend/wishlist submission, background blanking | player (`require_character_owner`) |
| api | `/api` | Bot-facing JSON API only, bearer-token scopes, not session auth | bot-only |
| settings | `/settings` | Control-panel config, staff roster, wiki sync controls | staff (+`is_settings_admin` for some) |
| wiki | `/wiki` | Public/staff wiki CMS with sync locking | mixed |
| character_creator | `/` | Player-facing SPA backend for `CharacterDraft` | player (+1 staff route) |
| cc_admin | `/` | Draft/sheet-import review queue, loresheet bans | staff |
| coteries | `/coteries` | Full coterie lifecycle | mixed (proposal=player, management=staff) |
| reports | `/` | Activity health, retirement job status | staff |
| local_status | `/` | Local ops/status page | staff |

**Important**: auth tier is decorator-level, not file-level — several blueprints (character_creator.py, wiki.py, coteries.py) mix `require_login`/`require_character_owner`/`require_staff` routes in the same file. Always check the specific route's decorator.

## Data models (`apps/web/app/db.py`)

**Critical pattern**: most game-data tables key on `character_name` as a plain `String`, **not a foreign key** to `characters.id` (legacy-Sheets-derived schema). Renaming a character requires updating every one of these tables by string match — done in `DBService.rename_character` (`db_service.py:317-357`), which currently touches: `DbXPClaim`, `DbSpendRequest`, `DbLedgerEntry`, `DbWishListItem`, `DbAuditLog.target_character`. **If you add a new table keyed by `character_name` string, you must add it to `rename_character` too, or renames will silently orphan it.**

Newer tables use real FKs to `characters.id`/`coteries.id`: `CoterieMember`, `CoterieAdvantage`, `DbBoon` (creditor/debtor), `SceneRequest`, `DbContactThread`/`Participant`/`Message`, `DbCharacterBackground.donated_coterie_id`, `DbSpendRequest.coterie_id`.

Tables (grouped): roster (`DbCharacter`), periods (`DbPlayPeriod`), claims (`DbXPClaim`), spends (`DbSpendRequest` — note `depends_on` is a **plain Integer, not a declared FK**, despite the comment calling it one), ledger (`DbLedgerEntry`), audit (`DbAuditLog`), settings (`AppSetting` — drives DB-based staff roles via `STAFF_MEMBER_<discord_id>` rows), wiki (`WikiPage`, `WikiSyncBlock` tombstones, `WikiSyncEvent` history), retirement (`RetirementAutomationJob` — tracks Discord and wiki completion independently since Discord happens immediately but wiki waits for batch sync), sheets-sync errors (`DbSheetsSyncError`), reminders (`DbReminderPreference`), Discord activity tracking (`DiscordDisplayName`, `DiscordPostCount`, `DiscordMemberEvent` — the last is deliberately event-sourced with a unique constraint, not a running counter, after a prior counter-corruption incident with `DiscordPostCount`'s design), character creator (`CharacterDraft` — UUID PK, `character_data` JSON blob that `character_sheet.py` patches, `roster_character_id` FK nullable until approved), `CcRestriction`, backgrounds (`DbCharacterBackground` — has blanking/release mechanics tied to play-period night numbers), wish list (`DbWishListItem`), coteries (`Coterie`, `CoterieMember`, `CoterieAdvantage`), boons (`DbBoon` — real FKs, staff-read-only in the web app, mutated only via the bot's `/prestation`), scene requests (`SceneRequest`), contact threads (`DbContactThread`/`Participant`/`Message`).

## `db_service.py` — the business-logic layer

Blueprints never touch `Db*` ORM classes directly for core game data — everything goes through `DBService` (`db_service.py:211`), historically designed as a drop-in replacement for the legacy `SheetsClient` (same method signatures, same `app.models` dataclass return types). Method groups: roster, play periods (+ `auto_create_next_period_if_due`/`auto_close_period_if_due` used by the bot's control loop), XP claims, spend requests (incl. `reverse_spend` — see below), wish list, XP totals (SQL aggregates, not Python loops), XP ledger, audit log (`log_action` — nearly every mutation pairs with this), backgrounds, boons (read-only).

**Universal write pattern**: DB mutation → `db_service.log_action(...)` (audit trail) → `sheets_sync.sync_*(...)` if configured (best-effort mirror), roughly in that order within the same request. When adding a new mutation route, match this triple, not just the DB write.

## Sheets mirror (`app/sheets.py` + `app/sheets_sync.py`)

One worksheet tab per entity (`TAB_ROSTER`, `TAB_SPEND_REQUESTS`, `TAB_WISH_LIST_ITEMS`, etc., `sheets.py:85-91`), each with a `*_HEADERS` list. `SheetsSyncWorker` (`sheets_sync.py`) is the runtime mirror orchestrator:

- **Real-time fire-and-forget**: every `sync_*` method submits to a single-worker `ThreadPoolExecutor` and returns immediately — never blocks the request. Failures are logged + buffered in-memory (last 50) + persisted to `DbSheetsSyncError`, but **never retried in-band** — nightly `reconcile()` is the actual guarantee, not the real-time path.
- **Row lookup by matching fields, not ID**: since Sheets rows aren't keyed by DB id, status-update syncs (`sync_approve_spend`, `sync_reverse_spend`, etc.) re-read the sheet and find the row by a composite of business fields before mutating it. No match → warn and give up silently.
- **`reconcile()`** (`sheets_sync.py:303-499`, `pragma: no cover`, triggered via `/api/sheets/reconcile`): full diff — appends DB rows missing from Sheets, then pushes status corrections where DB/Sheets disagree, including a self-heal branch for spends that went Approved→Pending (reversed) if the real-time sync call was missed.
- **Hard rule, enforced not just documented**: `DBService` never reads from `SheetsClient` for primary data — the only two exceptions are `preview_ledger_import`/`preview_period_import`, explicitly scoped to one-time external-spreadsheet-import previews.

**When adding any new entity that needs a Sheets backup** (as wish list items got in 2026-07): add a tab constant + headers in `sheets.py`, `add_*`/`get_all_*`/mutator methods there, `sync_*` wrappers in `sheets_sync.py`, and wire calls from the blueprint route alongside the existing `log_action` call — this is a 4-file pattern (`sheets.py`, `sheets_sync.py`, the blueprint, and typically a reconcile-loop addition), easy to do only 2 of 4 and leave a silent gap.

## `character_sheet.py` — living sheet patching

Keeps `CharacterDraft.character_data` (JSON) in sync with approved spends — this JSON drives the player's `/sheet` view and the wiki character page.

- **Apply**: `patch_character_draft(spend)` called right after `db_service.approve_spend(...)` in `spends.py`'s approve route. Dispatches on `spend.spend_category` to mutate the right JSON substructure (Attribute/Skill/Discipline/Ritual/Advantage/Loresheet/Humanity each have distinct shapes), regenerates a markdown stats block spliced into the linked `WikiPage.body_markdown`. Failures are caught and logged, **never raised** — a sheet-patch bug must not block spend approval.
- **Reverse**: `reverse_character_sheet_patch(spend)`, called from `DBService.reverse_spend` when staff reverse an approved spend. Only rolls back a field if it **still holds exactly the value this spend set** (the staleness guard) — e.g. checks `attrs.get(key) == new_dots` before restoring; a discipline power entry requires name+level match before removal. If something else (a later spend) has since changed that field, the reversal skips it rather than clobbering newer state. **This guard is the only thing preventing a reversal from silently corrupting sheet data — any change to reversal logic must preserve it.**
- `DBService.reverse_spend` also enforces two ordering guards before allowing a reversal: an explicit `depends_on` chain, and an "implicit dependent" heuristic (same character/category/trait where another approved spend's `current_dots == new_dots` of the row being reversed) — catches sequential purchases submitted without a declared `depends_on` link. Both must be preserved together.

## Auth tiers (`app/auth.py`)

- `require_login` — any authenticated Discord user (session `discord_id` or legacy `authenticated`).
- `require_character_owner` — login + (`is_staff()` bypass OR `char.player_discord == get_player_discord_id()`), 404 on mismatch (not 403 — avoids leaking existence).
- `require_staff` — checks `session['authenticated']` only.
- `is_staff()` — soft check used in logic/templates, not a decorator; returns `False` while `session['view_as']` is set, letting the entire player-facing UI render identically for a staff "preview as player" session with zero branching elsewhere.
- `is_settings_admin()` — stricter tier above `require_staff`, gates Settings-page mutations (`SETTINGS_ADMIN_DISCORD_IDS` or DB role `administrator`).
- `get_player_discord_id()` — the single indirection point: returns the `view_as` target's ID when previewing, else the real session ID. This is what makes staff-preview-as-player work app-wide without per-route special-casing.
- Bot API auth is separate: `require_bot_scope` (bearer token + scope) in `blueprints/api.py`, unrelated to session auth.

## Schema/migration workflow

`app/__init__.py:135-156`: `db.create_all()` runs on **every** boot first (builds baseline schema for fresh installs, no-op for existing tables) → then checks the Alembic revision → if `None` (fresh install), stamps to head without running migrations (since `create_all()` already built everything) → if a revision exists, runs pending migrations with one retry for a known concurrent-worker Alembic race.

**The Turso-specific gotcha**: because `create_all()` runs before Alembic's diff, any migration doing `CREATE TABLE` (not `ADD COLUMN`) will find the table already exists on a fresh Turso DB. Convention: every `CREATE TABLE`-style migration includes a local `_table_exists(name)` guard before `create_table` (see `8beb375fc044_add_wish_list_items_table.py` and ~8 other migrations for the exact pattern) — **write this guard by hand**, since `flask db migrate` autogenerate will produce an empty migration body if it runs against a DB where `create_all()` already silently created the table.

## Test suite

`apps/web/tests/` — 44+ files, no shared top-level `conftest.py`; each module builds its own throwaway Flask app with `sqlite:///:memory:`, real DB behavior (not mocked) against SQLite, isolated per module.

Run: `cd apps/web && pytest -q --cov=app --cov-report=term-missing --cov-fail-under=30` (matches CI's `web-test-and-lint` job). Also `ruff check app tests` and `python -m compileall app tests`.

Prefer running the existing suite (cheap, 44 files) before calling a web change done, and add a real test under `tests/` for non-trivial logic rather than a one-off manual verification script.

## Other load-bearing details

- **CSRF** is global (`flask_wtf.csrf.CSRFProtect`) for session-based routes; the bot's `/api` blueprint bypasses it via bearer-token auth.
- **Rate limiting** (`flask_limiter`) uses in-memory storage, resets on every deploy/restart — fine at this scale, but explains "why did a burst get throttled right after a redeploy."
- **Turso connection**: when `TURSO_CONNECT_URL` is set, a custom `creator` + `NullPool` swap in for normal SQLAlchemy pooling — relevant if debugging connection-pool/libsql-specific errors.
- Server-side re-validates client-claimed identity/membership rather than trusting form fields (e.g. coterie donation checks the submitting character is actually an active member of the claimed coterie) — a recurring security theme, see [PROJECT_HISTORY_AND_THEMES.md](PROJECT_HISTORY_AND_THEMES.md).
