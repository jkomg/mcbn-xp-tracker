#!/bin/sh
set -e

echo "[entrypoint] Running database migrations…"
flask --app app:create_app db upgrade
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting gunicorn…"
# Migrations are done (above). Each worker calls create_app() independently --
# no --preload -- so without this every worker would repeat db.create_all() plus
# the Alembic upgrade against the same remote database before it could serve.
export RUN_DB_MIGRATIONS_ON_STARTUP=false
exec gunicorn --bind ":${PORT:-8080}" --workers 2 --threads 4 --timeout 120 "app:create_app()"
