# Changelog

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
