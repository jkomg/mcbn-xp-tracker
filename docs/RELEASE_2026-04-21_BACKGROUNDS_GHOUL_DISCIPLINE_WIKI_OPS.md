# Release: 2026-04-21 — Background Blanking, Ghoul Discipline, Wiki Ops

## Overview

This release adds character background blanking (hunt consequence tracking), the Ghoul Discipline spend category, several wiki operations improvements, and a set of infrastructure fixes for migration safety and deploy observability.

---

## Character Background Blanking (issue #174)

Tracks temporary blanking of background dots as a consequence of failed hunting rolls or other story events. Blanked dots are restored automatically at the start of the next play night.

### Web (player portal)

- New **Backgrounds** tab on each player character page shows all tracked backgrounds, total dots, blanked dots, available dots, and the scheduled release night.
- Players can see their own backgrounds; staff can see any character's.

### Web (API)

Three new bot-facing endpoints (see `docs/API_ENDPOINTS.md`):

| Endpoint | Scope | Description |
|----------|-------|-------------|
| `GET /api/backgrounds/status` | read | Returns all tracked backgrounds and blanking state for a character |
| `POST /api/backgrounds/blank` | write | Blanks N dots of a named background; sets release to current night + 1 |
| `POST /api/backgrounds/release-due` | write | Releases all backgrounds whose release night ≤ current night |

### Bot

- New **`/lasombra background`** subcommand group:
  - `/lasombra background blank <character> <background> [dots]` — blanks dots, DMs confirmation
  - `/lasombra background status <character>` — shows current blanking state
- New **`BackgroundBlankReleaseService`** runs as part of the passage-of-time monitor. At the start of each night it calls `POST /api/backgrounds/release-due` and announces restored backgrounds to the character's player via DM.

### Schema

New table `character_backgrounds` (migration `6d2a4f0be9c1`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | |
| `character_name` | string | |
| `background_key` | string | Normalized slug of background name |
| `background_name` | string | Display name |
| `dots_total` | integer | Total purchased dots |
| `dots_blanked` | integer | Currently blanked |
| `blanked_at_night_number` | integer | Night blanking occurred |
| `release_night_number` | integer | Night blanks are restored |
| `updated_at` / `updated_by` | string | Audit trail |

---

## Ghoul Discipline Spend Category

Ghouls with appropriate resonance and kindred blood can now purchase 1-dot Discipline powers through the standard spend workflow.

- New category **Ghoul Discipline** in `packages/api-contract/spend_categories.json` and `packages/rules/xp_costs.json`
- Cost: flat **10 XP** per dot; only the first dot (0→1) is purchasable per power
- Uses the existing `flat_cost` mechanism — no new web or bot code required
- Bot `/xp spend-cost` and the web spend form both reflect the new category automatically

---

## Error Alerts: Per-Entry Dismissal

Staff can now dismiss individual entries on the `/audit/errors` page.

- **Dismiss button** (✓) on each row hides the entry via `POST /api/audit/errors/<id>/dismiss`
- Dismissed entries are hidden by default; a **Show dismissed** toggle reveals them
- Schema: new `dismissed` boolean column on `app_log_entries` (migration `d1a8e3f7c2b5`)
- **ReviewNotifier improvement** (same release): falls back to first-name channel match when the full display name doesn't find a cubby channel (e.g. channel `sylvester` for `Sylvester Glass`); ambiguous matches log an error rather than silently picking wrong

---

## Wiki: Bulk Delete + Sync Block Tombstones

Gives staff control over pages that should never be recreated by the automated Notion sync.

- **Bulk delete** on category pages: checkbox per card, floating delete bar on selection, red outline on selected cards, confirmation prompt
- **`WikiSyncBlock` table** (migration `f4c8b2e6a1d9`): when a page is deleted (single or bulk), its slug is added as a tombstone. The bot's `POST /api/wiki/page` upsert returns `sync_blocked: true` (HTTP 200, no write) instead of recreating the page.
- Existing single-page delete also records a `WikiSyncBlock` entry now.

---

## Wiki: Category Page Browse Sidebar

Category pages now show the same Browse sidebar panel as article pages, with the current category highlighted. Consistent navigation across all wiki views.

---

## Infrastructure Fixes

### Fresh-install startup (migration `fix/migration-idempotency`)

`db.create_all()` builds the full current schema on a blank DB. Previously, the startup code then ran `flask db upgrade` which replayed historical `ADD COLUMN` migrations against tables that already had those columns, causing `duplicate column name` failures on first boot. Fix: after `db.create_all()`, check `alembic_version` — if absent (fresh install), stamp to head; if present (existing install), run `upgrade()` as before. All `CREATE TABLE` migrations also gained `IF NOT EXISTS` guards.

### Discord deploy notification

The GitHub Actions deploy notification to Discord now includes the commit subject line alongside the commit SHA, making it easier to see what was deployed at a glance.

### Migrations in this release

| Revision | What |
|----------|------|
| `6d2a4f0be9c1` | Add `character_backgrounds` table |
| `d1a8e3f7c2b5` | Add `dismissed` column to `app_log_entries` |
| `e2b5a9c1d7f3` | Add `summary` column to `wiki_pages` |
| `f4c8b2e6a1d9` | Add `wiki_sync_blocks` table |
