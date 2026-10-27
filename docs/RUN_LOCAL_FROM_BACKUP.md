# Run the Web App Against Last Night's Backup

For looking at real data when Turso is down or degraded, or when you need to
see what the database held before something broke. This is a **read-mostly
local copy**, not a failover. Nothing you change here goes back to Turso.

## Where the backups come from

home-automation's platform backup job on miniplex dumps every Turso database
nightly at 02:30 ET and keeps 14 days, under
`/Volumes/k8s-store/compose-backup/turso/<YYYY-MM-DD>/`:

- `mcbn-xp-tracker.sql` (prod)
- `mcbn-dev.sql` (dev)

Each dump is restored into a scratch database and integrity-checked when it is
taken, so a dump that wouldn't restore fails that night's backup run. The
newest one can be up to a day behind prod.

## 1. Restore a dump

```bash
scripts/restore-local-db.sh            # prod, today's dump
scripts/restore-local-db.sh prod 2026-10-25
scripts/restore-local-db.sh dev
```

This copies the dump from miniplex over ssh (`BACKUP_HOST` overrides
`miniplex`), checks it is complete, restores it, runs `PRAGMA integrity_check`,
and writes `apps/web/data/backup-<prod|dev>-<date>.sqlite`. Those files are
gitignored. It never touches your normal `apps/web/data/db.sqlite`. It prints
the `DATABASE_URL` to use. Takes a couple of seconds.

If the date has no dump, it lists the dates that do.

## 2. Run the site against it

The overrides below matter. Your `apps/web/.env` is set up for development, and
some of its values would let a local copy reach real services:

| Override | Why |
|---|---|
| `DATABASE_URL=sqlite:///data/backup-…sqlite` | Point at the restored copy, not your dev DB or Turso. |
| `SPREADSHEET_ID=` | **Required.** With it set, every local write is mirrored to the real backup Google Sheet. |
| `DISCORD_WEBHOOK_URL=` | No escalation alerts to the staff channel. |
| `AUTO_CREATE_PERIODS_ENABLED=false`, `AUTO_CLOSE_PERIODS_ENABLED=false` | No periods opened or closed in the copy. |

Environment variables win over `.env` (python-dotenv doesn't override what is
already set), so nothing needs editing.

### On the host (tested)

```bash
cd apps/web
DATABASE_URL=sqlite:///data/backup-prod-2026-10-26.sqlite \
SPREADSHEET_ID= DISCORD_WEBHOOK_URL= \
AUTO_CREATE_PERIODS_ENABLED=false AUTO_CLOSE_PERIODS_ENABLED=false \
  ./venv/bin/python -m flask --app app:create_app run --port 5001
```

### In Docker (not yet tested)

Stop the normal dev container first if it is running, since both use port 5001
(`./scripts/bootstrap-local.sh web-only down`). Then:

```bash
docker compose -f compose.web.yml run --rm --service-ports \
  -e DATABASE_URL=sqlite:///data/backup-prod-2026-10-26.sqlite \
  -e SPREADSHEET_ID= -e DISCORD_WEBHOOK_URL= \
  -e AUTO_CREATE_PERIODS_ENABLED=false -e AUTO_CLOSE_PERIODS_ENABLED=false \
  web
```

`apps/web` is mounted at `/app`, so the relative `data/…` path is the same file.

Open `http://127.0.0.1:5001` and log in with Discord as usual. That needs the
dev OAuth app's `DISCORD_CLIENT_ID`/`SECRET` and
`DISCORD_REDIRECT_URI=http://127.0.0.1:5001/auth/callback` in your `.env`.

## What not to do with it

- **Don't point a bot at it.** A bot's `WEB_APP_BASE_URL` aimed at this copy
  would post real Discord messages (releases, notifications) for stale data.
- **Don't treat edits as real.** They exist only in the local file. There is no
  path to merge them back into Turso, and the IDs would collide if you tried.
- **Don't leave copies lying around.** They contain player data. Delete
  `apps/web/data/backup-*.sqlite` when done.

## Checked on 2026-10-26

Restoring the 2026-10-26 prod dump (4.9 MB) took under a second: integrity
`ok`, migration head `2b3c4d5e6f7a`, 142 characters. `create_app()` against it
started with Turso and Sheets off and left the file unchanged, and `/api/health`,
`/roster/`, `/periods/` and `/audit/errors` all returned 200 as staff. The
Docker command was not run (Docker wasn't up on the machine used).
