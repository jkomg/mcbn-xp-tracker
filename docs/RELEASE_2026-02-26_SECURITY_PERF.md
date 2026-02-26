# Release: 2026-02-26 Security + Performance + XP Fix

## Summary

This release hardens authentication and form security, improves Google Sheets I/O efficiency, resolves several UI/data correctness issues, and fixes Advantage XP cost calculation (`3 XP per dot purchased`).

## Included Changes

- CSRF protection for form POST actions (API blueprint exempted, token-auth based).
- Session/cookie hardening and explicit session lifetime settings.
- Safe login redirect sanitization.
- Constant-time bot token comparison and API rate limits.
- Validation hardening for approval/spend input bounds.
- Batch/range Google Sheets writes in place of repeated per-cell writes.
- Cached next-row append strategy for sheet writes.
- Aggregation optimizations for dashboard and roster totals.
- Roster filter and spend review template correctness fixes.
- Keyboard accessibility updates for sortable roster headers.
- Advantage XP rule fix:
  - Old behavior: progressive `new rating x 3` (0->2 = 9)
  - New behavior: flat `3 XP per dot` (0->2 = 6)

## Operational Notes

- New runtime dependency: `Flask-WTF`.
- New test dependency: `pytest`.
- New production secret wiring expected:
  - `WEB_APP_API_TOKEN` -> secret `mcbn-web-app-api-token`.

## Validation Performed

- `pytest -q`: pass.
- `python -m compileall app tests`: pass.
- Dev smoke:
  - `/login` loads.
  - POST without CSRF returns 400 (expected).
  - `/api/health` returns 200.
- Production Discord OAuth client ID/secret mismatch was corrected in Secret Manager and redeployed.

## Free-Tier Cost Impact

- No new paid products added.
- Cloud Run service shape unchanged (same CPU/memory/min/max instances).
- Net Google Sheets API usage is reduced or unchanged due to request batching and append optimizations.
- Expected monthly cost profile remains within current free-tier usage envelope for this workload.
