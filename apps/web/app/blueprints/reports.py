"""Staff-facing reports — engagement and roster breakdowns."""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, flash, redirect, render_template, request, session, url_for

from app.activity_health import build_health_report, build_new_characters_report, shift_window
from app.auth import require_staff
from app.db import (
    DbCharacter,
    DbPlayPeriod,
    DbSpendRequest,
    DbXPClaim,
    DiscordDisplayName,
    DiscordPostCount,
    RetirementAutomationJob,
    db,
)
from app.retirement_automation import retirement_next_retry_at

bp = Blueprint('reports', __name__)


def _iso_date(d: str) -> str:
    """Normalize YYYYMMDD or YYYY-MM-DD to YYYY-MM-DD."""
    d = d.strip()
    if len(d) == 8 and d.isdigit():
        return f'{d[:4]}-{d[4:6]}-{d[6:]}'
    return d


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
        act_since = _iso_date(min(start_dates)) if start_dates else ''
        act_until = _iso_date(max(end_dates)) if end_dates else ''

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

        # Pull stored display names for everyone who posted
        name_rows = DiscordDisplayName.query.filter(
            DiscordDisplayName.discord_id.in_(list(act_map.keys()))
        ).all()
        display_names = {r.discord_id: r.display_name for r in name_rows}

        discord_activity = sorted(
            [
                {
                    'discord_id': did,
                    'display_name': display_names.get(did, ''),
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

    retirement_jobs = (
        RetirementAutomationJob.query
        .order_by(RetirementAutomationJob.requested_at.desc(), RetirementAutomationJob.id.desc())
        .limit(25)
        .all()
    )
    retirement_summary = {
        'pending_discord': sum(1 for row in retirement_jobs if row.discord_completed_at is None),
        'pending_wiki': sum(1 for row in retirement_jobs if row.discord_completed_at is not None and row.wiki_synced_at is None),
        'errored': sum(1 for row in retirement_jobs if (row.last_error or '').strip()),
        'backoff': sum(1 for row in retirement_jobs if retirement_next_retry_at(row) is not None),
    }

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
        retirement_jobs=retirement_jobs,
        retirement_summary=retirement_summary,
        retirement_next_retry_at=retirement_next_retry_at,
    )


@bp.route('/reports/retirement-jobs/<int:job_id>/resolve', methods=['POST'])
@require_staff
def resolve_retirement_job(job_id: int):
    row = db.session.get(RetirementAutomationJob, job_id)
    if not row:
        flash('Retirement automation job not found.', 'warning')
        return redirect(url_for('reports.index'))

    now = datetime.now(timezone.utc)
    row.last_attempt_at = now
    row.discord_completed_at = row.discord_completed_at or now
    row.cubby_moved_at = row.cubby_moved_at or now
    row.children_moved_at = row.children_moved_at or now
    row.wiki_synced_at = row.wiki_synced_at or now
    row.last_error = ''
    db.session.commit()

    resolved_by = (
        session.get('discord_name')
        or session.get('staff_user')
        or session.get('discord_id', 'unknown')
    )
    flash(f'Retirement job for {row.character_name} marked manually resolved by {resolved_by}.', 'success')
    return redirect(url_for('reports.index'))


@bp.route('/reports/activity.csv')
@require_staff
def activity_csv():
    """Export discord_post_counts as a CSV, pivoted by date × user."""
    since = request.args.get('since', '').strip()
    until = request.args.get('until', '').strip()

    q = DiscordPostCount.query
    if since:
        q = q.filter(DiscordPostCount.date >= since)
    if until:
        q = q.filter(DiscordPostCount.date <= until)
    rows = q.order_by(DiscordPostCount.date, DiscordPostCount.discord_id).all()

    # Build display name lookup
    discord_ids = list({r.discord_id for r in rows})
    name_rows = DiscordDisplayName.query.filter(
        DiscordDisplayName.discord_id.in_(discord_ids)
    ).all()
    display_names = {r.discord_id: r.display_name for r in name_rows}

    # Pivot: (discord_id, date) → {ic, ooc, rolls, cubby}
    pivot: dict[tuple[str, str], dict[str, int]] = {}
    for row in rows:
        key = (row.discord_id, row.date)
        entry = pivot.setdefault(key, {'ic': 0, 'ooc': 0, 'rolls': 0, 'cubby': 0})
        entry[row.category] = entry.get(row.category, 0) + row.count

    def _csv_safe(val: str) -> str:
        """Prevent CSV formula injection by prefixing dangerous leading chars."""
        if val and val[0] in ('=', '+', '-', '@', '\t', '\r'):
            return "'" + val
        return val

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['date', 'discord_id', 'display_name', 'ic', 'ooc', 'rolls', 'cubby', 'total'])
    for (discord_id, date), counts in sorted(pivot.items()):
        writer.writerow([
            date,
            discord_id,
            _csv_safe(display_names.get(discord_id, '')),
            counts['ic'],
            counts['ooc'],
            counts['rolls'],
            counts['cubby'],
            counts['ic'] + counts['ooc'] + counts['rolls'] + counts['cubby'],
        ])

    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename="discord_activity.csv"'},
    )


