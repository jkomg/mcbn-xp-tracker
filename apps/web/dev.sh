#!/usr/bin/env bash
# dev.sh — Start the local MCbN XP Tracker dev server on port 5001
set -euo pipefail

cd "$(dirname "$0")"

# Kill any existing instance on 5001
lsof -ti:5001 2>/dev/null | xargs kill -9 2>/dev/null || true

export FLASK_APP=app:create_app
export FLASK_DEBUG=true

echo "Starting MCbN dev server on http://127.0.0.1:5001 ..."
if [ -x "./venv/bin/python" ]; then
  ./venv/bin/python -m flask run --port 5001
else
  python3 -m flask run --port 5001
fi
