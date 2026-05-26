#!/usr/bin/env python3
"""
Fix Discord permission overwrite bloat.

Removes channel-level overwrites that are bit-for-bit identical to the
parent category's overwrite for the same role/member — these are redundant
because the channel would inherit the same setting without them.

MODES
  (default)   Dry-run: show what would be removed, touch nothing.
  --apply     Save a full snapshot, then remove redundant overwrites.
  --restore   Restore all overwrites from a snapshot file.

USAGE
  python scripts/fix-discord-overwrites.py
  python scripts/fix-discord-overwrites.py --apply
  python scripts/fix-discord-overwrites.py --restore scripts/overwrite-snapshots/snapshot-20260522-143000.json

FLAGS
  --members   Also consider member-specific overwrites (type=1). Off by default.
  --zero      Also remove overwrites where allow=0 and deny=0 (no-op overwrites).
"""

import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

_ssl_ctx = ssl._create_unverified_context()

SNAPSHOT_DIR = Path(__file__).parent / "overwrite-snapshots"
RATE_LIMIT_SLEEP = 0.5   # seconds between mutating API calls


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def load_env():
    env = {}
    env_file = Path(__file__).parent.parent / "apps" / "bot" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    for k in ("BOT_TOKEN", "DISCORD_GUILD_ID"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def discord_request(method, path, token, body=None):
    url = f"https://discord.com/api/v10{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"Bot {token}",
        "User-Agent": "DiscordBot (https://github.com/jkomg/mcbn-xp-tracker, 1.0)",
    }
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=_ssl_ctx) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        # 404 on a DELETE just means it's already gone — not an error
        if method == "DELETE" and e.code == 404:
            return None
        print(f"  HTTP {e.code} {method} {path}: {body_text}", file=sys.stderr)
        raise


def discord_get(path, token):
    return discord_request("GET", path, token)

def discord_put(path, token, body):
    return discord_request("PUT", path, token, body)

def discord_delete(path, token):
    return discord_request("DELETE", path, token)


# ── Core logic ────────────────────────────────────────────────────────────────

CHANNEL_TYPES = {
    0: "text", 2: "voice", 4: "category", 5: "announcement",
    13: "stage", 15: "forum", 16: "media",
}

def overwrite_key(ow):
    """Unique key for an overwrite: (id, type)."""
    return (ow["id"], ow["type"])

def overwrite_matches(a, b):
    """True if two overwrites are bit-for-bit identical."""
    return (
        a["id"] == b["id"]
        and a["type"] == b["type"]
        and str(a["allow"]) == str(b["allow"])
        and str(a["deny"]) == str(b["deny"])
    )

def is_noop(ow):
    """True if an overwrite sets nothing (allow=0, deny=0)."""
    return str(ow["allow"]) == "0" and str(ow["deny"]) == "0"


def find_redundant_overwrites(channels, include_members=False, include_zero=False):
    """
    For each channel that has a parent category, find overwrites that are
    identical to the category's overwrite for the same target — meaning
    removing them cannot change effective permissions.

    Returns a list of (channel, overwrite) tuples to remove.
    """
    # Build category overwrite index: category_id -> {(id, type) -> overwrite}
    category_ows = {}
    for ch in channels:
        if ch.get("type") == 4:  # category
            cat_id = ch["id"]
            category_ows[cat_id] = {
                overwrite_key(ow): ow
                for ow in ch.get("permission_overwrites", [])
            }

    to_remove = []
    for ch in channels:
        if ch.get("type") == 4:
            continue  # skip categories themselves
        parent_id = ch.get("parent_id")
        if not parent_id or parent_id not in category_ows:
            continue  # no parent category or category not found

        cat_index = category_ows[parent_id]

        for ow in ch.get("permission_overwrites", []):
            ow_type = ow["type"]

            # Skip member overwrites unless --members flag set
            if ow_type == 1 and not include_members:
                continue

            key = overwrite_key(ow)
            cat_ow = cat_index.get(key)

            if cat_ow and overwrite_matches(ow, cat_ow):
                to_remove.append((ch, ow, "matches category"))
            elif include_zero and is_noop(ow):
                to_remove.append((ch, ow, "allow=0 deny=0 (no-op)"))

    return to_remove


# ── Snapshot ──────────────────────────────────────────────────────────────────

def save_snapshot(guild_id, channels):
    SNAPSHOT_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = SNAPSHOT_DIR / f"snapshot-{ts}.json"
    data = {
        "guild_id": guild_id,
        "timestamp": ts,
        "channels": [
            {
                "id": ch["id"],
                "name": ch.get("name", ""),
                "type": ch.get("type"),
                "parent_id": ch.get("parent_id"),
                "permission_overwrites": ch.get("permission_overwrites", []),
            }
            for ch in channels
        ],
    }
    path.write_text(json.dumps(data, indent=2))
    return path


