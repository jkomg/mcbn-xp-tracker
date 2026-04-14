# Release: 2026-04-14 — Chronicle Wiki

## Overview

Adds a public-facing **Chronicle Wiki** at `mcbn.jkomg.us/wiki` built directly into the existing Flask web app. No new infrastructure — uses the same Cloud Run service and Turso database already powering the XP tracker.

The wiki is the player-facing source of truth for lore: locations, characters, coteries, factions, and in-universe history. Staff (STs) manage content through an authenticated editor. Players browse read-only. Discord bot sync can upsert pages programmatically via API.

---

## What's New

### `apps/web` — Chronicle Wiki blueprint (`/wiki`)

**`app/db.py` — `WikiPage` model**

New `wiki_pages` table:

| Column | Type | Notes |
|--------|------|-------|
| `slug` | `String(200)` | URL-safe identifier, unique |
| `title` | `String(300)` | Page display title |
| `body_markdown` | `Text` | Content in Markdown |
| `category` | `String(100)` | One of: `locations`, `characters`, `coteries`, `factions`, `lore` |
| `cover_image_url` | `Text` | Optional hero/cover image |
| `source` | `String(50)` | `manual`, `api-sync`, `discord-sync`, etc. |
| `published` | `Boolean` | Drafts hidden from public, visible to staff |
| `created_at` / `updated_at` | `DateTime` | Timestamps |
| `updated_by` | `String(100)` | Staff name or sync source |

Migration: `d4f1e9c23a8b_add_wiki_pages_table.py`

**`app/blueprints/wiki.py` — Routes**

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| `GET` | `/wiki/` | Public | Index — category cards + recently updated pages |
| `GET` | `/wiki/category/<cat>` | Public | All pages in a category |
| `GET` | `/wiki/<slug>` | Public\* | Read a page (\*drafts require staff) |
| `GET/POST` | `/wiki/new` | Staff | Create a new page |
| `GET/POST` | `/wiki/edit/<slug>` | Staff | Edit an existing page |

**`app/blueprints/api.py` — `POST /api/wiki/page`**

Write-token authenticated endpoint for bot/script upserting of pages. Accepts `slug`, `title`, `body_markdown`, `category`, `cover_image_url`, `published`, `source`, `updated_by`. Returns `{"status": "created"}` (201) or `{"status": "updated"}` (200).

**Templates (`app/templates/wiki/`)**

Five templates sharing a dedicated `wiki/base.html` public layout — separate from the staff sidebar layout:

- `index.html` — atmospheric hero (music.png) + 2×3 category card grid + recent pages
- `category.html` — category hero + card grid of pages
- `page.html` — rendered Markdown article with right sidebar (metadata, edit button for staff, category nav)
- `edit.html` — [EasyMDE](https://easymde.vercel.app/) Markdown editor with side-by-side preview, title/category/cover fields, published toggle

**`app/static/css/style.css` — Wiki design system**

250+ lines of wiki-specific CSS extending the existing VTM design language:

- `wiki-navbar` — frosted music.png background, gold category nav links
- `wiki-index-hero` / `wiki-cat-hero` / `wiki-page-hero` — atmospheric music.png hero banners with gradient fade
- `wiki-article` — readable Markdown typography: gold `h2` separators, crimson blockquotes, styled tables, inline code
- `wiki-category-card` — category grid cards with top border color on hover
- `wiki-page-card` — page cards with optional cover thumbnail
- `wiki-meta-card` / `wiki-sidebar-panel` — right-sidebar metadata panel
- EasyMDE dark theme overrides for the editor

All using existing variables: `--vtm-red: #8b0000`, `--vtm-gold: #c5a55a`, Cinzel serif headings, `#1a1a2e` background.

**Staff sidebar** (`app/templates/base.html`)

Chronicle Wiki link added to the player-facing section of the staff nav.

**`requirements.txt`**

Added `Markdown==3.*` for server-side Markdown → HTML rendering (used in `wiki.page` route).

---

## Deploy

```bash
cd apps/web
flask db upgrade        # creates wiki_pages table on Turso
./deploy.sh
```

For local Docker dev, rebuild to pick up the new `Markdown` dependency:

```bash
./scripts/bootstrap-local.sh web-only
```

---

## Future

- Locations first: map the city, hunting sites, Elysium, etc.
- Characters / coteries: structured template with player-written summaries
- Bot sync: `discord-notion-sync` can be extended to upsert pages here via `POST /api/wiki/page`
- Heat system integration (future): surface whispers/rumors on location pages
- Page history (`WikiPageRevision` table) if versioning becomes needed
