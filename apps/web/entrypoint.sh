#!/bin/sh
set -e

echo "[entrypoint] Running database migrations…"
# Forced on for this call specifically. create_app() is what builds the schema
# on a fresh database -- the Alembic baseline is a no-op, so if db.create_all()
# is skipped here the very next migration alters a table that does not exist and
# `set -e` kills the container before gunicorn ever starts. Without this, a
# deployment that happens to set RUN_DB_MIGRATIONS_ON_STARTUP=false in the
# environment would take the bootstrap down with it, not just the workers.
RUN_DB_MIGRATIONS_ON_STARTUP=true flask --app app:create_app db upgrade
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting gunicorn…"
# Migrations are done (above). Each worker calls create_app() independently --
# no --preload -- so without this every worker would repeat db.create_all() plus
# the Alembic upgrade against the same remote database before it could serve.
export RUN_DB_MIGRATIONS_ON_STARTUP=false
exec gunicorn --bind ":${PORT:-8080}" --workers 2 --threads 4 --timeout 120 "app:create_app()"