def restore_snapshot(snapshot_path, token):
    data = json.loads(Path(snapshot_path).read_text())
    guild_id = data["guild_id"]
    channels = data["channels"]
    total_ows = sum(len(ch["permission_overwrites"]) for ch in channels)

    print(f"Restoring snapshot from {snapshot_path}")
    print(f"Guild: {guild_id}")
    print(f"Channels: {len(channels)}  |  Overwrites to restore: {total_ows}")
    print()

    restored = 0
    for ch in channels:
        ch_id = ch["id"]
        ch_name = ch.get("name", ch_id)
        ows = ch["permission_overwrites"]
        if not ows:
            continue
        for ow in ows:
            path = f"/channels/{ch_id}/permission-overwrites/{ow['id']}"
            try:
                discord_put(path, token, {
                    "allow": ow["allow"],
                    "deny": ow["deny"],
                    "type": ow["type"],
                })
                restored += 1
                print(f"  restored  #{ch_name}  target={ow['id']}  type={ow['type']}")
            except Exception as e:
                print(f"  ERROR restoring #{ch_name} overwrite {ow['id']}: {e}")
            time.sleep(RATE_LIMIT_SLEEP)

    print()
    print(f"Restored {restored} overwrites.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    mode_apply   = "--apply"   in args
    mode_restore = "--restore" in args
    include_members = "--members" in args
    include_zero    = "--zero"    in args

    env = load_env()
    token = env.get("BOT_TOKEN", "")
    guild_id = env.get("DISCORD_GUILD_ID", "")
    if not token or not guild_id:
        print("Error: BOT_TOKEN and DISCORD_GUILD_ID required.", file=sys.stderr)
        sys.exit(1)

    # ── Restore mode ──────────────────────────────────────────────────────────
    if mode_restore:
        try:
            idx = args.index("--restore")
            snapshot_path = args[idx + 1]
        except (ValueError, IndexError):
            print("Usage: --restore <path/to/snapshot.json>", file=sys.stderr)
            sys.exit(1)
        restore_snapshot(snapshot_path, token)
        return

    # ── Fetch channels ────────────────────────────────────────────────────────
    print(f"Fetching guild {guild_id}...")
    channels = discord_get(f"/guilds/{guild_id}/channels", token)
    roles    = discord_get(f"/guilds/{guild_id}/roles", token)
    role_names = {r["id"]: r["name"] for r in roles}

    total_before = sum(len(ch.get("permission_overwrites", [])) for ch in channels)

    # ── Find redundant overwrites ─────────────────────────────────────────────
    to_remove = find_redundant_overwrites(channels, include_members, include_zero)
    total_after = total_before - len(to_remove)

    print()
    print("=" * 65)
    if mode_apply:
        print("  MODE: APPLY — changes will be made (snapshot saved first)")
    else:
        print("  MODE: DRY-RUN — no changes will be made")
    print("=" * 65)
    print(f"  Current overwrites:  {total_before}")
    print(f"  Redundant found:     {len(to_remove)}")
    print(f"  Projected total:     {total_after}")
    print(f"  Includes members:    {'yes' if include_members else 'no (use --members to include)'}")
    print(f"  Includes no-ops:     {'yes' if include_zero else 'no (use --zero to include)'}")
    print()

    if not to_remove:
        print("Nothing to remove. Server is already clean for these options.")
        return

    # Group by channel for readable output
    by_channel = {}
    for ch, ow, reason in to_remove:
        by_channel.setdefault(ch["id"], (ch, []))[1].append((ow, reason))

    # Build category name map
    cat_names = {
        ch["id"]: ch.get("name", ch["id"])
        for ch in channels if ch.get("type") == 4
    }

    print("── Overwrites to remove ──────────────────────────────────────")
    for ch_id, (ch, pairs) in by_channel.items():
        cat = cat_names.get(ch.get("parent_id"), "")
        ch_type = CHANNEL_TYPES.get(ch.get("type"), "?")
        print(f"  #{ch.get('name', ch_id)}  [{ch_type}]  category: {cat}")
        for ow, reason in pairs:
            target = role_names.get(ow["id"], f"member:{ow['id']}" if ow["type"] == 1 else ow["id"])
            print(f"      remove  {target}  allow={ow['allow']} deny={ow['deny']}  ({reason})")
    print()

    # ── Dry-run stops here ────────────────────────────────────────────────────
    if not mode_apply:
        print("Dry-run complete. Run with --apply to execute.")
        return

    # ── Apply: snapshot first, then delete ───────────────────────────────────
    snapshot_path = save_snapshot(guild_id, channels)
    print(f"Snapshot saved: {snapshot_path}")
    print(f"To undo everything: python scripts/fix-discord-overwrites.py --restore {snapshot_path}")
    print()
    print("Removing overwrites...")

    removed = 0
    errors  = 0
    for ch, ow, reason in to_remove:
        ch_name = ch.get("name", ch["id"])
        target = role_names.get(ow["id"], ow["id"])
        path = f"/channels/{ch['id']}/permission-overwrites/{ow['id']}"
        try:
            discord_delete(path, token)
            removed += 1
            print(f"  removed  #{ch_name}  {target}  ({reason})")
        except Exception as e:
            errors += 1
            print(f"  ERROR    #{ch_name}  {target}: {e}")
        time.sleep(RATE_LIMIT_SLEEP)

    print()
    print("=" * 65)
    print(f"  Removed: {removed}  |  Errors: {errors}")
    print(f"  Overwrites before: {total_before}  →  projected after: {total_after}")
    print(f"  Snapshot: {snapshot_path}")
    print(f"  Restore:  python scripts/fix-discord-overwrites.py --restore {snapshot_path}")
    print("=" * 65)


if __name__ == "__main__":
    main()
