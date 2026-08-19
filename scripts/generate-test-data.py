#!/usr/bin/env python3
"""Generate synthetic characters/claims/spends for load-testing a NON-PROD env.

Two modes:

  --mode api (default)
      POSTs to /api/roster/character, /api/claims and /api/spends with a
      bearer token, exactly like the bot does. Exercises real server-side
      validation (dot ranges, category names, duplicate-claim checks, ...).
      /api/claims and /api/spends are rate limited to 20/min on the server,
      so writes are paced with a sleep between requests (see --sleep-seconds).
      Replay protection (X-Request-Timestamp / X-Request-Nonce) is sent on
      every write regardless of whether the target has it enabled.

  --mode db
      Writes rows directly to Turso over its HTTP API (same technique as
      scripts/seed-dev-turso.py) — no libsql driver, no validation, much
      faster. Good for bulk volume rather than exercising business rules.

Every generated character/claim/spend is tagged with the PREFIX below so
runs are trivially identifiable and reversible. `--cleanup` deletes ONLY rows
whose character_name starts with PREFIX, and only works with --mode db —
the bot API's DELETE /api/roster/character refuses (409) to delete a
character that already has claims/spends attached, which every character
this script creates will have.

Safety:
  - Nothing is written unless --yes is passed. Without it, this prints a
    dry-run plan and exits — and the dry run works with NO credentials
    present anywhere (no env vars, no apps/web/.env), since it never makes
    a network call.
  - Before any real write, the script refuses to run against anything it
    cannot positively identify as non-production. See assess_api_target /
    assess_db_target below. The check fails CLOSED: an unrecognized host is
    treated as unsafe, not as "probably fine".
  - Credentials are only ever read from process environment variables or
    apps/web/.env (never hardcoded, never printed).

Requires Python 3.10+ (PEP 604 annotations, same as scripts/seed-dev-turso.py).
macOS ships 3.9 as `python3`, where this fails at import with
"unsupported operand type(s) for |". Use the project interpreter:

    ./apps/web/venv/bin/python scripts/generate-test-data.py --help

Usage:
    python scripts/generate-test-data.py --help
    python scripts/generate-test-data.py --mode db --characters 20 --claims 40 --spends 40
    python scripts/generate-test-data.py --mode db --characters 20 --claims 40 --spends 40 --yes
    python scripts/generate-test-data.py --mode db --cleanup --yes
"""

import argparse
import json
import os
import random
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "apps" / "web" / ".env"
XP_COSTS_PATH = REPO_ROOT / "packages" / "rules" / "xp_costs.json"

# Every character/claim/spend this script creates carries this prefix on
# character_name (claims/spends aren't prefixed directly, but they're keyed
# to a prefixed character_name, so they're identifiable and cleanable too).
PREFIX = "ZZTest_"

DEFAULT_API_BASE_URL = "http://127.0.0.1:5001"

# /api/claims and /api/spends are limited to 20/min server-side (see
# docs/API_ENDPOINTS.md). 3.5s between writes keeps us at ~17/min with
# margin for clock skew and other concurrent bot traffic hitting the same
# bucket. /api/roster/character has its own, stricter 60/hour limit; we pace
# it the same way and just stop with a clear message if the server 429s.
DEFAULT_SLEEP_SECONDS = 3.5

# Mirrors apps/web/app/models.py CLANS/AGE_CATEGORIES/SECTS. Duplicated
# (rather than imported) because this script is stdlib-only and must not
# require the Flask app to be importable to run.
CLANS = [
    "Brujah", "Gangrel", "Hecata", "Lasombra", "Malkavian",
    "Nosferatu", "Ravnos", "Salubri", "Toreador", "Tremere",
    "Tzimisce", "Ventrue", "Banu Haqim", "The Ministry",
    "Thin-Blood", "Caitiff",
]
AGE_CATEGORIES = ["Fledgling", "Neonate", "Ancilla", "Elder"]
SECTS = ["Camarilla", "Anarch", "Hecata", "Autarkis"]