HEALTH_RANGE_OPTIONS = (30, 60, 90)


@bp.route('/reports/health')
@require_staff
def health():
    """Server-health dashboard: posting trend, participation, and a
    "who hasn't posted" list over a rolling 30/60/90-day window."""
    try:
        range_days = int(request.args.get('range', 30))
    except (TypeError, ValueError):
        range_days = 30
    if range_days not in HEALTH_RANGE_OPTIONS:
        range_days = 30

    earliest_row = (
        DiscordPostCount.query.order_by(DiscordPostCount.date.asc()).first()
    )
    earliest_date = earliest_row.date if earliest_row else None

    end = datetime.now(timezone.utc).date().isoformat()
    requested_start = (
        datetime.strptime(end, '%Y-%m-%d').date() - timedelta(days=range_days - 1)
    ).isoformat()
    start = max(requested_start, earliest_date) if earliest_date else requested_start
    data_capped = bool(earliest_date) and requested_start < earliest_date

    prev_start, prev_end = shift_window(start, end)

    def _rows_for(since: str, until: str) -> list[dict]:
        if since > until:
            return []
        q = DiscordPostCount.query.filter(
            DiscordPostCount.date >= since,
            DiscordPostCount.date <= until,
        )
        return [
            {'discord_id': r.discord_id, 'date': r.date, 'category': r.category, 'count': r.count}
            for r in q.all()
        ]

    rows = _rows_for(start, end)
    # Only compare against a *full* prior period — if the natural previous
    # window would dip before the earliest tracked date, there's no fair
    # same-length baseline to compare against, so skip it entirely rather
    # than silently comparing against a truncated (shorter) window, which
    # can read as a misleading spike or drop.
    prev_rows = [] if (earliest_date and prev_start < earliest_date) else _rows_for(prev_start, prev_end)

    discord_ids = {r['discord_id'] for r in rows} | {r['discord_id'] for r in prev_rows}
    name_rows = DiscordDisplayName.query.filter(DiscordDisplayName.discord_id.in_(discord_ids)).all()
    display_names = {r.discord_id: r.display_name for r in name_rows}

    active_characters = [
        {
            'character_name': c.character_name,
            'player_discord': c.player_discord,
            'player_discord_name': c.player_discord_name,
        }
        for c in DbCharacter.query.filter_by(active=True).all()
    ]

    report = build_health_report(rows, prev_rows, active_characters, display_names, start, end)

    # ── New PCs approved. date_added has two formats in the wild, parsed
    # rather than string-compared against the '%Y-%m-%d' window bounds (a
    # raw string comparison between mismatched formats silently breaks, as
    # it already has elsewhere in this codebase):
    #   - 'YYYYMMDD HH:MM:SS' — every live approval path (db_service.py's
    #     _now_str() fallback in add_character).
    #   - 'YYYY-MM-DD' — rows created by the one-time CSV migration
    #     (migrate_csv_to_sheets.py), which predates the live approval flow.
    # ─────────────────────────────────────────────────────────────────────
    def _parse_date_added(raw: str):
        if not raw:
            return None
        raw = raw.strip()
        for fmt in ('%Y%m%d %H:%M:%S', '%Y-%m-%d'):
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None

    all_chars_dated = [
        (c, parsed) for c in DbCharacter.query.all()
        if (parsed := _parse_date_added(c.date_added)) is not None
    ]
    earliest_char_date = min((d for _, d in all_chars_dated), default=None)
    earliest_char_date_str = earliest_char_date.isoformat() if earliest_char_date else None

    start_d = datetime.strptime(start, '%Y-%m-%d').date()
    end_d = datetime.strptime(end, '%Y-%m-%d').date()
    prev_start_d = datetime.strptime(prev_start, '%Y-%m-%d').date()
    prev_end_d = datetime.strptime(prev_end, '%Y-%m-%d').date()

    def _char_dict(c, d):
        return {
            'character_name': c.character_name,
            'clan': c.clan or '',
            'sect': c.sect or '',
            'age_category': c.age_category or '',
            'date_added': d.isoformat(),
        }

    new_chars_current = [_char_dict(c, d) for c, d in all_chars_dated if start_d <= d <= end_d]
    new_chars_prev = (
        []
        if (earliest_char_date and prev_start_d < earliest_char_date)
        else [_char_dict(c, d) for c, d in all_chars_dated if prev_start_d <= d <= prev_end_d]
    )
    new_characters_report = build_new_characters_report(new_chars_current, new_chars_prev)

    return render_template(
        'reports/health.html',
        report=report,
        new_characters=new_characters_report,
        earliest_char_date=earliest_char_date_str,
        range_days=range_days,
        range_options=HEALTH_RANGE_OPTIONS,
        start=start,
        end=end,
        data_capped=data_capped,
        earliest_data_date=earliest_date,
    )
