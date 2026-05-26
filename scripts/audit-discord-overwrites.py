#!/usr/bin/env python3
"""
Audit Discord permission overwrite bloat in a guild.

Usage:
    python scripts/audit-discord-overwrites.py

Reads BOT_TOKEN and DISCORD_GUILD_ID from apps/bot/.env (or environment).
"""

import json
import os
import ssl
import sys
import urllib.request
import urllib.error
from collections import Counter, defaultdict
from pathlib import Path

# macOS Python installs often lack CA certs; this is safe for a known host.
_ssl_ctx = ssl._create_unverified_context()


def load_env():
    env = {}
    env_file = Path(__file__).parent.parent / "apps" / "bot" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    # Environment variables take precedence
    for k in ("BOT_TOKEN", "DISCORD_GUILD_ID"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def discord_get(path, token):
    url = f"https://discord.com/api/v10{path}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bot {token}",
        "User-Agent": "DiscordBot (https://github.com/jkomg/mcbn-xp-tracker, 1.0)",
    })
    try:
        with urllib.request.urlopen(req, context=_ssl_ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code} for {path}: {body}", file=sys.stderr)
        sys.exit(1)


CHANNEL_TYPES = {
    0: "text", 2: "voice", 4: "category", 5: "announcement",
    13: "stage", 15: "forum", 16: "media",
}

OVERWRITE_TYPES = {0: "role", 1: "member"}


def main():
    env = load_env()
    token = env.get("BOT_TOKEN", "")
    guild_id = env.get("DISCORD_GUILD_ID", "")

    if not token or not guild_id:
        print("Error: BOT_TOKEN and DISCORD_GUILD_ID are required.", file=sys.stderr)
        print("Set them in apps/bot/.env or as environment variables.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching guild {guild_id}...")
    roles_raw = discord_get(f"/guilds/{guild_id}/roles", token)
    channels_raw = discord_get(f"/guilds/{guild_id}/channels", token)

    role_names = {r["id"]: r["name"] for r in roles_raw}

    # Build channel list with overwrite counts
    channels = []
    for ch in channels_raw:
        overwrites = ch.get("permission_overwrites", [])
        channels.append({
            "id": ch["id"],
            "name": ch.get("name", "?"),
            "type": CHANNEL_TYPES.get(ch.get("type"), str(ch.get("type"))),
            "parent_id": ch.get("parent_id"),
            "overwrites": overwrites,
            "overwrite_count": len(overwrites),
        })

    # Build category name map
    category_names = {
        ch["id"]: ch["name"]
        for ch in channels if ch["type"] == "category"
    }

    total_overwrites = sum(ch["overwrite_count"] for ch in channels)

    # Role frequency across all overwrites
    role_counter = Counter()
    member_counter = Counter()
    for ch in channels:
        for ow in ch["overwrites"]:
            if ow["type"] == 0:
                role_counter[ow["id"]] += 1
            else:
                member_counter[ow["id"]] += 1

    # Channels sorted by overwrite count (descending)
    channels_sorted = sorted(channels, key=lambda c: c["overwrite_count"], reverse=True)

    # ── Report ────────────────────────────────────────────────────────────────

    print()
    print("=" * 65)
    print(f"  DISCORD OVERWRITE AUDIT — guild {guild_id}")
    print("=" * 65)
    print(f"  Total channels:   {len(channels)}")
    print(f"  Total roles:      {len(roles_raw)}")
    print(f"  Total overwrites: {total_overwrites}  (Discord limit: 1000)")
    pct = total_overwrites / 1000 * 100
    print(f"  Limit used:       {pct:.1f}%")
    print()

    # Top channels by overwrite count
    print("── Top channels by overwrite count ──────────────────────────")
    print(f"  {'#OW':>4}  {'type':<10}  {'category':<20}  channel")
    print(f"  {'----':>4}  {'----------':<10}  {'--------------------':<20}  -------")
    for ch in channels_sorted[:25]:
        if ch["overwrite_count"] == 0:
            break
        cat = category_names.get(ch["parent_id"], "") if ch["parent_id"] else ""
        print(f"  {ch['overwrite_count']:>4}  {ch['type']:<10}  {cat[:20]:<20}  {ch['name']}")

    print()

    # Roles that appear in the most channels
    print("── Roles appearing in the most channels ──────────────────────")
    print(f"  {'#ch':>4}  role name")
    print(f"  {'----':>4}  ---------")
    for role_id, count in role_counter.most_common(20):
        name = role_names.get(role_id, f"<unknown {role_id}>")
        print(f"  {count:>4}  {name}")

    if member_counter:
        print()
        print("── Member-specific overwrites (these are unusual) ────────────")
        print(f"  {'#ch':>4}  member id")
        for member_id, count in member_counter.most_common(10):
            print(f"  {count:>4}  {member_id}")

    print()

    # Channels with zero overwrites (fully inheriting — good)
    zero = sum(1 for ch in channels if ch["overwrite_count"] == 0)
    print(f"── Summary ───────────────────────────────────────────────────")
    print(f"  Channels with 0 overwrites (fully inheriting): {zero}")
    print(f"  Channels with 1–3 overwrites:  {sum(1 for ch in channels if 1 <= ch['overwrite_count'] <= 3)}")
    print(f"  Channels with 4–9 overwrites:  {sum(1 for ch in channels if 4 <= ch['overwrite_count'] <= 9)}")
    print(f"  Channels with 10+ overwrites:  {sum(1 for ch in channels if ch['overwrite_count'] >= 10)}")

    # Per-category breakdown
    print()
    print("── Overwrites per category ───────────────────────────────────")
    category_totals = defaultdict(int)
    for ch in channels:
        cat = category_names.get(ch["parent_id"], "(no category)") if ch["parent_id"] else "(no category)"
        category_totals[cat] += ch["overwrite_count"]
    for cat, total in sorted(category_totals.items(), key=lambda x: -x[1]):
        print(f"  {total:>4}  {cat}")

    print()
    print("=" * 65)

    if total_overwrites >= 900:
        print("  WARNING: Very close to the 1000 limit.")
    elif total_overwrites >= 700:
        print("  CAUTION: Approaching the 1000 limit.")
    else:
        print("  Overwrite count is within a safe range.")
    print("=" * 65)
    print()


if __name__ == "__main__":
    main()
