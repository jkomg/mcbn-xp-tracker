"""SQLAlchemy models for MCbN XP Tracker."""

import uuid
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import DateTime, Integer, String, Boolean, Text

db = SQLAlchemy()


class AppLogEntry(db.Model):
    """Persisted warn/error log entries from the bot and web app."""
    __tablename__ = 'app_log_entries'
    id = db.Column(Integer, primary_key=True)
    ts = db.Column(String(30), nullable=False)
    source = db.Column(String(10), nullable=False)   # 'bot' | 'web'
    level = db.Column(String(10), nullable=False)    # 'warn' | 'error'
    event = db.Column(String(200), nullable=False, default='')
    message = db.Column(Text, default='')
    details = db.Column(Text, default='')
    created_at = db.Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    dismissed = db.Column(Boolean, nullable=False, default=False, index=True)


class DbCharacter(db.Model):
    __tablename__ = 'characters'
    id = db.Column(Integer, primary_key=True)
    character_name = db.Column(String(200), nullable=False, unique=True, index=True)
    player_discord = db.Column(String(30), default='')
    player_discord_name = db.Column(String(100), default='')
    clan = db.Column(String(50), default='')
    age_category = db.Column(String(50), default='')
    sect = db.Column(String(50), default='')
    active = db.Column(Boolean, default=True, index=True)
    status = db.Column(String(20), default='active', index=True)  # active | deceased | retired
    creation_xp = db.Column(Integer, default=0)
    enemy = db.Column(String(200), default='')
    date_added = db.Column(String(20), default='')
    notes = db.Column(Text, default='')


class DbPlayPeriod(db.Model):
    __tablename__ = 'play_periods'
    id = db.Column(Integer, primary_key=True)
    period_label = db.Column(String(100), nullable=False, unique=True, index=True)
    night_number = db.Column(Integer, default=0)
    start_date = db.Column(String(10), default='')
    end_date = db.Column(String(10), default='')
    session_number = db.Column(Integer, default=0)
    submissions_open = db.Column(Boolean, default=True)
    active = db.Column(Boolean, default=True)


class DbXPClaim(db.Model):
    __tablename__ = 'xp_claims'
    __table_args__ = (
        db.Index('ix_xp_claims_char_period', 'character_name', 'play_period'),
        db.Index('ix_xp_claims_status_timestamp', 'status', 'timestamp'),
        db.Index('ix_xp_claims_status_review_date', 'status', 'review_date'),
    )
    id = db.Column(Integer, primary_key=True)
    timestamp = db.Column(String(20), default='')
    character_name = db.Column(String(200), nullable=False, index=True)
    play_period = db.Column(String(100), default='', index=True)
    posted_once = db.Column(Boolean, default=False)
    posted_once_link = db.Column(Text, default='')
    hunting_awakening = db.Column(Boolean, default=False)
    hunting_awakening_link = db.Column(Text, default='')
    scene_with_another = db.Column(Boolean, default=False)
    scene_with_another_link = db.Column(Text, default='')
    conflict = db.Column(Boolean, default=False)
    conflict_link = db.Column(Text, default='')
    combat = db.Column(Boolean, default=False)
    combat_link = db.Column(Text, default='')
    unmitigated_stain = db.Column(Boolean, default=False)
    unmitigated_stain_link = db.Column(Text, default='')
    wildcard = db.Column(Boolean, default=False)
    wildcard_link = db.Column(Text, default='')
    wildcard_reason = db.Column(Text, default='')
    wildcard_amount = db.Column(Integer, default=0)
    xp_claimed = db.Column(Integer, default=0)
    status = db.Column(String(20), default='Pending', index=True)
    approved_xp = db.Column(Integer, default=0)
    reviewed_by = db.Column(String(100), default='')
    review_date = db.Column(String(20), default='')
    st_notes = db.Column(Text, default='')


class DbSpendRequest(db.Model):
    __tablename__ = 'spend_requests'
    __table_args__ = (
        db.Index('ix_spend_requests_status_timestamp', 'status', 'timestamp'),
        db.Index('ix_spend_requests_status_review_date', 'status', 'review_date'),
    )
    id = db.Column(Integer, primary_key=True)
    timestamp = db.Column(String(20), default='')
    character_name = db.Column(String(200), nullable=False, index=True)
    spend_category = db.Column(String(100), default='')
    trait_name = db.Column(String(100), default='')
    current_dots = db.Column(Integer, default=0)
    new_dots = db.Column(Integer, default=0)
    xp_cost = db.Column(Integer, default=0)
    is_in_clan = db.Column(Boolean, default=False)
    justification = db.Column(Text, default='')
    status = db.Column(String(20), default='Pending', index=True)
    verified_cost = db.Column(Integer, default=0)
    reviewed_by = db.Column(String(100), default='')
    review_date = db.Column(String(20), default='')
    st_notes = db.Column(Text, default='')
    depends_on = db.Column(Integer, nullable=True)  # FK to another spend request id


class DbLedgerEntry(db.Model):
    __tablename__ = 'ledger_entries'
    id = db.Column(Integer, primary_key=True)
    character_name = db.Column(String(200), nullable=False, index=True)
    date = db.Column(String(10), default='')
    awarded = db.Column(Integer, default=0)
    spent = db.Column(Integer, default=0)
    reason = db.Column(Text, default='')
    entered_by = db.Column(String(100), default='')
    timestamp = db.Column(String(20), default='')


class DbAuditLog(db.Model):
    __tablename__ = 'audit_log'
    id = db.Column(Integer, primary_key=True)
    timestamp = db.Column(String(20), default='', index=True)
    staff_user = db.Column(String(100), default='')
    action_type = db.Column(String(100), default='', index=True)
    target_character = db.Column(String(200), default='')
    details = db.Column(Text, default='')


