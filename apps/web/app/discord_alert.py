"""Discord webhook alerting for recurring app errors.

Stays quiet below ESCALATION_THRESHOLD occurrences of the same specific
issue (same dedupe_key) within ESCALATION_WINDOW_HOURS — every warn/error
is still persisted to AppLogEntry (visible to any staff on /audit/errors)
so nothing is lost, but a one-off or self-correcting blip you already
recognize doesn't alarm other staff who don't. Only once a dedupe_key
crosses the threshold does a single Discord alert fire, and it re-fires
every subsequent ESCALATION_THRESHOLD occurrences (10, 15, ...) so an
ongoing pattern stays visible without paging per-occurrence.

Deliberately NOT wired into the fire-and-forget Sheets sync retry path —
those failures are covered by the nightly reconciliation job and paging
someone for something that fixes itself overnight is just noise.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse

import requests

logger = logging.getLogger(__name__)

# A recurring thing (same dedupe_key) doesn't page anyone until it crosses
# this many occurrences within this window.
ESCALATION_THRESHOLD = 5
ESCALATION_WINDOW_HOURS = 24


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


def send_escalation_alert(webhook_url: str, dedupe_key: str, count: int, message: str,
                           details: str = '', link: str = '') -> None:
    """Best-effort Discord webhook post flagging a recurring issue. Never raises.

    This is the only alert path — nothing posts below ESCALATION_THRESHOLD,
    so by the time this fires it's an established pattern, not a blip.
    """
    if not webhook_url:
        return
    try:
        content = (
            f'⚠️ **Recurring issue** — `{dedupe_key}` has happened '
            f'**{count} times** in the last {ESCALATION_WINDOW_HOURS}h.\n'
            f'Most recent: {message[:500]}'
        )
        if details.strip():
            content += f'\n```\n{details.strip()[:500]}\n```'
        if link:
            content += f'\n🔗 <{link}>'
        requests.post(webhook_url, json={'content': content[:2000]}, timeout=5)
    except Exception as exc:
        logger.warning('discord_escalation_alert_failed: %s', exc)