# Spend categories exercised by the generator. Chosen to cover each distinct
# xp_costs.json cost formula (progressive multiplier, flat 0->1, flat-per-dot)
# while staying clear of edge cases that need extra API fields:
#   - Discipline/Ritual/Alchemy/Loresheet categories are skipped to avoid
#     needing a believable powerName.
#   - "Status" (the one trait that triggers the Advantage sub-category
#     requirement in _SUBCATEGORY_ADVANTAGES) is deliberately excluded from
#     the Advantage trait pool below.
#   - Humanity/Blood Potency are skipped since they're sheet-driven vitals;
#     nothing stops them working (character_vital_rating returns None for a
#     character with no imported sheet) but they don't add coverage here.
SPEND_CHOICES: list[tuple[str, list[str]]] = [
    ("Attribute", ["Strength", "Dexterity", "Stamina", "Charisma", "Wits", "Resolve"]),
    ("Skill", ["Athletics", "Brawl", "Stealth", "Persuasion", "Investigation", "Occult"]),
    ("New Skill", ["Etiquette", "Larceny", "Streetwise", "Survival"]),
    ("Advantage (Merit/Background)", ["Resources", "Contacts", "Allies", "Herd", "Haven"]),
    ("Skill Specialty", ["Firearms (Quickdraw)", "Brawl (Grappling)", "Stealth (Shadows)"]),
]

CLAIM_CATEGORY_KEYS = [
    "posted_once", "hunting_awakening", "scene_with_another",
    "conflict", "combat", "unmitigated_stain",
]


# ── Credentials (env vars / apps/web/.env only — never hardcoded) ──────────