class AppSetting(db.Model):
    __tablename__ = 'app_settings'
    key = db.Column(String(64), primary_key=True)
    value = db.Column(String(256), nullable=False)
    updated_by = db.Column(String(100), nullable=False, default='')
    updated_at = db.Column(DateTime, nullable=False, default=datetime.utcnow)


class WikiSyncEvent(db.Model):
    """Append-only history of wiki sync lifecycle events."""
    __tablename__ = 'notion_sync_events'
    id = db.Column(Integer, primary_key=True)
    ts = db.Column(String(30), nullable=False)
    run_id = db.Column(String(64), default='', index=True)
    source = db.Column(String(16), nullable=False)  # manual | scheduled
    status = db.Column(String(16), nullable=False)  # running | success | error
    error = db.Column(Text, default='')
    created_at = db.Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class DbSheetsSyncError(db.Model):
    __tablename__ = 'sheets_sync_errors'
    id = db.Column(Integer, primary_key=True)
    timestamp = db.Column(String(30), default='', index=True)
    operation = db.Column(String(100), default='')
    error = db.Column(Text, default='')
    details = db.Column(Text, default='')


class WikiPage(db.Model):
    __tablename__ = 'wiki_pages'
    id = db.Column(Integer, primary_key=True)
    slug = db.Column(String(200), nullable=False, unique=True, index=True)
    title = db.Column(String(300), nullable=False)
    summary = db.Column(String(300), default='')
    body_markdown = db.Column(Text, default='')
    category = db.Column(String(100), default='', index=True)
    cover_image_url = db.Column(Text, default='')
    source = db.Column(String(50), default='')
    # status: 'draft' | 'active' | 'upcoming' | 'archived'
    # draft/archived are staff-only; active/upcoming are player-visible.
    status = db.Column(String(20), default='active', nullable=False, index=True)
    sync_locked = db.Column(Boolean, default=False, nullable=False, index=True)
    sync_locked_by = db.Column(String(100), default='')
    sync_locked_at = db.Column(DateTime, nullable=True)
    created_at = db.Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_by = db.Column(String(100), default='')


class WikiSyncBlock(db.Model):
    """Slugs that the sync is not allowed to recreate (tombstones for manually deleted pages)."""
    __tablename__ = 'wiki_sync_blocks'
    slug = db.Column(String(200), primary_key=True)
    blocked_by = db.Column(String(100), nullable=False, default='')
    blocked_at = db.Column(DateTime, nullable=False, default=datetime.utcnow)


class DbReminderPreference(db.Model):
    __tablename__ = 'reminder_preferences'
    discord_id = db.Column(String(30), primary_key=True)
    opt_out = db.Column(Boolean, default=False, nullable=False)
    snooze_until_epoch = db.Column(Integer, default=0, nullable=False)
    updated_at = db.Column(String(20), default='')


class CharacterDraft(db.Model):
    """In-progress and submitted character creation drafts."""
    __tablename__ = 'character_drafts'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    player_discord_id = db.Column(db.String(32), nullable=False, index=True)
    character_name = db.Column(db.String(200), nullable=True)
    # draft | submitted | revision_requested | approved
    status = db.Column(db.String(32), nullable=False, default='draft', index=True)
    is_spc = db.Column(db.Boolean, nullable=False, default=False)
    ticket_channel_id = db.Column(db.String(32), nullable=True)
    character_data = db.Column(db.Text, nullable=True)  # JSON blob
    roster_character_id = db.Column(db.Integer, db.ForeignKey('characters.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=True,
                           onupdate=lambda: datetime.now(timezone.utc))
    submitted_at = db.Column(db.DateTime, nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    approved_by = db.Column(db.String(32), nullable=True)
    revision_notes = db.Column(db.Text, nullable=True)


class CcRestriction(db.Model):
    """Staff-controlled bans on character creator components (loresheets, merits, etc.)."""
    __tablename__ = 'cc_restrictions'
    __table_args__ = (
        db.UniqueConstraint('component_type', 'component_id', name='uq_cc_restriction'),
    )
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # e.g. 'loresheet' — extensible to 'merit', 'background', etc.
    component_type = db.Column(db.String(50), nullable=False, index=True)
    # matches the id field in the SPA data (e.g. 'minneapolis')
    component_id = db.Column(db.String(100), nullable=False, index=True)
    reason = db.Column(db.Text, nullable=False, default='')
    updated_by = db.Column(db.String(100), nullable=False, default='')
    updated_at = db.Column(db.DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))


class DbCharacterBackground(db.Model):
    __tablename__ = 'character_backgrounds'
    __table_args__ = (
        db.UniqueConstraint('character_name', 'background_key', name='uq_character_background_key'),
        db.Index('ix_character_backgrounds_character', 'character_name'),
        db.Index('ix_character_backgrounds_release_night', 'release_night_number'),
    )
    id = db.Column(Integer, primary_key=True)
    character_name = db.Column(String(200), nullable=False)
    background_key = db.Column(String(120), nullable=False)
    background_name = db.Column(String(120), nullable=False)
    dots_total = db.Column(Integer, nullable=False, default=0)
    dots_blanked = db.Column(Integer, nullable=False, default=0)
    blanked_at_night_number = db.Column(Integer, nullable=True)
    release_night_number = db.Column(Integer, nullable=True)
    updated_at = db.Column(String(20), nullable=False, default='')
    updated_by = db.Column(String(100), nullable=False, default='')
