"""Staff-facing reports — engagement and roster breakdowns."""

from __future__ import annotations

from collections import defaultdict

from flask import Blueprint, render_template

from app.auth import require_staff
from app.db import DbCharacter, DbPlayPeriod, DbSpendRequest, DbXPClaim, DiscordPostCount

bp = Blueprint('reports', __name__)


@bp.route('/reports')
@require_staff
def index():
    # ── Last 2 IC nights ──────────────────────────────────────────────────
    recent_periods = (
        DbPlayPeriod.query
        .order_by(DbPlayPeriod.night_number.desc())
        .limit(2)
        .all()
    )

    period_labels = []
    engaged_chars = []

    if recent_periods:
        period_labels = [p.period_label for p in recent_periods]

        # Earliest start_date across both periods → cutoff for spend requests.
        # DbSpendRequest.timestamp is "YYYYMMDD HH:MM:SS"; start_date is "YYYY-MM-DD".
        start_dates = [p.start_date for p in recent_periods if p.start_date]
        ts_cutoff = (min(start_dates).replace('-', '') + ' 00:00:00') if start_dates else ''

        xp_rows = (
            DbXPClaim.query
            .filter(DbXPClaim.play_period.in_(period_labels))
            .with_entities(DbXPClaim.character_name)
            .distinct()
            .all()
        )
        engaged_names = {r.character_name for r in xp_rows}

        if ts_cutoff:
            spend_rows = (
                DbSpendRequest.query
                .filter(DbSpendRequest.timestamp >= ts_cutoff)
                .with_entities(DbSpendRequest.character_name)
                .distinct()
                .all()
            )
            engaged_names |= {r.character_name for r in spend_rows}

        engaged_chars = (
            DbCharacter.query
            .filter(
                DbCharacter.character_name.in_(engaged_names),
                DbCharacter.active == True,  # noqa: E712
            )
            .order_by(DbCharacter.character_name)
            .all()
        )

    # ── Roster breakdowns ─────────────────────────────────────────────────
    all_roster = DbCharacter.query.order_by(DbCharacter.character_name).all()

    def _breakdown(key_fn):
        totals: dict[str, int] = defaultdict(int)
        actives: dict[str, int] = defaultdict(int)
        for c in all_roster:
            k = key_fn(c) or '(unknown)'
            totals[k] += 1
            if c.active:
                actives[k] += 1
        return sorted(
            [{'label': k, 'active': actives[k], 'total': totals[k]} for k in totals],
            key=lambda r: -r['total'],
        )

    by_clan = _breakdown(lambda c: c.clan)
    by_age = _breakdown(lambda c: c.age_category)
    by_sect = _breakdown(lambda c: c.sect)

    total_active = sum(1 for c in all_roster if c.active)

    roster_list = [
        {
            'name': c.character_name,
            'clan': c.clan or '',
            'age': c.age_category or '',
            'sect': c.sect or '',
            'player': c.player_discord_name or c.player_discord or '',
            'active': c.active,
        }
        for c in all_roster
    ]

    # ── Discord activity ───────────────────────────────────────────────────
    discord_activity = []
    if recent_periods:
        end_dates = [p.end_date for p in recent_periods if p.end_date]
        act_since = min(start_dates) if start_dates else ''
        act_until = max(end_dates) if end_dates else ''

        act_q = DiscordPostCount.query
        if act_since:
            act_q = act_q.filter(DiscordPostCount.date >= act_since)
        if act_until:
            act_q = act_q.filter(DiscordPostCount.date <= act_until)
        act_rows = act_q.all()

        act_map: dict[str, dict[str, int]] = {}
        for row in act_rows:
            entry = act_map.setdefault(row.discord_id, {'ic': 0, 'ooc': 0, 'rolls': 0, 'cubby': 0})
            entry[row.category] = entry.get(row.category, 0) + row.count

        discord_activity = sorted(
            [
                {
                    'discord_id': did,
                    'ic': counts['ic'],
                    'ooc': counts['ooc'],
                    'rolls': counts['rolls'],
                    'cubby': counts['cubby'],
                    'total': counts['ic'] + counts['ooc'] + counts['rolls'] + counts['cubby'],
                }
                for did, counts in act_map.items()
            ],
            key=lambda r: -r['total'],
        )

    return render_template(
        'reports.html',
        recent_periods=recent_periods,
        period_labels=period_labels,
        engaged_chars=engaged_chars,
        by_clan=by_clan,
        by_age=by_age,
        by_sect=by_sect,
        total_active=total_active,
        total_all=len(all_roster),
        roster_list=roster_list,
        discord_activity=discord_activity,
    )
