#!/usr/bin/env python3
"""Copy production Turso data into the dev Turso database.

Reads from prod via PROD_DATABASE_URL + PROD_TURSO_AUTH_TOKEN and writes to
dev via DEV_DATABASE_URL + DEV_TURSO_AUTH_TOKEN.  Skips large/noisy tables
(audit_log, app_log_entries, sheets_sync_errors, notion_sync_events).

Usage:
    PROD_DATABASE_URL=libsql+https://mcbn-jkomg... \\
    PROD_TURSO_AUTH_TOKEN=<prod-token> \\
    DEV_DATABASE_URL=libsql+https://mcbn-dev-jkomg... \\
    DEV_TURSO_AUTH_TOKEN=<dev-token> \\
    python scripts/seed-dev-turso.py

Tokens can be generated with: turso db tokens create mcbn-prod
"""

import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

# Tables to copy in dependency order.  Excluded:
#   audit_log            — large, staff-action history not useful for dev
#   app_log_entries      — error alerts from prod, confusing in dev
#   sheets_sync_errors   — transient prod noise
#   notion_sync_events   — sync history, not needed for dev testing
TABLES = [
    "characters",
    "play_periods",
    "xp_claims",
    "spend_requests",
    "ledger_entries",
    "wiki_pages",
    "wiki_sync_blocks",
    "app_settings",
    "reminder_preferences",
    "character_backgrounds",
    "character_drafts",
]


def libsql_to_https(url: str) -> str:
    return url.replace("libsql+https://", "https://").replace("libsql://", "https://").rstrip("/")


def _ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def turso_execute(base_url: str, token: str, sql: str, args: list | None = None) -> dict:
    stmt = {"sql": sql}
    if args:
        stmt["args"] = [{"type": "text", "value": str(a)} if a is not None else {"type": "null"} for a in args]
    payload = json.dumps({
        "requests": [
            {"type": "execute", "stmt": stmt},
            {"type": "close"},
        ]
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/v2/pipeline",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
        return json.loads(resp.read())


def fetch_table(base_url: str, token: str, table: str) -> tuple[list[str], list[list]]:
    data = turso_execute(base_url, token, f"SELECT * FROM {table}")
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


def write_table(base_url: str, token: str, table: str, cols: list[str], rows: list[list]) -> None:
    if not rows:
        print(f"  {table}: 0 rows (skipped)")
        return

    col_list = ", ".join(cols)
    placeholders = ", ".join(["?" ] * len(cols))
    sql = f"INSERT OR REPLACE INTO {table} ({col_list}) VALUES ({placeholders})"

    # Turso HTTP doesn't support executemany natively; batch as a pipeline
    BATCH = 50
    inserted = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        requests = []
        for row in chunk:
            args = []
            for val in row:
                if val is None:
                    args.append({"type": "null"})
                elif isinstance(val, int):
                    args.append({"type": "integer", "value": str(val)})
                elif isinstance(val, float):
                    args.append({"type": "float", "value": str(val)})
                else:
                    args.append({"type": "text", "value": str(val)})
            requests.append({"type": "execute", "stmt": {"sql": sql, "args": args}})
        requests.append({"type": "close"})

        payload = json.dumps({"requests": requests}).encode()
        req = urllib.request.Request(
            f"{base_url}/v2/pipeline",
            data=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
            result = json.loads(resp.read())
        for r in result["results"]:
            if r["type"] == "error":
                raise RuntimeError(f"{table}: {r['error']}")
        inserted += len(chunk)

    print(f"  {table}: {inserted} rows")


def main() -> None:
    prod_url = os.environ.get("PROD_DATABASE_URL", "")
    prod_token = os.environ.get("PROD_TURSO_AUTH_TOKEN", "")
    dev_url = os.environ.get("DEV_DATABASE_URL", "")
    dev_token = os.environ.get("DEV_TURSO_AUTH_TOKEN", "")

    missing = [k for k, v in [
        ("PROD_DATABASE_URL", prod_url), ("PROD_TURSO_AUTH_TOKEN", prod_token),
        ("DEV_DATABASE_URL", dev_url), ("DEV_TURSO_AUTH_TOKEN", dev_token),
    ] if not v]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)

    prod_base = libsql_to_https(prod_url)
    dev_base = libsql_to_https(dev_url)
    print(f"Source : {prod_base}")
    print(f"Target : {dev_base}\n")

    # Wipe dev tables first (reverse order to avoid FK issues)
    print("Clearing dev tables...")
    for table in reversed(TABLES):
        try:
            turso_execute(dev_base, dev_token, f"DELETE FROM {table}")
            print(f"  cleared {table}")
        except Exception as exc:
            print(f"  {table}: could not clear — {exc} (may not exist yet, continuing)")

    print("\nCopying prod → dev...")
    failed = []
    for table in TABLES:
        try:
            cols, rows = fetch_table(prod_base, prod_token, table)
            write_table(dev_base, dev_token, table, cols, rows)
        except Exception as exc:
            print(f"  {table}: FAILED — {exc}", file=sys.stderr)
            failed.append(table)

    if failed:
        print(f"\nFinished with errors on: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    else:
        print("\nDone. Dev DB is seeded from prod.")


if __name__ == "__main__":
    main()
