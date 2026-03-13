"""Local-only diagnostics page for service/runtime visibility."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

from flask import Blueprint, abort, current_app, render_template, request

from app.auth import require_staff

bp = Blueprint('local_status', __name__)

_parents = Path(__file__).resolve().parents
PROJECT_ROOT = _parents[min(4, len(_parents) - 1)]


def _is_local_request() -> bool:
    remote_addr = request.remote_addr or ''
    if remote_addr in {'127.0.0.1', '::1'} or remote_addr.startswith('::ffff:127.0.0.1'):
        return True
    # Allow Docker bridge gateway (172.16.0.0/12) when running in a container
    parts = remote_addr.split('.')
    if len(parts) == 4:
        try:
            first, second = int(parts[0]), int(parts[1])
            if first == 172 and 16 <= second <= 31:
                return True
        except ValueError:
            pass
    return False


def _tail_lines(path: Path, max_lines: int) -> list[str]:
    if not path.exists() or not path.is_file():
        return []
    with path.open('r', encoding='utf-8', errors='replace') as fh:
        lines = fh.readlines()
    return [line.rstrip('\n') for line in lines[-max_lines:]]


def _launchd_status(label: str) -> dict:
    target = f'gui/{os.getuid()}/{label}'
    try:
        result = subprocess.run(
            ['launchctl', 'print', target],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except Exception as exc:
        return {
            'label': label,
            'loaded': False,
            'pid': '',
            'detail': f'launchctl unavailable: {exc}',
        }

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip()
        return {
            'label': label,
            'loaded': False,
            'pid': '',
            'detail': detail or 'not loaded',
        }

    output = result.stdout
    pid_match = re.search(r'^\s*pid = (\d+);', output, re.MULTILINE)
    state_match = re.search(r'^\s*state = (\w+)', output, re.MULTILINE)
    return {
        'label': label,
        'loaded': True,
        'pid': pid_match.group(1) if pid_match else '',
        'detail': state_match.group(1) if state_match else 'loaded',
    }


@bp.route('/local/status')
@require_staff
def status_page():
    if not current_app.config.get('LOCAL_STATUS_ENABLED', False):
        abort(404)
    if not _is_local_request():
        abort(404)

    max_lines = int(current_app.config.get('LOCAL_STATUS_LOG_LINES', 120))
    logs_dir = PROJECT_ROOT / '.run' / 'logs'
    access_log_path = PROJECT_ROOT / current_app.config.get(
        'LOCAL_STATUS_ACCESS_LOG_FILE',
        '.run/logs/access.log',
    )
    if not access_log_path.is_absolute():
        access_log_path = PROJECT_ROOT / access_log_path

    services = [
        _launchd_status('us.mcbn.web-dev'),
        _launchd_status('us.mcbn.tracker-bot'),
    ]
    log_files = [
        'web.out.log',
        'web.err.log',
        'bot.out.log',
        'bot.err.log',
    ]

    logs = []
    for filename in log_files:
        path = logs_dir / filename
        logs.append({
            'name': filename,
            'path': str(path),
            'lines': _tail_lines(path, max_lines),
        })

    return render_template(
        'local/status.html',
        now=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        services=services,
        logs=logs,
        access_log_path=str(access_log_path),
        access_log_lines=_tail_lines(access_log_path, max_lines),
        max_lines=max_lines,
    )
