#!/usr/bin/env bash
# Restore a nightly Turso dump from miniplex into a local SQLite file.
#
# Usage: scripts/restore-local-db.sh [prod|dev] [YYYY-MM-DD]
#   defaults: prod, today. Writes apps/web/data/backup-<db>-<date>.sqlite
#   (gitignored) and never touches apps/web/data/db.sqlite.
#
# The dumps come from home-automation's platform backup job (02:30 ET nightly,
# kept 14 days, each one restore-tested when taken). See
# docs/RUN_LOCAL_FROM_BACKUP.md for running the site against the result.
set -euo pipefail

which_db="${1:-prod}"
date="${2:-$(date +%F)}"
case "$which_db" in
  prod) db=mcbn-xp-tracker ;;
  dev) db=mcbn-dev ;;
  *) echo "usage: $0 [prod|dev] [YYYY-MM-DD]" >&2; exit 2 ;;
esac

host="${BACKUP_HOST:-miniplex}"
src="/Volumes/k8s-store/compose-backup/turso/$date/$db.sql"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out="$repo_root/apps/web/data/backup-$which_db-$date.sqlite"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Fetching $host:$src"
if ! scp -q "$host:$src" "$tmp/dump.sql"; then
  echo "No dump at $src. Available dates:" >&2
  ssh "$host" "ls /Volumes/k8s-store/compose-backup/turso" >&2 || true
  exit 1
fi
[ "$(tail -n 1 "$tmp/dump.sql")" = "COMMIT;" ] || { echo "Dump is truncated." >&2; exit 1; }

sqlite3 "$tmp/restored.sqlite" < "$tmp/dump.sql"
[ "$(sqlite3 "$tmp/restored.sqlite" 'PRAGMA integrity_check;')" = "ok" ] \
  || { echo "Restored database fails integrity_check." >&2; exit 1; }

mkdir -p "$(dirname "$out")"
mv "$tmp/restored.sqlite" "$out"
echo "Restored $db ($date) to $out"
echo "  migration: $(sqlite3 "$out" 'SELECT version_num FROM alembic_version;')"
echo "  characters: $(sqlite3 "$out" 'SELECT count(*) FROM characters;')"
echo
echo "DATABASE_URL=sqlite:///data/$(basename "$out")"
