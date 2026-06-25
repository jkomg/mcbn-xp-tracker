"""Helpers for character retirement automation queueing and completion."""

from __future__ import annotations

from datetime import datetime, timezone

from app.db import DbCharacter, RetirementAutomationJob, db


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


def mark_retirement_jobs_wiki_synced() -> int:
    """Mark all discord-complete retirement jobs as synced by the latest wiki run."""
    now = datetime.now(timezone.utc)
    rows = RetirementAutomationJob.query.filter(
        RetirementAutomationJob.discord_completed_at.is_not(None),
        RetirementAutomationJob.wiki_synced_at.is_(None),
    ).all()
    for row in rows:
        row.wiki_synced_at = now
        row.last_error = ''
    return len(rows)
