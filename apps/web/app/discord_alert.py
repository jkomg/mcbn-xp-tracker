"""Discord webhook alerting for recurring app errors.

Stays quiet below ESCALATION_THRESHOLD occurrences of the same specific
issue (same dedupe_key) within ESCALATION_WINDOW_HOURS — every warn/error
is still persisted to AppLogEntry (visible to any staff on /audit/errors)
so nothing is lost, but a one-off or self-correcting blip you already
recognize doesn't alarm other staff who don't. Only once a dedupe_key
crosses the threshold does a single Discord alert fire, and it re-fires
every subsequent ESCALATION_THRESHOLD occurrences (10, 15, ...) so an
ongoing pattern stays visible without paging per-occurrence.

Bot-to-web network failures are the exception (see is_network_failure): they
page only when one stretch of them outlasts SUSTAINED_FAILURE_MINUTES, never on
a 24h count.

Deliberately NOT wired into the fire-and-forget Sheets sync retry path —
those failures are covered by the nightly reconciliation job and paging
someone for something that fixes itself overnight is just noise.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse

import requests

logger = logging.getLogger(__name__)

# A recurring thing (same dedupe_key) doesn't page anyone until it crosses
# this many occurrences within this window.
ESCALATION_THRESHOLD = 5
ESCALATION_WINDOW_HOURS = 24

# The bot reaching the web app at all -- DNS, connect, its own request timeout,
# Cloudflare 52x, a 502-504 -- fails in bursts of a few minutes whenever
# miniplex's network or Cloudflare blips, and recovers with nobody acting. A 24h
# count turned every such blip into a page (2026-10-28: one 2-minute LAN outage
# and a few Cloudflare 520s gave four "recurring issue" alerts). These page only
# when a single stretch of them, no gap longer than FAILURE_EPISODE_GAP_MINUTES,
# runs for SUSTAINED_FAILURE_MINUTES. A plain 500 is not here: that is the app's
# own bug and keeps the count rule.
FAILURE_EPISODE_GAP_MINUTES = 10
SUSTAINED_FAILURE_MINUTES = 15

_NETWORK_FAILURE_RE = re.compile(
    # undici's own "fetch failed", bare or as a wrapped cause -- not the bot's
    # "bot-config fetch failed: 500", which is an answer, and the app's bug.
    r'(?:^|\(|TypeError: )fetch failed(?!:?\s*\d)'
    r'|operation was aborted|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET'
    r'|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|other side closed|Connect Timeout'
    r'|socket hang up'
    r'|failed:? \(?(?:50[234]|52[0-6])\b',
    re.IGNORECASE,
)


def is_network_failure(message: str) -> bool:
    """True for a bot message saying it could not get an answer from the web app."""
    return bool(message) and bool(_NETWORK_FAILURE_RE.search(message))


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


def check_escalation(dedupe_key: str, new_occurrences: int = 1,
                     new_ids: set[int] | None = None) -> int | None:
    """Count AppLogEntry rows sharing *dedupe_key* within ESCALATION_WINDOW_HOURS.

    *new_occurrences* is how many of those rows this call is responsible for
    (default 1, for the common one-row-at-a-time callers). Batched callers
    that coalesce several new rows sharing a dedupe_key into a single check
    (e.g. /api/bot-log) must pass the real count — otherwise a batch that
    jumps the total past a threshold multiple without landing exactly on it
    (prior count 4 + 2 new rows = 6) would silently miss the alert forever,
    since 6 % 5 != 0.

    Returns the current total count if adding *new_occurrences* just crossed
    at least one multiple of ESCALATION_THRESHOLD, else None.

    *new_ids*, when given, are the ids of exactly the rows this call is
    responsible for, and override *new_occurrences*. The count then stops at
    the highest of them, so another request's rows for the same key landing
    after these (two gunicorn workers, two batches at once) can't make both
    calls see the same final count and both miss the crossing.

    Best-effort: returns None on any failure (e.g. the DB itself is the
    thing that's down) rather than raising into the caller's error handler.
    """
    if new_ids is not None:
        new_occurrences = len(new_ids)
    if not dedupe_key or new_occurrences <= 0:
        return None
    try:
        from .db import AppLogEntry
        cutoff = datetime.utcnow() - timedelta(hours=ESCALATION_WINDOW_HOURS)
        query = AppLogEntry.query.filter(
            AppLogEntry.dedupe_key == dedupe_key,
            AppLogEntry.created_at >= cutoff,
        )
        if new_ids:
            query = query.filter(AppLogEntry.id <= max(new_ids))
        count = query.count()
    except Exception as exc:
        logger.warning('escalation_check_failed: %s', exc)
        return None
    prior = max(count - new_occurrences, 0)
    if count // ESCALATION_THRESHOLD > prior // ESCALATION_THRESHOLD:
        return count
    return None


def _parse_ts(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _episode(times: list[datetime]) -> list[datetime]:
    """The latest run of *times* (sorted) with no gap over the episode gap."""
    gap = timedelta(minutes=FAILURE_EPISODE_GAP_MINUTES)
    start = len(times) - 1
    while start > 0 and times[start] - times[start - 1] <= gap:
        start -= 1
    return times[start:]


def _longest_run(times: list[datetime]) -> timedelta:
    """The longest span among the runs of *times* (sorted) split at long gaps."""
    gap = timedelta(minutes=FAILURE_EPISODE_GAP_MINUTES)
    longest = timedelta(0)
    run_start = 0
    for i in range(1, len(times) + 1):
        if i == len(times) or times[i] - times[i - 1] > gap:
            longest = max(longest, times[i - 1] - times[run_start])
            run_start = i
    return longest


def check_sustained(dedupe_key: str, new_occurrences: int = 1,
                    new_ids: set[int] | None = None) -> int | None:
    """Minutes the current failure stretch for *dedupe_key* has lasted, if the
    newest *new_occurrences* rows just carried it past SUSTAINED_FAILURE_MINUTES.

    Uses each row's own ts (when the bot saw the failure), not created_at: a bot
    that could not reach the web app sends its backlog in one batch once it can,
    and every row of it would otherwise share one receipt time. *new_ids* (as in
    check_escalation) names this call's rows; without it they are taken to be the
    newest *new_occurrences*.

    Fires once per stretch: the rows before this batch must not already have
    reached the threshold within the same stretch on their own. Judged on those
    rows alone, so a late batch that joins two short stretches into one long
    one still pages. Best-effort, like check_escalation.
    """
    if new_ids is not None:
        new_occurrences = len(new_ids)
    if not dedupe_key or new_occurrences <= 0:
        return None
    try:
        from .db import AppLogEntry
        cutoff = datetime.utcnow() - timedelta(hours=ESCALATION_WINDOW_HOURS)
        query = (
            AppLogEntry.query.with_entities(AppLogEntry.id, AppLogEntry.ts)
            .filter(AppLogEntry.dedupe_key == dedupe_key, AppLogEntry.created_at >= cutoff)
        )
        if new_ids:
            # As in check_escalation: judge the stretch as of this call's rows.
            query = query.filter(AppLogEntry.id <= max(new_ids))
        rows = query.order_by(AppLogEntry.id.asc()).all()
    except Exception as exc:
        logger.warning('sustained_check_failed: %s', exc)
        return None
    if not new_ids:
        new_ids = {row.id for row in rows[-new_occurrences:]}
    stamped = [(t, row.id) for row in rows if (t := _parse_ts(row.ts)) is not None]
    if not stamped:
        return None
    stamped.sort()
    episode = _episode([t for t, _ in stamped])
    start = episode[0]
    span = episode[-1] - start
    threshold = timedelta(minutes=SUSTAINED_FAILURE_MINUTES)
    if span < threshold:
        return None
    earlier = [t for t, row_id in stamped if row_id not in new_ids and t >= start]
    if earlier and _longest_run(sorted(earlier)) >= threshold:
        return None
    return int(span.total_seconds() // 60)


def send_sustained_alert(webhook_url: str, dedupe_key: str, minutes: int, message: str,
                         details: str = '', link: str = '') -> None:
    """Best-effort Discord post for a sustained bot-to-web failure. Never raises."""
    send_escalation_alert(
        webhook_url, dedupe_key, 0, message, details=details, link=link,
        headline=(
            f'🔌 **Sustained failure** — `{dedupe_key}` has been failing for '
            f'**{minutes} min** without recovering.'
        ),
    )


def send_escalation_alert(webhook_url: str, dedupe_key: str, count: int, message: str,
                           details: str = '', link: str = '', headline: str = '') -> None:
    """Best-effort Discord webhook post flagging a recurring issue. Never raises.

    Nothing posts below ESCALATION_THRESHOLD (or, for network failures, short
    of SUSTAINED_FAILURE_MINUTES), so by the time this fires it's an
    established pattern, not a blip. *headline* replaces the count line.
    """
    if not webhook_url:
        return
    try:
        headline = headline or (
            f'⚠️ **Recurring issue** — `{dedupe_key}` has happened '
            f'**{count} times** in the last {ESCALATION_WINDOW_HOURS}h.'
        )
        content = f'{headline}\nMost recent: {message[:500]}'
        if details.strip():
            content += f'\n```\n{details.strip()[:500]}\n```'
        if link:
            content += f'\n🔗 <{link}>'
        requests.post(webhook_url, json={'content': content[:2000]}, timeout=5)
    except Exception as exc:
        logger.warning('discord_escalation_alert_failed: %s', exc)
