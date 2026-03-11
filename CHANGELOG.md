# Changelog

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
