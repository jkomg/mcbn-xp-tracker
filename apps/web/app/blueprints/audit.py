"""Audit log and error alert viewing routes."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from flask import Blueprint, render_template, request, jsonify
from app import db_service
from app.sheets_sync import get_recent_sync_errors as _get_recent_sync_errors
from app.auth import require_staff

bp = Blueprint('audit', __name__)

def _default_log_dir() -> Path:
    _parents = Path(__file__).resolve().parents
    project_root = _parents[min(4, len(_parents) - 1)]
    return project_root / '.run' / 'logs'

LOG_DIR = Path(os.environ['WEB_LOG_DIR']) if os.environ.get('WEB_LOG_DIR') else _default_log_dir()
ERROR_LOG_FILES = ('bot.err.log', 'web.err.log')


@bp.route('/')
@require_staff
def log():
    """View the audit log with optional filters."""
    action_filter = request.args.get('action', '')
    character_filter = request.args.get('character', '')
    staff_filter = request.args.get('staff', '')

    all_entries = db_service.get_audit_log(limit=500)
    entries = list(all_entries)

    if action_filter:
        entries = [e for e in entries
                   if e.action_type == action_filter]
    if character_filter:
        entries = [e for e in entries
                   if character_filter.lower() in e.target_character.lower()]
    if staff_filter:
        entries = [e for e in entries
                   if staff_filter.lower() in e.staff_user.lower()]

    # Collect unique values for filter dropdowns
    action_types = sorted(set(e.action_type for e in all_entries
                              if e.action_type))
    staff_users = sorted(set(e.staff_user for e in all_entries
                             if e.staff_user))

    return render_template(
        'audit/log.html',
        entries=entries,
        action_filter=action_filter,
        character_filter=character_filter,
        staff_filter=staff_filter,
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

    entries = [
        {
            'id': e.id,
            'timestamp': e.ts,
            'source': e.source,
            'level': e.level,
            'event': e.event,
            'message': e.message,
            'details': e.details,
            'dismissed': e.dismissed,
        }
        for e in db_entries
    ]

    event_counts: dict[str, int] = {}
    for e in entries:
        event_counts[e['event']] = event_counts.get(e['event'], 0) + 1

    # Merge in-memory (real-time, current session) and DB (historical) sync errors
    rt_errors = _get_recent_sync_errors()
    db_sync_errors = db_service.get_recent_sync_errors(limit=100)
    db_keys = {(e['timestamp'], e['operation'], e['error']) for e in db_sync_errors}
    rt_only = [e for e in rt_errors
               if (e['timestamp'], e['operation'], e['error']) not in db_keys]
    sync_errors = rt_only + db_sync_errors

    return render_template(
        'audit/errors.html',
        now=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        entries=entries,
        event_counts=sorted(event_counts.items(), key=lambda item: item[1], reverse=True)[:15],
        source_filter=source_filter,
        level_filter=level_filter,
        event_filter=event_filter,
        show_dismissed=show_dismissed,
        sync_errors=sync_errors,
    )