def parse_env(path: Path) -> dict[str, str]:
    """Parse a KEY=value .env file. Same convention as seed-local-db.py."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def resolve_credentials() -> dict[str, str]:
    """Env vars win over apps/web/.env, matching normal shell-override expectations."""
    file_env = parse_env(ENV_FILE)

    def pick(*names: str) -> str:
        for name in names:
            if name in os.environ:
                return os.environ[name]
        for name in names:
            if name in file_env:
                return file_env[name]
        return ""

    return {
        "DATABASE_URL": pick("DATABASE_URL"),
        "TURSO_AUTH_TOKEN": pick("TURSO_AUTH_TOKEN"),
        "API_BASE_URL": pick("API_BASE_URL", "WEB_APP_BASE_URL"),
        "API_TOKEN": pick("WEB_APP_API_WRITE_TOKEN", "WEB_APP_API_TOKEN"),
    }


# ── Turso HTTP helpers (same technique as scripts/seed-dev-turso.py) ───────

def libsql_to_https(url: str) -> str:
    return url.replace("libsql+https://", "https://").replace("libsql://", "https://").rstrip("/")


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _arg_cell(value: Any) -> dict:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": str(value)}
    return {"type": "text", "value": str(value)}


def turso_execute(base_url: str, token: str, sql: str, args: list | None = None) -> dict:
    stmt: dict[str, Any] = {"sql": sql}
    if args:
        stmt["args"] = [_arg_cell(a) for a in args]
    payload = json.dumps({"requests": [{"type": "execute", "stmt": stmt}, {"type": "close"}]}).encode()
    req = urllib.request.Request(
        f"{base_url}/v2/pipeline",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
        data = json.loads(resp.read())
    result = data["results"][0]
    if result["type"] == "error":
        raise RuntimeError(result["error"])
    return result["response"]["result"]


def turso_select(base_url: str, token: str, sql: str, args: list | None = None) -> list[dict]:
    rs = turso_execute(base_url, token, sql, args)
    cols = [c["name"] for c in rs["cols"]]
    rows = []
    for row in rs["rows"]:
        record = {}
        for col, cell in zip(cols, row):
            t = cell["type"]
            if t == "null":
                record[col] = None
            elif t == "integer":
                record[col] = int(cell["value"])
            elif t == "float":
                record[col] = float(cell["value"])
            else:
                record[col] = cell["value"]
        rows.append(record)
    return rows


def turso_insert_many(base_url: str, token: str, table: str, cols: list[str], rows: list[list]) -> int:
    """Plain INSERT (not OR REPLACE) — a collision means we generated a
    duplicate character_name, which should be surprising and surfaced, not
    silently swallowed the way seed-dev-turso.py's mirror job wants it to be.
    """
    if not rows:
        return 0
    col_list = ", ".join(cols)
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"

    BATCH = 50
    inserted = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        requests = [{"type": "execute", "stmt": {"sql": sql, "args": [_arg_cell(v) for v in row]}} for row in chunk]
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
    return inserted


def turso_delete_prefixed(base_url: str, token: str, table: str) -> int:
    """Delete rows whose character_name starts with PREFIX.

    Uses substr() equality rather than LIKE so the underscore in "ZZTest_"
    is matched literally instead of as a LIKE single-char wildcard.
    """
    sql = f"DELETE FROM {table} WHERE substr(character_name, 1, ?) = ?"
    rs = turso_execute(base_url, token, sql, [len(PREFIX), PREFIX])
    return int(rs.get("affected_row_count", 0) or 0)


# ── Prod guard (fail closed) ────────────────────────────────────────────────

PROD_API_HOST = "mcbn.jkomg.us"
LOCAL_API_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "web"}  # 'web' = compose service name


def _hostname_of(url: str) -> str:
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def assess_api_target(base_url: str) -> tuple[bool, str]:
    """Is base_url safe to write test data to? Unknown hosts are refused."""
    host = _hostname_of(base_url)
    if not host:
        return False, f"Could not parse a hostname from {base_url!r} — refusing (fail closed)."
    if host == PROD_API_HOST:
        return False, f"{base_url!r} is the PRODUCTION host ({PROD_API_HOST}). Refusing."
    if host in LOCAL_API_HOSTS:
        return True, f"{host!r} looks like a local dev target."
    if "dev" in host:
        return True, f"{host!r} contains 'dev' — treated as a non-production target."
    return False, (
        f"Cannot confirm {host!r} is non-production (expected localhost or a host "
        f"containing 'dev', e.g. dev.mcbn.jkomg.us). Refusing (fail closed)."
    )


def assess_db_target(database_url: str) -> tuple[bool, str]:
    """Is database_url safe to write test data to? Unknown hosts are refused.

    There's no hardcoded prod Turso hostname to check against (it's not
    public information and shouldn't be baked into this script) — instead
    this positively requires 'dev' in the hostname, matching this repo's own
    naming convention (see scripts/seed-dev-turso.py: DEV_DATABASE_URL is
    libsql+https://mcbn-dev-jkomg..., prod is libsql+https://mcbn-jkomg...
    with no 'dev'). Anything that doesn't match is refused, not assumed safe.
    """
    if not database_url:
        return False, "DATABASE_URL not found — refusing (fail closed)."
    if not database_url.startswith(("libsql+https://", "libsql://")):
        return False, (
            f"DATABASE_URL ({database_url!r}) is not a Turso libsql URL. "
            "--mode db writes over the Turso HTTP API and only makes sense against Turso."
        )
    host = _hostname_of(libsql_to_https(database_url))
    if not host:
        return False, "Could not parse a hostname from DATABASE_URL — refusing (fail closed)."
    if "dev" in host:
        return True, f"{host!r} contains 'dev' — treated as a non-production Turso database."
    return False, (
        f"Cannot confirm {host!r} is a non-production database (expected a hostname "
        "containing 'dev'). Refusing (fail closed)."
    )


# ── Synthetic data generation (pure — no I/O, deterministic per --seed) ────

NAME_POOL = [
    "Ashfall", "Briarwood", "Cindergate", "Duskmere", "Emberly", "Frostvale",
    "Graywick", "Hollowmere", "Ironvale", "Jettwood", "Kestrel", "Lockhaven",
]


def generate_characters(rng: random.Random, n: int) -> list[dict]:
    characters = []
    for i in range(1, n + 1):
        discord_id = f"9{i:018d}"[:18]  # synthetic, in the 17-20 digit snowflake shape
        characters.append({
            "character_name": f"{PREFIX}{rng.choice(NAME_POOL)}{i:04d}",
            "player_discord": discord_id,
            "player_discord_name": f"{PREFIX}Player{i:04d}",
            "clan": rng.choice(CLANS),
            "age_category": rng.choice(AGE_CATEGORIES),
            "sect": rng.choice(SECTS),
        })
    return characters


def _fake_discord_link(rng: random.Random) -> str:
    guild = "".join(rng.choices("0123456789", k=18))
    channel = "".join(rng.choices("0123456789", k=18))
    message = "".join(rng.choices("0123456789", k=18))
    return f"https://discord.com/channels/{guild}/{channel}/{message}"


def generate_claims(rng: random.Random, characters: list[dict], periods: list[str], n: int) -> list[dict]:
    """Round-robin over (character, period) pairs.

    A character can only have one non-denied claim per period (server-side
    uniqueness check), so the number of claims we can actually place is
    capped at len(characters) * len(periods). We generate up to that many
    and let the caller warn if n asked for more than that.
    """
    if not periods:
        return []
    slots = [(c, p) for p in periods for c in characters]
    rng.shuffle(slots)
    claims = []
    for character, period in slots[:n]:
        picked = rng.sample(CLAIM_CATEGORY_KEYS, k=rng.randint(1, 3))
        categories = {key: _fake_discord_link(rng) for key in picked}
        if rng.random() < 0.3:
            categories["wildcard"] = _fake_discord_link(rng)
            categories["wildcard_reason"] = f"{PREFIX}synthetic wildcard justification"
            categories["wildcard_amount"] = str(rng.randint(1, 3))
        claims.append({
            "character_name": character["character_name"],
            "player_discord": character["player_discord"],
            "play_period": period,
            "categories": categories,
        })
    return claims


def generate_spends(rng: random.Random, characters: list[dict], n: int) -> list[dict]:
    xp_costs = json.loads(XP_COSTS_PATH.read_text())
    spends = []
    for i in range(n):
        character = characters[i % len(characters)]
        category, trait_pool = rng.choice(SPEND_CHOICES)
        trait = rng.choice(trait_pool)
        rules = xp_costs[category]
        if "flat_cost" in rules:
            current_dots, new_dots = 0, 1
        elif "flat_per_dot" in rules:
            current_dots = rng.randint(rules["min_dots"], rules["max_dots"] - 1)
            new_dots = rng.randint(current_dots + 1, rules["max_dots"])
        else:  # multiplier (progressive)
            lo = max(rules["min_dots"], 0)
            current_dots = rng.randint(lo, rules["max_dots"] - 1)
            new_dots = current_dots + 1
        spends.append({
            "character_name": character["character_name"],
            "player_discord": character["player_discord"],
            "spend_category": category,
            "trait_name": trait,
            "current_dots": current_dots,
            "new_dots": new_dots,
            "is_in_clan": rng.random() < 0.5,
            "justification": f"{PREFIX}synthetic justification for {trait}",
        })
    return spends


def calculate_xp_cost(xp_costs: dict, category: str, current: int, new: int) -> int:
    """Mirrors apps/web/app/xp_rules.py — duplicated (not imported) because
    this script is stdlib-only and must not require the Flask app.
    """
    rules = xp_costs[category]
    if "flat_cost" in rules:
        return rules["flat_cost"]
    if "level_multiplier" in rules:
        return new * rules["level_multiplier"]
    if "flat_per_dot" in rules:
        return (new - current) * rules["flat_per_dot"]
    return sum(dot * rules["multiplier"] for dot in range(current + 1, new + 1))


# ── HTTP (api mode) ─────────────────────────────────────────────────────────

def _api_post(base_url: str, token: str, path: str, payload: dict, *, replay_headers: bool) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if replay_headers:
        # Sent unconditionally: harmless if the target has replay protection
        # disabled (dev's default per CLAUDE.md), required if it's enabled.
        headers["X-Request-Timestamp"] = str(int(time.time()))
        headers["X-Request-Nonce"] = f"{PREFIX}{time.time_ns()}"
    req = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        if exc.code == 429:
            retry_after = exc.headers.get("Retry-After")
            wait = float(retry_after) if retry_after else 5.0
            print(f"  429 rate limited on {path}, backing off {wait:.1f}s and retrying once...", file=sys.stderr)
            time.sleep(wait)
            with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
                return json.loads(resp.read())
        raise RuntimeError(f"POST {path} -> {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"POST {path} failed: {exc.reason}") from exc


def _api_get(base_url: str, token: str, path: str) -> dict:
    req = urllib.request.Request(
        f"{base_url}{path}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, context=_ssl_ctx()) as resp:
        return json.loads(resp.read())


def run_api(args: argparse.Namespace, creds: dict[str, str], rng: random.Random) -> None:
    base_url = args.api_base_url or creds["API_BASE_URL"] or DEFAULT_API_BASE_URL
    token = creds["API_TOKEN"]
    if not token:
        print("ERROR: no API token found (WEB_APP_API_WRITE_TOKEN / WEB_APP_API_TOKEN, "
              "via env var or apps/web/.env).", file=sys.stderr)
        sys.exit(1)

    safe, reason = assess_api_target(base_url)
    print(f"Target (api): {base_url}\n  {reason}")
    if not safe:
        print("Refusing to run.", file=sys.stderr)
        sys.exit(1)

    characters = generate_characters(rng, args.characters)
    print(f"\nCreating {len(characters)} characters via POST /api/roster/character...")
    created = []
    for char in characters:
        try:
            _api_post(base_url, token, "/api/roster/character", {
                "character_name": char["character_name"],
                "player_discord": char["player_discord"],
                "player_discord_name": char["player_discord_name"],
                "clan": char["clan"],
                "age_category": char["age_category"],
                "sect": char["sect"],
                "requesterDiscordId": char["player_discord"],
                "requesterDiscordName": char["player_discord_name"],
            }, replay_headers=False)
            created.append(char)
            print(f"  + {char['character_name']}")
        except RuntimeError as exc:
            print(f"  ! {char['character_name']}: {exc}", file=sys.stderr)
        time.sleep(args.sleep_seconds)

    if not created:
        # All roster-creation calls failed — surface this as a real failure
        # (non-zero exit) rather than quietly returning, since a silent no-op
        # after "the guard said this was fine" is easy to miss in a script log.
        raise RuntimeError("No characters were created; nothing to claim/spend against.")

    # Claims need an open period that already exists on the target — this
    # script has no way to create one via the bot API, so it uses whatever
    # is currently open rather than inventing a fake one.
    ctx = _api_get(base_url, token, f"/api/meta/claim-context?requesterDiscordId={created[0]['player_discord']}")
    open_periods = ctx.get("openPeriods") or []
    if not open_periods:
        print("\nNo open play periods on target — skipping claim generation.")
    else:
        claims = generate_claims(rng, created, open_periods, args.claims)
        if len(claims) < args.claims:
            print(
                f"\nNote: only {len(claims)}/{args.claims} claims are placeable — a character "
                f"can have only one claim per period, and there are {len(created)} characters x "
                f"{len(open_periods)} open period(s) = {len(created) * len(open_periods)} slots."
            )
        print(f"Submitting {len(claims)} claims via POST /api/claims...")
        for claim in claims:
            try:
                _api_post(base_url, token, "/api/claims", {
                    "requesterDiscordId": claim["player_discord"],
                    "characterName": claim["character_name"],
                    "playPeriod": claim["play_period"],
                    "categories": claim["categories"],
                }, replay_headers=True)
                print(f"  + {claim['character_name']} / {claim['play_period']}")
            except RuntimeError as exc:
                print(f"  ! {claim['character_name']}: {exc}", file=sys.stderr)
            time.sleep(args.sleep_seconds)

    spends = generate_spends(rng, created, args.spends)
    print(f"\nSubmitting {len(spends)} spends via POST /api/spends...")
    for spend in spends:
        try:
            resp = _api_post(base_url, token, "/api/spends", {
                "requesterDiscordId": spend["player_discord"],
                "characterName": spend["character_name"],
                "spendCategory": spend["spend_category"],
                "traitName": spend["trait_name"],
                "currentDots": spend["current_dots"],
                "newDots": spend["new_dots"],
                "isInClan": spend["is_in_clan"],
                "justification": spend["justification"],
            }, replay_headers=True)
            print(f"  + {spend['character_name']} / {spend['spend_category']}:{spend['trait_name']} "
                  f"({spend['current_dots']}->{spend['new_dots']}) = {resp.get('xpCost')} XP")
        except RuntimeError as exc:
            print(f"  ! {spend['character_name']}: {exc}", file=sys.stderr)
        time.sleep(args.sleep_seconds)

    print("\nDone.")


# ── DB (Turso HTTP) mode ────────────────────────────────────────────────────

def run_db(args: argparse.Namespace, creds: dict[str, str], rng: random.Random) -> None:
    database_url = creds["DATABASE_URL"]
    token = creds["TURSO_AUTH_TOKEN"]

    safe, reason = assess_db_target(database_url)
    print(f"Target (db): {database_url or '(not set)'}\n  {reason}")
    if not safe:
        print("Refusing to run.", file=sys.stderr)
        sys.exit(1)
    if not token:
        print("ERROR: TURSO_AUTH_TOKEN not found (env var or apps/web/.env).", file=sys.stderr)
        sys.exit(1)

    base_url = libsql_to_https(database_url)

    characters = generate_characters(rng, args.characters)
    now = time.strftime("%Y%m%d %H:%M:%S", time.gmtime())
    char_cols = [
        "character_name", "player_discord", "player_discord_name", "clan",
        "age_category", "sect", "active", "status", "creation_xp", "enemy",
        "date_added", "notes",
    ]
    char_rows = [
        [c["character_name"], c["player_discord"], c["player_discord_name"], c["clan"],
         c["age_category"], c["sect"], True, "active", 0, "", now,
         f"{PREFIX}synthetic character generated by generate-test-data.py (seed={args.seed})"]
        for c in characters
    ]
    inserted = turso_insert_many(base_url, token, "characters", char_cols, char_rows)
    print(f"Inserted {inserted} characters.")

    open_periods_rows = turso_select(
        base_url, token,
        "SELECT period_label FROM play_periods WHERE submissions_open = 1 AND active = 1 "
        "ORDER BY night_number DESC",
    )
    open_periods = [r["period_label"] for r in open_periods_rows]

    if not open_periods:
        print("No open play periods on target — skipping claim generation.")
    else:
        claims = generate_claims(rng, characters, open_periods, args.claims)
        if len(claims) < args.claims:
            print(
                f"Note: only {len(claims)}/{args.claims} claims are placeable — a character "
                f"can have only one claim per period, and there are {len(characters)} characters x "
                f"{len(open_periods)} open period(s) = {len(characters) * len(open_periods)} slots."
            )
        claim_cols = [
            "timestamp", "character_name", "play_period",
            "posted_once", "posted_once_link",
            "hunting_awakening", "hunting_awakening_link",
            "scene_with_another", "scene_with_another_link",
            "conflict", "conflict_link",
            "combat", "combat_link",
            "unmitigated_stain", "unmitigated_stain_link",
            "wildcard", "wildcard_link", "wildcard_reason", "wildcard_amount",
            "xp_claimed", "status", "approved_xp",
        ]
        claim_rows = []
        for claim in claims:
            cats = claim["categories"]
            wildcard_amount = int(cats.get("wildcard_amount", 0) or 0) if "wildcard" in cats else 0
            xp_claimed = sum(1 for k in CLAIM_CATEGORY_KEYS if k in cats) + (wildcard_amount if "wildcard" in cats else 0)
            claim_rows.append([
                now, claim["character_name"], claim["play_period"],
                "posted_once" in cats, cats.get("posted_once", ""),
                "hunting_awakening" in cats, cats.get("hunting_awakening", ""),
                "scene_with_another" in cats, cats.get("scene_with_another", ""),
                "conflict" in cats, cats.get("conflict", ""),
                "combat" in cats, cats.get("combat", ""),
                "unmitigated_stain" in cats, cats.get("unmitigated_stain", ""),
                "wildcard" in cats, cats.get("wildcard", ""), cats.get("wildcard_reason", ""), wildcard_amount,
                xp_claimed, "Pending", 0,
            ])
        inserted = turso_insert_many(base_url, token, "xp_claims", claim_cols, claim_rows)
        print(f"Inserted {inserted} XP claims.")

    xp_costs = json.loads(XP_COSTS_PATH.read_text())
    spends = generate_spends(rng, characters, args.spends)
    spend_cols = [
        "timestamp", "character_name", "spend_category", "trait_name",
        "current_dots", "new_dots", "xp_cost", "is_in_clan", "justification",
        "status", "verified_cost",
    ]
    spend_rows = [
        [now, s["character_name"], s["spend_category"], s["trait_name"],
         s["current_dots"], s["new_dots"],
         calculate_xp_cost(xp_costs, s["spend_category"], s["current_dots"], s["new_dots"]),
         s["is_in_clan"], s["justification"], "Pending", 0]
        for s in spends
    ]
    inserted = turso_insert_many(base_url, token, "spend_requests", spend_cols, spend_rows)
    print(f"Inserted {inserted} spend requests.")

    print("\nDone.")


def cleanup_db(creds: dict[str, str]) -> None:
    database_url = creds["DATABASE_URL"]
    token = creds["TURSO_AUTH_TOKEN"]

    safe, reason = assess_db_target(database_url)
    print(f"Target (db): {database_url or '(not set)'}\n  {reason}")
    if not safe:
        print("Refusing to run.", file=sys.stderr)
        sys.exit(1)
    if not token:
        print("ERROR: TURSO_AUTH_TOKEN not found (env var or apps/web/.env).", file=sys.stderr)
        sys.exit(1)

    base_url = libsql_to_https(database_url)
    # Children before parent, though nothing enforces FK order here (no real
    # foreign key from xp_claims/spend_requests to characters) — it's just
    # tidier to remove the detail rows before the roster entry they belong to.
    for table in ("xp_claims", "spend_requests", "characters"):
        count = turso_delete_prefixed(base_url, token, table)
        print(f"  {table}: deleted {count} row(s) matching prefix {PREFIX!r}")
    print("\nDone.")


# ── CLI ──────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="generate-test-data.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--mode", choices=["api", "db"], default="api",
                         help="api: POST to /api/claims and /api/spends (validated, rate-limited to "
                              "20/min, paced with --sleep-seconds). db: write straight to Turso over "
                              "its HTTP API (fast, unvalidated). Default: api.")
    parser.add_argument("--characters", type=int, default=5, help="Number of synthetic characters to create. Default: 5.")
    parser.add_argument("--claims", type=int, default=10, help="Number of XP claims to submit. Default: 10.")
    parser.add_argument("--spends", type=int, default=10, help="Number of spend requests to submit. Default: 10.")
    parser.add_argument("--seed", type=int, default=1337, help="Random seed — same seed produces the same data. Default: 1337.")
    parser.add_argument("--yes", action="store_true", help="Actually write data. Without this, only a dry-run plan is printed.")
    parser.add_argument(
        "--cleanup", action="store_true",
        help=f"Delete ONLY rows whose character_name starts with {PREFIX!r}. Requires --mode db: "
             "the bot API's DELETE /api/roster/character refuses (409) to delete a character that "
             "already has claims/spends attached, which every character this script creates will have.",
    )
    parser.add_argument("--api-base-url", default=None,
                         help=f"Override the target for --mode api (default: {DEFAULT_API_BASE_URL}, "
                              "or API_BASE_URL / WEB_APP_BASE_URL from env/apps/web/.env).")
    parser.add_argument("--sleep-seconds", type=float, default=DEFAULT_SLEEP_SECONDS,
                         help=f"Seconds to sleep between write calls in --mode api, to stay under the "
                              f"20/min limit on /api/claims and /api/spends. Default: {DEFAULT_SLEEP_SECONDS}.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.cleanup and args.mode != "db":
        print("ERROR: --cleanup requires --mode db (see --help for why).", file=sys.stderr)
        sys.exit(2)

    rng = random.Random(args.seed)

    if not args.yes:
        print("DRY RUN — no data will be written. Pass --yes to actually run.\n")
        print(f"Prefix for all synthetic records: {PREFIX!r}")
        print(f"Mode: {args.mode}")
        if args.cleanup:
            print(f"Would DELETE all characters/xp_claims/spend_requests rows with character_name "
                  f"starting {PREFIX!r} from the target database.")
        else:
            print(f"Would create {args.characters} characters, up to {args.claims} XP claims, "
                  f"and {args.spends} spend requests.")
            if args.mode == "api":
                print(f"Would POST to {args.api_base_url or DEFAULT_API_BASE_URL} "
                      f"(paced {args.sleep_seconds}s between /api/claims and /api/spends calls).")
            else:
                print("Would write directly to the Turso database configured via DATABASE_URL.")
        print("\n(Dry run does not read credentials or contact any target — nothing above was verified.)")
        return

    creds = resolve_credentials()

    # Network/protocol failures are reported as a clean one-line error rather
    # than a raw traceback — this is an ops tool, not a library.
    try:
        if args.cleanup:
            cleanup_db(creds)
            return

        if args.mode == "api":
            run_api(args, creds, rng)
        else:
            run_db(args, creds, rng)
    except (RuntimeError, urllib.error.URLError, OSError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
