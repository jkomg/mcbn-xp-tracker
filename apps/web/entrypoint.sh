#!/bin/sh
set -e

echo "[entrypoint] Running database migrations…"
flask --app app:create_app db upgrade

echo "[entrypoint] Starting gunicorn…"
exec gunicorn --bind ":${PORT:-8080}" --workers 2 --threads 4 --timeout 120 "app:create_app()"
