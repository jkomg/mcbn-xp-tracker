"""Helpers for character retirement automation queueing and completion."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db import DbCharacter, RetirementAutomationJob, db

RETRY_BASE_DELAY_SECONDS = 300
RETRY_MAX_DELAY_SECONDS = 21600


def enqueue_retirement_job(character_name: str, requested_by: str) -> RetirementAutomationJob | None:
    """Queue retirement automation work for a character if they are retired.

    Reuses any existing unsynced job for the same character so repeated
    retire-actions do not create duplicate queue rows.
    """
    row = DbCharacter.query.filter(DbCharacter.character_name.ilike(character_name)).first()
    if not row or (row.status or 'active') != 'retired':
        return None

    job = (
        RetirementAutomationJob.query.filter(
            RetirementAutomationJob.character_name.ilike(character_name),
            RetirementAutomationJob.wiki_synced_at.is_(None),
        )
        .order_by(RetirementAutomationJob.requested_at.desc())
        .first()
    )

    if job is None:
        job = RetirementAutomationJob(
            character_name=row.character_name,
            requested_by=requested_by[:100],
            cubby_channel_id=(row.ticket_channel_id or None),
        )
        db.session.add(job)
    else:
        job.requested_by = requested_by[:100]
        job.cubby_channel_id = row.ticket_channel_id or job.cubby_channel_id
        if job.last_error:
            job.last_error = ''

    return job


def mark_retirement_jobs_wiki_synced(synced_before: datetime | None = None) -> int:
    """Mark discord-complete retirement jobs as synced by the latest wiki run.

    Only jobs whose Discord work completed before *synced_before* are marked,
    so jobs that finish Discord work mid-sync (after the wiki batch was gathered
    but before the success ack arrives) are not falsely marked as wiki-synced.
    If *synced_before* is None, all discord-complete unsynced jobs are marked.
    """
    now = datetime.now(timezone.utc)
    q = RetirementAutomationJob.query.filter(
        RetirementAutomationJob.discord_completed_at.is_not(None),
        RetirementAutomationJob.wiki_synced_at.is_(None),
    )
    if synced_before is not None:
        q = q.filter(RetirementAutomationJob.discord_completed_at <= synced_before)
    # Use a single bulk UPDATE instead of ORM-style per-row modifications.
    # The libsql/Turso driver reports combined rowcount as 1 across multiple
    # UPDATE statements, causing SQLAlchemy's StaleDataError. synchronize_session=False
    # skips the rowcount check; the caller commits immediately after.
    return q.update({'wiki_synced_at': now, 'last_error': ''}, synchronize_session=False)


def retirement_retry_delay_seconds(job: RetirementAutomationJob) -> int:
    """Return the retry delay for a failed retirement job attempt."""
    attempts = max(0, int(job.attempt_count or 0))
    if attempts <= 0:
        return 0
    delay = RETRY_BASE_DELAY_SECONDS * (2 ** (attempts - 1))
    return min(delay, RETRY_MAX_DELAY_SECONDS)


def retirement_next_retry_at(job: RetirementAutomationJob) -> datetime | None:
    """Return when a pending failed job should next be retried."""
    if job.discord_completed_at is not None:
        return None
    if not (job.last_error or '').strip():
        return None
    if job.last_attempt_at is None:
        return datetime.now(timezone.utc)
    last_attempt_at = job.last_attempt_at
    if last_attempt_at.tzinfo is None:
        last_attempt_at = last_attempt_at.replace(tzinfo=timezone.utc)
    return last_attempt_at + timedelta(seconds=retirement_retry_delay_seconds(job))


def is_retirement_job_ready(job: RetirementAutomationJob, *, now: datetime | None = None) -> bool:
    """Return True when a pending retirement job should be handed to the bot."""
    if job.discord_completed_at is not None:
        return False
    next_retry_at = retirement_next_retry_at(job)
    if next_retry_at is None:
        return True
    current = now or datetime.now(timezone.utc)
    return next_retry_at <= current
