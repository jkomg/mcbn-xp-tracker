#!/usr/bin/env python3
"""
Promote consistent channel permission overwrites up to the category level.

For each category, finds role overwrites that appear on every channel in that
category with identical allow/deny values, then merges them onto the category
itself. After this runs, fix-discord-overwrites.py will remove the now-redundant
per-channel copies.

Safe by design:
  - Never removes existing category permissions, only adds to them.
  - Requires 100% consensus across channels by default (--threshold to lower).
  - Only promotes role overwrites (type=0). Member overwrites are left alone.
  - Dry-run by default. Snapshot saved before any changes.

Usage:
    python scripts/promote-category-permissions.py
    python scripts/promote-category-permissions.py --apply
    python scripts/promote-category-permissions.py --apply --threshold 0.8
    python scripts/promote-category-permissions.py --categories "Ancilla Character Cubbies,Neonate Character Cubbies"
    python scripts/promote-category-permissions.py --restore snapshots/snapshot-TIMESTAMP.json
"""

import json
import os
import http.client
import ssl
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from collections import defaultdict
from pathlib import Path

_ssl_ctx = ssl._create_unverified_context()
SNAPSHOT_DIR = Path(__file__).parent / "overwrite-snapshots"
RATE_LIMIT_SLEEP = 0.5


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
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode(errors="replace")
        if method in ("DELETE", "PUT") and exc.code == 404:
            return None
        print(f"  HTTP {exc.code} {method} {path}: {body_text}", file=sys.stderr)
        raise


def discord_get(path, token):
    return discord_request("GET", path, token)

def discord_put(path, token, body):
    return discord_request("PUT", path, token, body)


# ── Permission merge ──────────────────────────────────────────────────────────

def merge_permissions(cat_allow: int, cat_deny: int, new_allow: int, new_deny: int):
    """
    Merge channel consensus permissions into existing category permissions.
    Never removes existing category permissions — only adds.
    Allow bits take precedence over deny bits.
    """
    merged_allow = cat_allow | new_allow
    merged_deny = (cat_deny | new_deny) & ~merged_allow  # clear conflicts
    return merged_allow, merged_deny


# ── Snapshot ──────────────────────────────────────────────────────────────────

def save_snapshot(guild_id, channels):
    SNAPSHOT_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = SNAPSHOT_DIR / f"snapshot-promote-{ts}.json"
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
    channels = data["channels"]
    print(f"Restoring {snapshot_path} ...")
    restored = 0
    for ch in channels:
        for ow in ch["permission_overwrites"]:
            path = f"/channels/{ch['id']}/permission-overwrites/{ow['id']}"
            try:
                discord_put(path, token, {"allow": ow["allow"], "deny": ow["deny"], "type": ow["type"]})
                restored += 1
            except Exception as e:
                print(f"  ERROR #{ch['name']} {ow['id']}: {e}")
            time.sleep(RATE_LIMIT_SLEEP)
    print(f"Restored {restored} overwrites.")


# ── Core logic ────────────────────────────────────────────────────────────────

