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
from urllib.parse import quote, urlparse

import requests

logger = logging.getLogger(__name__)

# Avoid spamming the channel if the same thing errors repeatedly in a loop.
_RATE_LIMIT_SECONDS = 15 * 60
_last_sent: dict[str, float] = {}
_lock = threading.Lock()


def _should_send(event: str) -> bool:
    now = time.monotonic()
    with _lock:
        last = _last_sent.get(event, 0.0)
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
