# Release: 2026-07-10 — Settings Page Control-Panel Redesign

## Included

### Settings page reorganization

**`apps/web` — `app/templates/settings/index.html`, `app/blueprints/settings.py`, `app/static/css/style.css`**

The staff Settings page (`/settings/`) is rebuilt from a single flat scroll of Bootstrap accordions into a left sub-nav "control panel" layout: a fixed 230px nav (grouped into Daily Ops / Bot / Web App) plus a main content pane showing one section at a time, and a global search box that searches every setting by label and description.

All underlying data and write endpoints are unchanged — this is a reorg of the existing page, not new backend behavior, aside from the additions below.

**Sections:** Overview (bot status, wiki sync, retirement jobs — the default landing view), Staff & Access, Bot · Channel IDs, Bot · Feature Flags, Bot · Commands, Bot · Tuning, Web App · Flags & Tuning, Web App · Integrations, Web App · Chronicle.

**Bot — Channel IDs** are now grouped by the feature that consumes them (Moderation & Safety, New Member Onboarding, In-Character Correspondence, Announcements & Events), and every row shows a "used by" badge naming the exact command or feature that reads it (e.g. `/deliver`, `Honeypot Moderation`) — the core ask from the client, so staff can see the consequence of editing a value before they touch it.

**Web App — Integrations** cards now show the actual current value (Sheet URL, masked API tokens, Turso database URL) instead of just a Configured/Not Set pill, plus a "why change it" line explaining the real scenario for touching each one (rotating a leaked token, migrating databases, handing off the backup sheet). Tokens are masked to their last 4 characters; the Turso auth token itself is never shown, only the connection URL.

**Section switching** is server-driven (`?section=<id>` query param, validated against a whitelist) with client-side JS progressively enhancing nav clicks to swap panes instantly with no reload — plain `<a href>` navigation still works with JS disabled. Every write route now redirects back to the section the user was editing (via a new `_redirect_to_section()` helper reading a hidden `section` field on each form) instead of always bouncing to the top of the page.

**Search** is a small vanilla-JS filter over a server-built JSON index (`search_index`, embedded in a `<script type="application/json">` tag) covering channel IDs, flags, tuning, commands/subcommands, integrations, and chronicle tenets — no framework, matching the existing `app.js` conventions.

**Note:** `SETTINGS_NAV`'s per-group link list is keyed `'links'`, not `'items'` — Jinja's attribute lookup on a dict resolves `.items` to Python's `dict.items` method before falling back to key lookup, which broke nav rendering during implementation. Worth remembering for any future dict-of-dicts passed to a template.