def find_promotions(channels, threshold=1.0, target_categories=None):
    """
    For each category, find role overwrites that appear on >= threshold fraction
    of its channels with identical allow/deny values. Returns a list of:
      (category_channel, role_id, consensus_allow_int, consensus_deny_int, matching_count, total_count)
    """
    # Build maps
    categories = {ch["id"]: ch for ch in channels if ch.get("type") == 4}
    children = defaultdict(list)
    for ch in channels:
        pid = ch.get("parent_id")
        if pid and pid in categories and ch.get("type") != 4:
            children[pid].append(ch)

    # Build category overwrite index
    def cat_ow_map(cat):
        return {ow["id"]: ow for ow in cat.get("permission_overwrites", [])}

    promotions = []

    for cat_id, cat in categories.items():
        cat_name = cat.get("name", cat_id)
        if target_categories and cat_name not in target_categories:
            continue

        child_list = children[cat_id]
        if not child_list:
            continue

        # Collect role overwrite votes: role_id -> {(allow, deny): count}
        votes = defaultdict(lambda: defaultdict(int))
        for ch in child_list:
            for ow in ch.get("permission_overwrites", []):
                if ow["type"] != 0:  # role overwrites only
                    continue
                key = (str(ow["allow"]), str(ow["deny"]))
                votes[ow["id"]][key] += 1

        cat_ows = cat_ow_map(cat)

        for role_id, vote_counts in votes.items():
            total = len(child_list)
            best_key, best_count = max(vote_counts.items(), key=lambda x: x[1])
            frac = best_count / total

            if frac < threshold:
                continue

            consensus_allow = int(best_key[0])
            consensus_deny = int(best_key[1])

            # Check if category already has this exact overwrite
            existing = cat_ows.get(role_id)
            existing_allow = int(existing["allow"]) if existing else 0
            existing_deny = int(existing["deny"]) if existing else 0

            new_allow, new_deny = merge_permissions(
                existing_allow, existing_deny, consensus_allow, consensus_deny
            )

            # Skip if nothing would change
            if new_allow == existing_allow and new_deny == existing_deny:
                continue

            promotions.append({
                "category": cat,
                "role_id": role_id,
                "existing_allow": existing_allow,
                "existing_deny": existing_deny,
                "new_allow": new_allow,
                "new_deny": new_deny,
                "match_count": best_count,
                "total": total,
            })

    return promotions


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    mode_apply   = "--apply"   in args
    mode_restore = "--restore" in args

    threshold = 1.0
    if "--threshold" in args:
        idx = args.index("--threshold")
        threshold = float(args[idx + 1])

    target_categories = None
    if "--categories" in args:
        idx = args.index("--categories")
        target_categories = set(c.strip() for c in args[idx + 1].split(","))

    env = load_env()
    token = env.get("BOT_TOKEN", "")
    guild_id = env.get("DISCORD_GUILD_ID", "")
    if not token or not guild_id:
        print("Error: BOT_TOKEN and DISCORD_GUILD_ID required.", file=sys.stderr)
        sys.exit(1)

    if mode_restore:
        try:
            idx = args.index("--restore")
            restore_snapshot(args[idx + 1], token)
        except (ValueError, IndexError):
            print("Usage: --restore <path/to/snapshot.json>", file=sys.stderr)
            sys.exit(1)
        return

    print(f"Fetching guild {guild_id}...")
    channels = discord_get(f"/guilds/{guild_id}/channels", token)
    roles    = discord_get(f"/guilds/{guild_id}/roles", token)
    role_names = {r["id"]: r["name"] for r in roles}

    promotions = find_promotions(channels, threshold=threshold, target_categories=target_categories)

    print()
    print("=" * 65)
    if mode_apply:
        print("  MODE: APPLY — changes will be made (snapshot saved first)")
    else:
        print("  MODE: DRY-RUN — no changes will be made")
    print("=" * 65)
    print(f"  Threshold:          {int(threshold*100)}% channel consensus required")
    if target_categories:
        print(f"  Target categories:  {', '.join(target_categories)}")
    else:
        print(f"  Target categories:  all")
    print(f"  Promotions found:   {len(promotions)}")
    print()

    if not promotions:
        print("Nothing to promote. All consistent role permissions are already on their categories.")
        return

    # Group by category for readable output
    by_cat = defaultdict(list)
    for p in promotions:
        by_cat[p["category"]["name"]].append(p)

    print("── Permissions to promote to category level ──────────────────")
    for cat_name, items in sorted(by_cat.items()):
        print(f"\n  [{cat_name}]")
        for p in items:
            role = role_names.get(p["role_id"], p["role_id"])
            coverage = f"{p['match_count']}/{p['total']} channels"
            existing_note = ""
            if p["existing_allow"] or p["existing_deny"]:
                existing_note = f" (merging with existing allow={p['existing_allow']} deny={p['existing_deny']})"
            print(f"    {role:<22}  allow={p['new_allow']}  deny={p['new_deny']}  ({coverage}){existing_note}")
    print()

    if not mode_apply:
        print("Dry-run complete.")
        print("Run with --apply to promote these to category level, then run:")
        print("  python scripts/fix-discord-overwrites.py --apply")
        print("to remove the now-redundant per-channel copies.")
        return

    # Apply
    snapshot_path = save_snapshot(guild_id, channels)
    print(f"Snapshot saved: {snapshot_path}")
    print(f"To undo: python scripts/promote-category-permissions.py --restore {snapshot_path}")
    print()
    print("Promoting permissions...")

    applied = 0
    errors  = 0
    for p in promotions:
        cat = p["category"]
        role = role_names.get(p["role_id"], p["role_id"])
        path = f"/channels/{cat['id']}/permission-overwrites/{p['role_id']}"
        try:
            discord_put(path, token, {
                "allow": str(p["new_allow"]),
                "deny":  str(p["new_deny"]),
                "type":  0,
            })
            applied += 1
            print(f"  promoted  [{cat['name']}]  {role}  allow={p['new_allow']} deny={p['new_deny']}")
        except Exception as e:
            errors += 1
            print(f"  ERROR     [{cat['name']}]  {role}: {e}")
        time.sleep(RATE_LIMIT_SLEEP)

    print()
    print("=" * 65)
    print(f"  Promoted: {applied}  |  Errors: {errors}")
    print()
    print("Next step — remove the now-redundant per-channel copies:")
    print("  python scripts/fix-discord-overwrites.py --dry-run")
    print("  python scripts/fix-discord-overwrites.py --apply")
    print("=" * 65)


if __name__ == "__main__":
    main()
