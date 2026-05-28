# Release Notes — 2026-05-28: Character Creator Phase 2

Covers all work merged since the character approval workflow release (2026-05-20).

---

## Character Creator — Loresheet Library

The full V5 sourcebook loresheet library is now available in the character creator wizard. Loresheets appear as a dedicated step for neonate and ancilla characters (after Merits).

**Sourcebooks added:**
- V5 Core (25 loresheets)
- Camarilla (5 loresheets)
- Anarch book
- Chicago by Night
- Players Guide — Hecata bloodline loresheets
- Gehenna War
- In Memoriam
- Tattered Facade
- Blood Sigils
- Cults of the Blood Gods
- Chicago Folios, Children of the Blood, Book of Nod Apocrypha
- Download (fan supplement)
- Live From the Succubus Club
- Trails of Ash and Bone
- The Fall of London
- Forbidden Religions
- Let the Streets Run Red
- Winter's Teeth
- Wolves in Sheep's Clothing
- MCbN custom loresheets (Castoff Court, Langford, Nashville, and others)

**Loresheet mechanics:**
- Clan restrictions enforced in picker (corrected gating errors on Maropis, Neillson, Savona, Voerman)
- Duplicate loresheet ID conflicts resolved
- Dot pip display fixed

---

## Character Creator — XP Budget Sidebar

Neonate and ancilla characters now show a live XP budget panel in the sidebar:

- Budget / Inherited / Spent / Remaining rows
- Spent computed from loresheet dot purchases
- Inherited XP row shown for ancilla
- Red warning when remaining XP goes negative

---

## Character Creator — Submission Notes

Players can include free-text notes to Storytellers on the Final step before submitting. Stored as `submission_notes` on the draft.

---

## Staff — Character Creator Admin

A new CC Admin section (accessible from the sidebar nav) gives staff tools to manage the character creation pipeline:

- **Loresheet Restrictions** — ban specific loresheets from being selected by players; bans stored in DB and enforced in the picker
- **Draft Review** — list of submitted drafts with links to review each one; staff can view any player's draft sheet

Staff receive a Discord notification (to the player's ticket channel) when a player submits a draft for review.

---

## Dashboard — Pending Drafts

The dashboard action strip and stat cards now surface pending character drafts:

- Stat card shows count of submitted-but-unreviewed drafts
- Action strip links staff directly to the CC admin draft list

---

## Bot — Cubby Sync

The bot now monitors Discord cubbies (player category channels) and keeps the roster consistent:

- Characters whose cubby channel disappears are automatically retired
- Channel IDs are backfilled for existing roster entries that were missing them

---

## Bot — Character Ticket Monitor

When a new channel is created inside a "Character Tickets" category, the bot automatically posts a welcome embed with:

- Link to the character creation rules
- Direct link to the character creator pre-wired to the ticket channel

New env flag `CC_TICKET_MONITOR_ENABLED` (default `true`) lets the dev bot opt out of firing in production ticket channels, and `CC_TICKET_CATEGORY_IDS` restricts monitoring to specific category IDs.

---

## Bot — Improvements

- **Guild command registration** — `/lasombra` commands now register as guild commands by default (instant availability, no 1-hour propagation delay). Configurable via `DISCORD_GUILD_ID`.
- **Configurable command name** — `LASOMBRA_COMMAND_NAME` env var allows renaming the slash command root (e.g. for dev bots running alongside prod).
- **Auto-deploy workflow** — bot deploys automatically on push to `main` via GitHub Actions self-hosted runner on Ursula. Builds the new image before stopping the old container to avoid downtime on failure.
- **Active roster 500 fix** — `/api/characters/active-roster` no longer crashes when `includeChannelIds` is set and a character has no channel.
- **Review notifier fix** — submission notifications no longer re-send after a bot restart.
- `/lasombra update` fix — PDF attachment now included in active channels correctly.
- `/lasombra approve` — channel name validation added; rename modal and welcome message updated.

---

## Wiki Sync — Notion Removal

The Notion output target has been fully removed from the wiki sync pipeline. Wiki Sync now writes exclusively to the Discord-backed wiki. All `BOT_NOTION_SYNC_*` references have been renamed to `BOT_WIKI_SYNC_*` in config, UI, and DB (table name preserved to avoid migration). The sync runner now fails early with a clear error when the write token is absent and the run is not a dry-run.

---

## Nav & Settings Cleanup

- Character Creator tools moved out of Settings into a dedicated sidebar nav section
- Nav section expands to **Drafts** and **Loresheet Restrictions** as separate links (staff only)
- Settings page no longer duplicates links to CC admin tools

---

## Ops & Dev Environment

- `scripts/seed-dev-turso.py` — copies prod Turso data to dev Turso DB for realistic local testing
- `docs/DEV_ENVIRONMENT.md` — setup guide for dev Turso DB and the dev Cloud Run pipeline
- Dev bot Docker Compose profile added
- Discord permission overwrite audit scripts added (`apps/bot/scripts/cleanup-overwrites.mjs`, `promote-and-cleanup.mjs`)
- Error Alerts timestamps now display in Eastern time (EDT/EST)
- Config empty-string handling fixed (treats `""` same as unset for optional env vars)

---

## Bug Fixes

- Fixed prod crash-loop on deploy: `character_drafts` migration was missing from main (hotfix `hotfix/add-character-drafts-migration`)
- Fixed heartbeat 500: upsert instead of insert to avoid `StaleDataError` on Turso
- Fixed CC admin loresheet catalog: JSON generated at build time and read from static, not computed at request time
- Fixed draft list empty-state display using incorrect template variable
