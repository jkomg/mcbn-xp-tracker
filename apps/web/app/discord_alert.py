"""Discord webhook alerting for persistent app errors.

Fires a push notification to a staff Discord channel when a genuine error
is recorded in AppLogEntry (unhandled web exceptions, bot-reported errors).

Deliberately NOT wired into the fire-and-forget Sheets sync retry path —
those failures are covered by the nightly reconciliation job and paging
someone for something that fixes itself overnight is just noise.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse

import requests

logger = logging.getLogger(__name__)

# Avoid spamming the channel if the same thing errors repeatedly in a loop.
_RATE_LIMIT_SECONDS = 15 * 60
_last_sent: dict[str, float] = {}
_lock = threading.Lock()

# A single recurring thing (same dedupe_key) that crosses this many
# occurrences within this window gets a distinct "may not be
# self-correcting" escalation, on top of (not instead of) the normal
# rate-limited per-occurrence alert.
ESCALATION_THRESHOLD = 5
ESCALATION_WINDOW_HOURS = 24


def _should_send(event: str) -> bool:
    now = time.monotonic()
    with _lock:
        # time.monotonic() is only guaranteed non-decreasing, not guaranteed to
        # start far from zero — a fresh process/VM can have low uptime, so 0.0
        # as the "never sent" default can make a brand-new event look recent.
        last = _last_sent.get(event, float('-inf'))
        if now - last < _RATE_LIMIT_SECONDS:
            return False
        _last_sent[event] = now
        return True


def dashboard_link(redirect_uri: str, source: str, level: str, event: str) -> str:
    """Build a deep link into /audit/errors pre-filtered to this error's source/level/event.

    Derives the site's base URL from DISCORD_REDIRECT_URI (already configured
    per-environment for OAuth) instead of adding a separate base-URL setting.
    """
    if not redirect_uri:
        return ''
    parsed = urlparse(redirect_uri)
    if not parsed.scheme or not parsed.netloc:
        return ''
    base = f'{parsed.scheme}://{parsed.netloc}'
    query = f'source={quote(source)}&level={quote(level)}&event={quote(event)}'
    return f'{base}/audit/errors?{query}'


def send_alert(webhook_url: str, source: str, level: str, event: str, message: str,
                details: str = '', link: str = '', dedupe_key: str = '') -> None:
    """Best-effort Discord webhook post for a persistent app error. Never raises.

    Rate-limited per *dedupe_key* (default: source:event). Callers whose event
    name is constant across distinct failures (e.g. the web handler's
    'unhandled_exception') should pass a more specific dedupe_key — otherwise
    the first occurrence suppresses alerts for every later, unrelated one.
    """
    if not webhook_url:
        return
    if not _should_send(dedupe_key or f'{source}:{event}'):
        return
    try:
        emoji = '\U0001f534' if level == 'error' else '\U0001f7e1'  # red / yellow circle
        content = f'{emoji} **{source}** error — `{event}`\n{message[:800]}'
        if details.strip():
            content += f'\n```\n{details.strip()[:500]}\n```'
        if link:
            content += f'\n🔗 <{link}>'
        requests.post(webhook_url, json={'content': content[:2000]}, timeout=5)
    except Exception as exc:
        logger.warning('discord_alert_failed: %s', exc)


def check_escalation(dedupe_key: str) -> int | None:
    """Count AppLogEntry rows sharing *dedupe_key* within ESCALATION_WINDOW_HOURS.

    Returns the count if it just crossed a multiple of ESCALATION_THRESHOLD
    (5, 10, 15, ...), else None. Call this once per newly-inserted row, after
    it's committed, so each integer count is checked exactly once.

    Best-effort: returns None on any failure (e.g. the DB itself is the
    thing that's down) rather than raising into the caller's error handler.
    """
    if not dedupe_key:
        return None
    try:
        from .db import AppLogEntry
        cutoff = datetime.utcnow() - timedelta(hours=ESCALATION_WINDOW_HOURS)
        count = AppLogEntry.query.filter(
            AppLogEntry.dedupe_key == dedupe_key,
            AppLogEntry.created_at >= cutoff,
        ).count()
    except Exception as exc:
        logger.warning('escalation_check_failed: %s', exc)
        return None
    if count and count % ESCALATION_THRESHOLD == 0:
        return count
    return None


def send_escalation_alert(webhook_url: str, dedupe_key: str, count: int, message: str, link: str = '') -> None:
    """Best-effort Discord webhook post flagging a recurring issue. Never raises.

    Deliberately bypasses the normal rate limiter — check_escalation() above
    already only returns non-None at threshold multiples, so this can't fire
    more often than every ESCALATION_THRESHOLD occurrences.
    """
    if not webhook_url:
        return
    try:
        content = (
            f'⚠️ **Recurring issue** — `{dedupe_key}` has happened '
            f'**{count} times** in the last {ESCALATION_WINDOW_HOURS}h and may not be self-correcting.\n'
            f'Most recent: {message[:500]}'
        )
        if link:
            content += f'\n🔗 <{link}>'
        requests.post(webhook_url, json={'content': content[:2000]}, timeout=5)
    except Exception as exc:
        logger.warning('discord_escalation_alert_failed: %s', exc)
