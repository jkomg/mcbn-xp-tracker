# Release: 2026-03-13 — Turso Database Migration and Sheets Sync

This release migrates the primary data store from Google Sheets to a
Turso/libsql SQL database and completes a full bidirectional sync
strategy with Sheets as a backup mirror.

## Included

### Primary database migration (Turso/libsql)

- New SQLAlchemy models (`app/db.py`): characters, play periods, XP
  claims, spend requests, ledger entries, audit log.
- New service layer (`app/db_service.py`) replaces direct Sheets reads
  across all blueprints and API routes.
- All writes go to Turso first; Google Sheets is updated in the
  background as a best-effort mirror.
- Production: `DATABASE_URL=libsql+https://...` + `TURSO_AUTH_TOKEN`
  (injected via GCP Secret Manager).
- Local dev: SQLite (default, no extra config).
- Schema is created automatically on startup; no manual migration step.

### Sheets sync — Phase 1 (append-only, shipped in PR #51)

- `app/sheets_sync.py` — background thread pool worker that mirrors
  new inserts (characters, periods, claims, spends, ledger entries,
  audit log) to Google Sheets after every DB write.

### Sheets sync — Phase 2 (status mirroring, PR #54)

- Approve and deny decisions (claims and spends) are now mirrored back
  to the corresponding Sheets rows (status, reviewed_by, review_date,
  notes columns).
- Lookup strategy: match by character name + play period (claims) or
  character name + trait + category + dots (spends).
- All sync failures are logged as warnings only — never block the
  primary request.

### Migration tooling

- `apps/web/scripts/migrate_sheets_to_db.py` — one-time migration
  script that reads all Sheets tabs and populates the DB. Safe to
  re-run (skips existing rows).

### Infrastructure

- `apps/web/Dockerfile` supports `libsql-experimental` (Rust extension
  with native wheels on linux/amd64).
- `apps/web/deploy.sh` now injects `DATABASE_URL` and `TURSO_AUTH_TOKEN`
  via `--update-secrets`.
- `apps/web/setup-secrets.sh` rewritten to read all values from `.env`
  (no interactive prompts), compare each against the current GCP secret
  value, and only push a new version when the value has changed. Also
  covers the new `DATABASE_URL` and `TURSO_AUTH_TOKEN` secrets.

### Bug fixes

- `/local/status` page now accessible from Docker containers (Docker
  bridge IPs `172.16.0.0/12` pass the local request check).
- Discord token exchange errors now logged with exception detail.

## Operational Notes

- Existing Sheets data was migrated to Turso before going live.
- Google Sheets remains active and is kept current as a read-only
  backup. In a Turso outage, data can be read from Sheets directly.
- The `dark` Cloud Run revision tag remains on the previous revision
  (00060) and can be removed when no longer needed for rollback.

## Follow-Up

- Dependabot PRs for flask-limiter 3→4 and gunicorn 23→25 pending
  review.
- Phase 2 Sheets sync covers web UI approve/deny only. Bot-triggered
  operations write through the web API which handles the sync.
