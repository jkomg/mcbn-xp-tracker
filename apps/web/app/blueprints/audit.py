"""Audit log and error alert viewing routes."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

from flask import Blueprint, render_template, request, jsonify, current_app
from app import db_service
from app.sheets_sync import get_recent_sync_errors as _get_recent_sync_errors
from app.auth import require_staff

bp = Blueprint('audit', __name__)

_EASTERN = ZoneInfo('America/New_York')

def _default_log_dir() -> Path:
    _parents = Path(__file__).resolve().parents
    project_root = _parents[min(4, len(_parents) - 1)]
    return project_root / '.run' / 'logs'

LOG_DIR = Path(os.environ['WEB_LOG_DIR']) if os.environ.get('WEB_LOG_DIR') else _default_log_dir()
ERROR_LOG_FILES = ('bot.err.log', 'web.err.log')


@bp.route('/')
@require_staff
def log():
    """View the audit log. Filtering happens client-side over the fetched page."""
    entries = db_service.get_audit_log(limit=500)

    action_types = sorted(set(e.action_type for e in entries if e.action_type))
    staff_users = sorted(set(e.staff_user for e in entries if e.staff_user))

    return render_template(
        'audit/log.html',
        entries=entries,
        action_types=action_types,
        staff_users=staff_users,
    )


def _tail_lines(path: Path, max_lines: int) -> list[str]:
    if not path.exists() or not path.is_file():
        return []
    with path.open('r', encoding='utf-8', errors='replace') as fh:
        lines = fh.readlines()
    return [line.rstrip('\n') for line in lines[-max_lines:]]


def _extract_message(payload: dict) -> str:
    if payload.get('error'):
        return str(payload.get('error'))
    if payload.get('reason'):
        return str(payload.get('reason'))
    if payload.get('message'):
        return str(payload.get('message'))
    return ''


def _parse_error_entries(filename: str, lines: list[str]) -> list[dict]:
    entries: list[dict] = []
    for i, line in enumerate(lines):
        text = line.strip()
        if not text:
            continue
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            entries.append({
                'timestamp': '',
                'timestamp_sort': '',
                'source': filename,
                'level': 'error',
                'event': 'raw_log',
                'message': text,
                'details': '',
                'raw_index': i,
            })
            continue

        if not isinstance(raw, dict):
            continue
        level = str(raw.get('level', '')).lower()
        if level not in {'warn', 'error'}:
            continue
        ts = str(raw.get('ts', '')).strip()
        message = _extract_message(raw)
        context = {k: v for k, v in raw.items() if k not in {'ts', 'level', 'event'}}
        details = json.dumps(context, ensure_ascii=False, sort_keys=True)
        entries.append({
            'timestamp': ts,
            'timestamp_sort': ts,
            'source': filename,
            'level': level,
            'event': str(raw.get('event', 'unknown')),
            'message': message,
            'details': details,
            'raw_index': i,
        })
    return entries


@bp.route('/errors/<int:entry_id>/dismiss', methods=['POST'])
@require_staff
def dismiss_error(entry_id: int):
    from app.db import AppLogEntry, db
    entry = AppLogEntry.query.get_or_404(entry_id)
    entry.dismissed = True
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/errors/bulk-dismiss', methods=['POST'])
@require_staff
def bulk_dismiss_errors():
    """Dismiss many error entries at once (checkbox selection on /audit/errors)."""
    from app.db import AppLogEntry, db
    body = request.get_json(silent=True) or {}
    raw_ids = body.get('ids')
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({'error': 'ids must be a non-empty array'}), 400
    try:
        entry_ids = [int(i) for i in raw_ids]
    except (TypeError, ValueError):
        return jsonify({'error': 'ids must be integers'}), 400
    updated = (
        AppLogEntry.query
        .filter(AppLogEntry.id.in_(entry_ids))
        .update({'dismissed': True}, synchronize_session=False)
    )
    db.session.commit()
    return jsonify({'ok': True, 'count': updated})


@bp.route('/errors/sync/<int:entry_id>/dismiss', methods=['POST'])
@require_staff
def dismiss_sync_error(entry_id: int):
    from app.db import DbSheetsSyncError, db
    entry = DbSheetsSyncError.query.get_or_404(entry_id)
    entry.dismissed = True
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/errors/sync/bulk-dismiss', methods=['POST'])
@require_staff
def bulk_dismiss_sync_errors():
    """Dismiss many Sheets sync error entries at once (checkbox selection on /audit/errors)."""
    from app.db import DbSheetsSyncError, db
    body = request.get_json(silent=True) or {}
    raw_ids = body.get('ids')
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({'error': 'ids must be a non-empty array'}), 400
    try:
        entry_ids = [int(i) for i in raw_ids]
    except (TypeError, ValueError):
        return jsonify({'error': 'ids must be integers'}), 400
    updated = (
        DbSheetsSyncError.query
        .filter(DbSheetsSyncError.id.in_(entry_ids))
        .update({'dismissed': True}, synchronize_session=False)
    )
    db.session.commit()
    return jsonify({'ok': True, 'count': updated})


@bp.route('/errors')
@require_staff
def errors():
    """View warning/error alerts from the DB-persisted log."""
    from app.db import AppLogEntry
    source_filter = request.args.get('source', '').strip()
    level_filter = request.args.get('level', '').strip().lower()
    event_filter = request.args.get('event', '').strip().lower()

    show_dismissed = request.args.get('show_dismissed', '').lower() in ('1', 'true', 'yes')

    query = AppLogEntry.query.order_by(AppLogEntry.created_at.desc())
    if not show_dismissed:
        query = query.filter(AppLogEntry.dismissed == False)  # noqa: E712
    if source_filter in ('bot', 'web'):
        query = query.filter(AppLogEntry.source == source_filter)
    if level_filter in ('warn', 'error'):
        query = query.filter(AppLogEntry.level == level_filter)
    if event_filter:
        query = query.filter(AppLogEntry.event.ilike(f'%{event_filter}%'))
    db_entries = query.limit(200).all()

    # Occurrence tracking: group by dedupe_key (the same grouping key used
    # for Discord escalation, see discord_alert.py) rather than adding a new
    # column. First/last-seen and 24h count come from a GROUP BY over ALL
    # rows sharing a key, not just the currently-filtered page, so the count
    # reflects the issue's real history even if older occurrences were
    # dismissed or filtered out.
    from sqlalchemy import func
    from app.db import db as _db

    occurrence_rows = (
        _db.session.query(
            AppLogEntry.dedupe_key,
            func.count(AppLogEntry.id),
            func.min(AppLogEntry.created_at),
            func.max(AppLogEntry.created_at),
        )
        .filter(AppLogEntry.dedupe_key != '')
        .group_by(AppLogEntry.dedupe_key)
        .all()
    )
    occurrence_by_key = {key: (count, first, last) for key, count, first, last in occurrence_rows}

    cutoff_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    count_24h_by_key = dict(
        _db.session.query(AppLogEntry.dedupe_key, func.count(AppLogEntry.id))
        .filter(AppLogEntry.dedupe_key != '', AppLogEntry.created_at >= cutoff_24h)
        .group_by(AppLogEntry.dedupe_key)
        .all()
    )

    project_id = current_app.config.get('GCP_PROJECT_ID', '')

    entries = []
    for e in db_entries:
        occ = occurrence_by_key.get(e.dedupe_key)
        occurrence_count, first_seen, last_seen = occ if occ else (1, e.created_at, e.created_at)
        cloud_logs_link = ''
        if project_id:
            query_parts = ['resource.type="cloud_run_revision"', f'jsonPayload.event="{e.event}"']
            log_query = '\n'.join(query_parts)
            window_start = (first_seen or e.created_at).strftime('%Y-%m-%dT%H:%M:%SZ')
            window_end = ((last_seen or e.created_at) + timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
            cloud_logs_link = (
                'https://console.cloud.google.com/logs/query;query='
                + quote(log_query)
                + f';timeRange={window_start}%2F{window_end}'
                + f'?project={project_id}'
            )
        entries.append({
            'id': e.id,
            'timestamp': e.ts,
            'source': e.source,
            'level': e.level,
            'event': e.event,
            'message': e.message,
            'details': e.details,
            'dismissed': e.dismissed,
            'occurrence_count': occurrence_count,
            'first_seen': first_seen.isoformat() if first_seen else '',
            'last_seen': last_seen.isoformat() if last_seen else '',
            'occurrence_24h': count_24h_by_key.get(e.dedupe_key, 1),
            'cloud_logs_link': cloud_logs_link,
        })

    event_counts: dict[str, int] = {}
    for e in entries:
        event_counts[e['event']] = event_counts.get(e['event'], 0) + 1

    # Merge in-memory (real-time, current session — never dismissable, since
    # it's cleared on process restart anyway) and DB (historical, dismissable)
    # sync errors. show_dismissed also governs the DB-backed ones here so
    # there's a single toggle for the whole page.
    rt_errors = _get_recent_sync_errors()
    db_sync_errors = db_service.get_recent_sync_errors(limit=100, show_dismissed=show_dismissed)
    db_keys = {(e['timestamp'], e['operation'], e['error']) for e in db_sync_errors}
    rt_only = [e for e in rt_errors
               if (e['timestamp'], e['operation'], e['error']) not in db_keys]
    sync_errors = rt_only + db_sync_errors

    return render_template(
        'audit/errors.html',
        now=datetime.now(timezone.utc).astimezone(_EASTERN).strftime('%Y-%m-%d %H:%M %Z'),
        entries=entries,
        event_counts=sorted(event_counts.items(), key=lambda item: item[1], reverse=True)[:15],
        source_filter=source_filter,
        level_filter=level_filter,
        event_filter=event_filter,
        show_dismissed=show_dismissed,
        sync_errors=sync_errors,
    )
