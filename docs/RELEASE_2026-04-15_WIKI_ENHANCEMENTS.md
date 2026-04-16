# Release: 2026-04-15 — Wiki Enhancements & Automation

Extends the Chronicle Wiki introduced on 2026-04-14 with sync improvements,
search, auto-deploy, and Discord notifications.

---

## Wiki Improvements

### Character portraits in sidebar
Cover images pulled from `#children-of-the-night` Discord profiles now appear
as a full-width portrait card at the top of the character page sidebar
(`wiki-portrait-card` / `wiki-portrait-img` CSS classes).

### Staff delete
`POST /wiki/delete/<slug>` route (staff-only) removes a page and redirects to
the wiki index. A "Delete Page" button with a confirmation dialog appears in
the sidebar for staff. Corresponding `DELETE /api/wiki/page/<slug>` API
endpoint (write-token auth) for automated cleanup.

### Wiki search
`GET /wiki/search?q=` — case-insensitive LIKE search across title and body for
published pages (staff see drafts). Title matches sorted first, capped at 50
results. Compact search box in the wiki navbar on every page. `_excerpt()`
helper returns a context window around the first match. `search` added to
`_RESERVED_SLUGS`.

### Strikethrough rendering
Discord/GitHub `~~text~~` now renders as `<del>text</del>` in wiki pages. The
Python `markdown` library's `extra` extension doesn't include strikethrough
natively; a pre-processing step converts it before the Markdown renderer runs.

---

## Discord → Wiki Sync (`discord-notion-sync.ts`)

### Markdown sanitizer
`sanitizeDiscordMarkdown()` applied to all Discord message content before wiki
upsert. Fixes:
- `||spoiler||` → reveals text (was rendering literally as `||text||`)
- Custom emoji `<:name:id>` stripped
- User/channel mentions `<@id>` `<#id>` stripped
- Discord timestamp tags `<t:123:F>` stripped
- Unbalanced `**` bold markers closed at end of block

### Character portraits from `#children-of-the-night`
Step 5.5 fetches all forum threads from the PC background channel, builds a
`Map<normalizedName, { image, markdown }>`. Step 6 merges portrait images and
profile text into character wiki pages. Step 7 skips wiki upsert for
`children-of-the-night` threads (content goes to character pages instead).

### Stale PC lore page cleanup
Step 5.6 iterates the PC profile map keys, derives their old `lore-*` slugs,
and calls `DELETE /api/wiki/page/<slug>` — cleaning up pages created before
profiles were merged into character pages. Idempotent: 404s log as "already
deleted" and continue.

### Location pages include hunting site pins
Channel pin messages from location channels are collected and appended under a
`## Hunting Sites` section in each location wiki page.

### Coteries (step 6.5)
Static `COTERIE_MEMBERS` map upserted as wiki pages in the `coteries` category.
Member names are Markdown links to the associated character wiki pages.

### Factions (step 6.6)
`FACTIONS` constant defines Camarilla, Anarchs, Voivode, Autark with sect
aliases matching the active roster's `sect` field (`Camarilla`, `Anarch`,
`Hecata`, `Autarkis`). Each faction page lists linked members with clan and
coterie notes, plus links to related lore channel archives.

### Notion optional
`NOTION_ENABLED = !!opts.notionToken` — all Notion writes gated behind this
flag. Script runs wiki-only when `NOTION_TOKEN` is unset.

### Category-prefixed slugs
`wikiSlug(category, name)` generates `loc-*`, `char-*`, `lore-*`,
`coteries-*`, `factions-*` slugs to prevent cross-category collisions.

---

## CI/CD

### Auto-deploy on merge
`.github/workflows/deploy-web.yml` — triggers on CI workflow completion
(`workflow_run`) on `main`, gated on `conclusion == 'success'`. Images tagged
with the immutable commit SHA (plus `:latest` alias). `workflow_dispatch`
available for manual hotfix deploys.

Required GitHub secrets: `GCP_SA_KEY` (service account JSON), `SPREADSHEET_ID`.
All other config pulled from GCP Secret Manager.

### Discord deploy notifications
Final step in the deploy workflow posts a Discord embed via webhook:
- ✅ Green embed with commit SHA link on success
- ❌ Red embed with link to Actions run log on failure

`continue-on-error: true` — Discord network issues cannot affect deploy status.
Requires `DISCORD_DEPLOY_WEBHOOK` GitHub secret. Skipped if secret is absent.

---

## Gitignore
- `**/.env.*` added to cover `.env.production` and similar variants
- `apps/web/data/` added to cover local SQLite directory
