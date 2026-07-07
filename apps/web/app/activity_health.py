"""Server-health activity report: aggregates DiscordPostCount rows into the
daily trend series, top-poster leaderboard, and participation stats behind
the /reports/health dashboard.

Pure functions on plain dicts/lists — no Flask/DB imports — so the
aggregation logic is unit-testable without a database fixture.
"""

from __future__ import annotations

from datetime import datetime, timedelta

CATEGORIES = ('ic', 'ooc', 'rolls', 'cubby')


def daterange(start: str, end: str) -> list[str]:
    """Inclusive list of YYYY-MM-DD strings from start to end."""
    start_d = datetime.strptime(start, '%Y-%m-%d').date()
    end_d = datetime.strptime(end, '%Y-%m-%d').date()
    days = (end_d - start_d).days
    return [(start_d + timedelta(days=i)).isoformat() for i in range(days + 1)]


def shift_window(start: str, end: str) -> tuple[str, str]:
    """Return the immediately-preceding window of the same length."""
    start_d = datetime.strptime(start, '%Y-%m-%d').date()
    end_d = datetime.strptime(end, '%Y-%m-%d').date()
    length = (end_d - start_d).days + 1
    prev_end = start_d - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    return prev_start.isoformat(), prev_end.isoformat()


def build_health_report(
    rows: list[dict],
    prev_rows: list[dict],
    active_characters: list[dict],
    display_names: dict[str, str],
    start: str,
    end: str,
) -> dict:
    """rows/prev_rows: [{'discord_id','date','category','count'}, ...]
    active_characters: [{'character_name','player_discord'}, ...] — active roster.
    """
    days = daterange(start, end)

    # ── Daily series (zero-filled for continuous chart axes) ──────────────
    daily_by_cat: dict[str, dict[str, int]] = {d: {c: 0 for c in CATEGORIES} for d in days}
    daily_posters: dict[str, set[str]] = {d: set() for d in days}
    per_user_total: dict[str, int] = {}
    posted_discord_ids: set[str] = set()

    for row in rows:
        date, cat, discord_id, count = row['date'], row['category'], row['discord_id'], row['count']
        if date not in daily_by_cat or cat not in CATEGORIES or count <= 0:
            continue
        daily_by_cat[date][cat] += count
        daily_posters[date].add(discord_id)
        per_user_total[discord_id] = per_user_total.get(discord_id, 0) + count
        posted_discord_ids.add(discord_id)

    daily_totals = [sum(daily_by_cat[d].values()) for d in days]
    daily_unique_posters = [len(daily_posters[d]) for d in days]

    period_by_category = {c: sum(daily_by_cat[d][c] for d in days) for c in CATEGORIES}
    period_total = sum(period_by_category.values())

    prev_total = sum(r['count'] for r in prev_rows if r['category'] in CATEGORIES and r['count'] > 0)
    if prev_total > 0:
        delta_pct = round((period_total - prev_total) / prev_total * 100)
    elif period_total > 0:
        delta_pct = None  # no prior baseline to compare against
    else:
        delta_pct = 0

    leaderboard = sorted(
        (
            {'discord_id': did, 'display_name': display_names.get(did, ''), 'total': total}
            for did, total in per_user_total.items()
        ),
        key=lambda r: -r['total'],
    )

    # ── Participation: active players who did/didn't post in the window ───
    # Dedup by player, not by character — one player can own several active
    # characters, and posting once should count for all of them.
    active_by_player: dict[str, list[str]] = {}
    unlinked_characters: list[str] = []
    # Roster's own known name for a player — the only source available for
    # someone who's never posted, since display_names is only ever populated
    # from activity the bot has actually observed.
    roster_display_name: dict[str, str] = {}
    for char in active_characters:
        pid = (char.get('player_discord') or '').strip()
        if not pid:
            unlinked_characters.append(char['character_name'])
            continue
        active_by_player.setdefault(pid, []).append(char['character_name'])
        name = (char.get('player_discord_name') or '').strip()
        if name and pid not in roster_display_name:
            roster_display_name[pid] = name

    posted_player_ids = set(active_by_player) & posted_discord_ids
    not_posted_player_ids = set(active_by_player) - posted_discord_ids

    participation_pct = (
        round(len(posted_player_ids) / len(active_by_player) * 100)
        if active_by_player else 0
    )

    not_posting = sorted(
        (
            {
                'discord_id': pid,
                'display_name': display_names.get(pid) or roster_display_name.get(pid, ''),
                'characters': sorted(active_by_player[pid]),
            }
            for pid in not_posted_player_ids
        ),
        key=lambda r: r['characters'][0].lower() if r['characters'] else '',
    )

    return {
        'days': days,
        'daily_totals': daily_totals,
        'daily_unique_posters': daily_unique_posters,
        'daily_by_category': {c: [daily_by_cat[d][c] for d in days] for c in CATEGORIES},
        'period_total': period_total,
        'period_by_category': period_by_category,
        'delta_pct': delta_pct,
        'unique_posters': len(posted_discord_ids),
        'leaderboard': leaderboard[:15],
        'active_player_count': len(active_by_player),
        'posted_player_count': len(posted_player_ids),
        'participation_pct': participation_pct,
        'not_posting': not_posting,
        'unlinked_character_count': len(unlinked_characters),
    }


def build_new_characters_report(characters: list[dict], prev_characters: list[dict]) -> dict:
    """characters/prev_characters: [{'character_name', 'clan', 'sect',
    'age_category', 'date_added'}, ...] — already filtered by the caller to
    the current/prior windows respectively. date_added is only used for
    sort order here; the caller owns date parsing and windowing.
    """
    count = len(characters)
    prev_count = len(prev_characters)
    if prev_count > 0:
        delta_pct = round((count - prev_count) / prev_count * 100)
    elif count > 0:
        delta_pct = None  # no prior baseline to compare against
    else:
        delta_pct = 0

    return {
        'count': count,
        'delta_pct': delta_pct,
        'characters': sorted(characters, key=lambda c: c['date_added']),
    }
