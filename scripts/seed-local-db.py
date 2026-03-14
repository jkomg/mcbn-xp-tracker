#!/usr/bin/env python3
"""Seed local SQLite dev database from production Turso database.

Reads DATABASE_URL and TURSO_AUTH_TOKEN from apps/web/.env, queries each
table via the Turso HTTP API (no libsql driver needed), and inserts rows
into the local SQLite database at apps/web/data/db.sqlite.

The web container must be running first so Flask has created the schema.

Usage:
    python scripts/seed-local-db.py
"""

import json
import sqlite3
import ssl
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "apps" / "web" / ".env"
LOCAL_DB = REPO_ROOT / "apps" / "web" / "data" / "db.sqlite"

# Tables to copy in dependency order.
# audit_log excluded (large, not useful for dev).
# app_settings excluded (should stay fresh / local-only).
TABLES = [
    "characters",
    "play_periods",
    "xp_claims",
    "spend_requests",
    "ledger_entries",
]


def parse_env(path: Path) -> dict:
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def libsql_to_https(database_url: str) -> str:
    url = database_url.replace("libsql+https://", "https://").replace("libsql://", "https://")
    return url.rstrip("/")


def fetch_table(base_url: str, token: str, table: str) -> tuple[list[str], list[list]]:
    payload = json.dumps({
        "requests": [
            {"type": "execute", "stmt": {"sql": f"SELECT * FROM {table}"}},
            {"type": "close"},
        ]
    }).encode()

    req = urllib.request.Request(
        f"{base_url}/v2/pipeline",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    # macOS Python ships without system CA certs; use unverified context for this local dev tool.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.loads(resp.read())

    result = data["results"][0]
    if result["type"] == "error":
        raise RuntimeError(result["error"])

    rs = result["response"]["result"]
    cols = [c["name"] for c in rs["cols"]]
    rows = []
    for row in rs["rows"]:
        values = []
        for cell in row:
            t = cell["type"]
            if t == "null":
                values.append(None)
            elif t == "integer":
                values.append(int(cell["value"]))
            elif t == "float":
                values.append(float(cell["value"]))
            else:
                values.append(cell["value"])
        rows.append(values)

    return cols, rows


def seed_table(conn: sqlite3.Connection, table: str, cols: list[str], rows: list[list]) -> None:
    if not rows:
        print(f"  {table}: 0 rows")
        return
    col_list = ", ".join(cols)
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT OR REPLACE INTO {table} ({col_list}) VALUES ({placeholders})"
    conn.executemany(sql, rows)
    conn.commit()
    print(f"  {table}: {len(rows)} rows")


def main() -> None:
    if not ENV_FILE.exists():
        print(f"ERROR: {ENV_FILE} not found", file=sys.stderr)
        sys.exit(1)

    env = parse_env(ENV_FILE)
    database_url = env.get("DATABASE_URL", "")
    auth_token = env.get("TURSO_AUTH_TOKEN", "")

    if not database_url.startswith("libsql"):
        print(
            f"ERROR: DATABASE_URL in apps/web/.env is not a Turso URL (got: {database_url!r})\n"
            "This script requires DATABASE_URL=libsql+https://... pointing to your Turso database.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not auth_token:
        print("ERROR: TURSO_AUTH_TOKEN not set in apps/web/.env", file=sys.stderr)
        sys.exit(1)

    if not LOCAL_DB.exists():
        print(
            "ERROR: Local SQLite DB not found at apps/web/data/db.sqlite\n"
            "Start the dev container first so Flask can create the schema, then re-run this script.",
            file=sys.stderr,
        )
        sys.exit(1)

    base_url = libsql_to_https(database_url)
    print(f"Source : {base_url}")
    print(f"Target : {LOCAL_DB}\n")

    conn = sqlite3.connect(LOCAL_DB)
    failed = []
    for table in TABLES:
        try:
            cols, rows = fetch_table(base_url, auth_token, table)
            seed_table(conn, table, cols, rows)
        except Exception as exc:
            print(f"  {table}: FAILED — {exc}", file=sys.stderr)
            failed.append(table)

    conn.close()

    if failed:
        print(f"\nFinished with errors on: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    else:
        print("\nDone.")


if __name__ == "__main__":
    main()
