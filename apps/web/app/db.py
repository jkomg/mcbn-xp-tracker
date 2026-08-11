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
    # Same grouping key used for Discord alert dedupe (source:event[:subject]) —
    # lets us count occurrences of "this specific thing" for escalation.
    dedupe_key = db.Column(String(250), nullable=False, default='', index=True)


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
    ticket_channel_id = db.Column(String(32), nullable=True)


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
    # Dual-purpose: specific power/ritual name for discipline spends, OR the
    # required faction/sub-category name for repeatable Advantages like
    # Status (e.g. "Tremere"), folded into the sheet as "Status (Tremere)" —
    # see app.character_sheet._SUBCATEGORY_ADVANTAGES.
    power_name = db.Column(String(100), default='')
    depends_on = db.Column(Integer, nullable=True)  # FK to another spend request id
    coterie_id = db.Column(Integer, db.ForeignKey('coteries.id'), nullable=True, index=True)
    coterie = db.relationship('Coterie', foreign_keys=[coterie_id], lazy='joined')


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
    warnings = db.Column(Text, default='')  # JSON list of non-fatal warning strings
    created_at = db.Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class RetirementAutomationJob(db.Model):
    """Queued retirement automation work shared between the web app and bot."""
    __tablename__ = 'retirement_automation_jobs'
    __table_args__ = (
        db.Index('ix_retirement_jobs_discord_pending', 'discord_completed_at'),
        db.Index('ix_retirement_jobs_wiki_pending', 'wiki_synced_at'),
    )
    id = db.Column(Integer, primary_key=True)
    character_name = db.Column(String(200), nullable=False, index=True)
    requested_by = db.Column(String(100), nullable=False, default='')
    cubby_channel_id = db.Column(String(32), nullable=True)
    requested_at = db.Column(DateTime, nullable=False,
                             default=lambda: datetime.now(timezone.utc), index=True)
    last_attempt_at = db.Column(DateTime, nullable=True)
    attempt_count = db.Column(Integer, nullable=False, default=0)
    last_error = db.Column(Text, default='')
    children_source_thread_id = db.Column(String(32), nullable=True)
    children_retired_thread_id = db.Column(String(32), nullable=True)
    cubby_moved_at = db.Column(DateTime, nullable=True)
    children_moved_at = db.Column(DateTime, nullable=True)
    discord_completed_at = db.Column(DateTime, nullable=True)
    wiki_synced_at = db.Column(DateTime, nullable=True)


class DbSheetsSyncError(db.Model):
    __tablename__ = 'sheets_sync_errors'
    id = db.Column(Integer, primary_key=True)
    timestamp = db.Column(String(30), default='', index=True)
    operation = db.Column(String(100), default='')
    error = db.Column(Text, default='')
    details = db.Column(Text, default='')
    dismissed = db.Column(Boolean, default=False, nullable=False, index=True)


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


class DiscordDisplayName(db.Model):
    """Discord display names updated by the bot when users post."""
    __tablename__ = 'discord_display_names'
    discord_id = db.Column(String(30), primary_key=True)
    display_name = db.Column(String(200), nullable=False, default='')
    updated_at = db.Column(DateTime, nullable=False, default=datetime.utcnow)


class DiscordPostCount(db.Model):
    """Daily Discord post counts per user per activity category (ic/ooc/rolls/cubby)."""
    __tablename__ = 'discord_post_counts'
    __table_args__ = (
        db.UniqueConstraint('discord_id', 'date', 'category', name='uq_discord_post_count'),
    )
    id = db.Column(Integer, primary_key=True)
    discord_id = db.Column(String(30), nullable=False, index=True)
    date = db.Column(String(10), nullable=False)   # YYYY-MM-DD (UTC)
    category = db.Column(String(10), nullable=False)  # ic | ooc | rolls | cubby
    count = db.Column(Integer, nullable=False, default=0)


class DiscordMemberEvent(db.Model):
    """Discrete member-growth events: server joins and first-time role gains
    (Kindred/Ghoul/Mortal — the "lurker became an active player" signal).

    Deliberately event rows, not running counts: the discord_post_counts
    corruption incident happened because that table stored counts that had
    to be incremented, and re-running the backfill scanner compounded them.
    Events are idempotent by construction (INSERT ... ON CONFLICT DO
    NOTHING against the unique constraint below), so re-running a full
    member sweep on every bot restart can never double-count.
    """
    __tablename__ = 'discord_member_events'
    __table_args__ = (
        db.UniqueConstraint('discord_id', 'event_type', 'role', 'date', name='uq_discord_member_event'),
    )
    id = db.Column(Integer, primary_key=True)
    discord_id = db.Column(String(30), nullable=False, index=True)
    event_type = db.Column(String(20), nullable=False)  # join | role_gain
    # '' for join; 'kindred' | 'ghoul' | 'mortal' for role_gain. Never NULL —
    # NULL is distinct from NULL in a unique constraint, which would silently
    # defeat dedup for join rows.
    role = db.Column(String(20), nullable=False, default='')
    date = db.Column(String(10), nullable=False)  # YYYY-MM-DD (UTC)


class CharacterDraft(db.Model):
    """In-progress and submitted character creation drafts."""
    __tablename__ = 'character_drafts'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    player_discord_id = db.Column(db.String(32), nullable=False, index=True)
    character_name = db.Column(db.String(200), nullable=True)
    # draft | submitted | revision_requested | approved
    # RoD sheet imports (Issue #292) additionally use: sheet_review | denied | superseded
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
    # Set when this background has been donated to a coterie pool.
    # While donated, only coterie members may blank it (not the PC owner independently).
    donated_coterie_id = db.Column(Integer, db.ForeignKey('coteries.id'), nullable=True, index=True)
    # Set when a player has requested donation pending staff approval.
    donation_pending_coterie_id = db.Column(Integer, db.ForeignKey('coteries.id'), nullable=True, index=True)

    @property
    def dots_available(self) -> int:
        return max(0, (self.dots_total or 0) - (self.dots_blanked or 0))


class DbWishListItem(db.Model):
    __tablename__ = 'wish_list_items'
    __table_args__ = (
        db.Index('ix_wish_list_items_character', 'character_name'),
    )
    id = db.Column(Integer, primary_key=True)
    character_name = db.Column(String(200), nullable=False)
    spend_category = db.Column(String(100), nullable=False)
    trait_name = db.Column(String(100), nullable=False)
    power_name = db.Column(String(100), default='')
    current_dots = db.Column(Integer, nullable=False, default=0)
    new_dots = db.Column(Integer, nullable=False, default=1)
    is_in_clan = db.Column(Boolean, default=False)
    xp_cost = db.Column(Integer, nullable=False, default=0)
    justification = db.Column(Text, default='')
    created_at = db.Column(String(20), nullable=False, default='')


class Coterie(db.Model):
    __tablename__ = 'coteries'
    __table_args__ = (
        db.Index('ix_coteries_slug', 'slug'),
        db.Index('ix_coteries_status', 'status'),
    )
    id = db.Column(Integer, primary_key=True)
    name = db.Column(String(200), nullable=False, unique=True)
    slug = db.Column(String(200), nullable=False, unique=True)
    description = db.Column(Text, default='')
    discord_channel_id = db.Column(String(50), nullable=True)
    status = db.Column(String(20), nullable=False, default='pending')  # pending | active
    created_at = db.Column(DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    # Domain ratings (0–5 each). Advanced via coterie XP spends, set by staff.
    chasse = db.Column(Integer, nullable=False, default=0)
    lien = db.Column(Integer, nullable=False, default=0)
    portillon = db.Column(Integer, nullable=False, default=0)
    # Creation lifecycle: forming → submitted → active (null = legacy/staff-created, treat as active)
    creation_state = db.Column(String(20), nullable=True, default=None)
    # Staff notes sent back during sign-off review
    creation_notes = db.Column(Text, nullable=True, default=None)

    members = db.relationship('CoterieMember', back_populates='coterie',
                              cascade='all, delete-orphan')
    advantages = db.relationship('CoterieAdvantage', back_populates='coterie',
                                 cascade='all, delete-orphan')
    donated_backgrounds = db.relationship('DbCharacterBackground',
                                          foreign_keys='DbCharacterBackground.donated_coterie_id',
                                          backref='coterie')


class CoterieMember(db.Model):
    __tablename__ = 'coterie_members'
    __table_args__ = (
        db.UniqueConstraint('coterie_id', 'roster_character_id', name='uq_coterie_member'),
    )
    id = db.Column(Integer, primary_key=True)
    coterie_id = db.Column(Integer, db.ForeignKey('coteries.id'), nullable=False, index=True)
    roster_character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False)
    free_dots_remaining = db.Column(Integer, nullable=False, default=2)
    setup_complete = db.Column(Boolean, nullable=False, default=False)
    role = db.Column(String(20), nullable=False, default='member')  # member | leader
    joined_at = db.Column(DateTime, nullable=False,
                          default=lambda: datetime.now(timezone.utc))

    coterie = db.relationship('Coterie', back_populates='members')
    character = db.relationship('DbCharacter', backref='coterie_memberships')


class CoterieAdvantage(db.Model):
    """An item in the coterie pool funded by free dots or flaw compensation."""
    __tablename__ = 'coterie_advantages'
    id = db.Column(Integer, primary_key=True)
    coterie_id = db.Column(Integer, db.ForeignKey('coteries.id'), nullable=False, index=True)
    name = db.Column(String(200), nullable=False)
    dots = db.Column(Integer, nullable=False, default=1)
    # background | merit | flaw
    advantage_type = db.Column(String(20), nullable=False, default='background')
    notes = db.Column(Text, default='')
    added_by = db.Column(String(200), nullable=False, default='')
    created_at = db.Column(DateTime, nullable=False,
                           default=lambda: datetime.now(timezone.utc))

    coterie = db.relationship('Coterie', back_populates='advantages')


class DbBoon(db.Model):
    """A prestation ledger entry: one character owes another a boon."""
    __tablename__ = 'boons'
    __table_args__ = (
        db.Index('ix_boons_creditor_status', 'creditor_character_id', 'status'),
        db.Index('ix_boons_debtor_status', 'debtor_character_id', 'status'),
    )
    id = db.Column(Integer, primary_key=True)
    creditor_character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False, index=True)
    debtor_character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False, index=True)
    tier = db.Column(String(20), nullable=False)  # trivial | minor | major | life
    reason = db.Column(Text, default='')
    status = db.Column(String(20), nullable=False, default='owed', index=True)  # owed | repayment_offered | repaid
    created_at = db.Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_by_discord_id = db.Column(String(30), default='')
    resolved_at = db.Column(DateTime, nullable=True)

    creditor = db.relationship('DbCharacter', foreign_keys=[creditor_character_id])
    debtor = db.relationship('DbCharacter', foreign_keys=[debtor_character_id])


class SceneRequest(db.Model):
    """A player's ask for a scene with an SPC, queued for an ST to claim or reject."""
    __tablename__ = 'scene_requests'
    __table_args__ = (
        db.Index('ix_scene_requests_status_created', 'status', 'created_at'),
    )
    id = db.Column(Integer, primary_key=True)
    requester_character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False, index=True)
    spc_name = db.Column(String(200), nullable=False)
    play_period = db.Column(String(100), default='', index=True)
    justification = db.Column(Text, default='')
    status = db.Column(String(20), nullable=False, default='pending', index=True)  # pending | claimed | rejected
    created_by_discord_id = db.Column(String(30), default='')
    claimed_by_discord_id = db.Column(String(30), default='')
    claimed_by_name = db.Column(String(100), default='')
    rejected_reason = db.Column(Text, default='')
    queue_channel_id = db.Column(String(32), nullable=True)
    queue_message_id = db.Column(String(32), nullable=True)
    created_at = db.Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    resolved_at = db.Column(DateTime, nullable=True)

    requester = db.relationship('DbCharacter', foreign_keys=[requester_character_id])


class Rumor(db.Model):
    """A player-submitted rumor, queued for ST approval before it posts to #rumors."""
    __tablename__ = 'rumors'
    __table_args__ = (
        db.Index('ix_rumors_status_created', 'status', 'created_at'),
    )
    id = db.Column(Integer, primary_key=True)
    discovery = db.Column(String(50), nullable=False)  # Kindred | Underworld | High Society | Streets
    rumor_text = db.Column(Text, nullable=False)
    location = db.Column(String(200), default='')
    point_of_contact = db.Column(String(300), default='')
    roll = db.Column(String(200), default='')
    kind = db.Column(String(16), nullable=False, default='permanent')  # permanent | ephemeral
    ic_night_key = db.Column(String(32), default='')  # stamped at creation for ephemeral rumors
    status = db.Column(String(20), nullable=False, default='pending', index=True)  # pending | approved | rejected | expired
    requester_discord_id = db.Column(String(30), default='')
    requester_character_name = db.Column(String(200), default='')
    cubby_channel_id = db.Column(String(32), nullable=True)
    cubby_message_id = db.Column(String(32), nullable=True)
    posted_channel_id = db.Column(String(32), nullable=True)
    posted_message_id = db.Column(String(32), nullable=True)
    approved_by_discord_id = db.Column(String(30), default='')
    approved_by_name = db.Column(String(100), default='')
    rejected_by_discord_id = db.Column(String(30), default='')
    rejected_by_name = db.Column(String(100), default='')
    rejected_reason = db.Column(Text, default='')
    created_at = db.Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    resolved_at = db.Column(DateTime, nullable=True)


class DbContactThread(db.Model):
    """A #kindred-contact conversation between two or more characters."""
    __tablename__ = 'contact_threads'
    id = db.Column(Integer, primary_key=True)
    created_at = db.Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_message_at = db.Column(DateTime, nullable=False,
                                default=lambda: datetime.now(timezone.utc), index=True)

    participants = db.relationship('DbContactParticipant', back_populates='thread',
                                   cascade='all, delete-orphan')
    messages = db.relationship('DbContactMessage', back_populates='thread',
                               cascade='all, delete-orphan',
                               order_by='DbContactMessage.sent_at')


class DbContactParticipant(db.Model):
    __tablename__ = 'contact_participants'
    __table_args__ = (
        db.UniqueConstraint('thread_id', 'character_id', name='uq_contact_participant'),
    )
    id = db.Column(Integer, primary_key=True)
    thread_id = db.Column(Integer, db.ForeignKey('contact_threads.id'), nullable=False, index=True)
    character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False, index=True)

    thread = db.relationship('DbContactThread', back_populates='participants')
    character = db.relationship('DbCharacter')


class DbContactMessage(db.Model):
    __tablename__ = 'contact_messages'
    id = db.Column(Integer, primary_key=True)
    thread_id = db.Column(Integer, db.ForeignKey('contact_threads.id'), nullable=False, index=True)
    sender_character_id = db.Column(Integer, db.ForeignKey('characters.id'), nullable=False, index=True)
    body = db.Column(Text, default='')
    sent_at = db.Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    discord_channel_id = db.Column(String(32), nullable=True)
    discord_message_id = db.Column(String(32), nullable=True)

    thread = db.relationship('DbContactThread', back_populates='messages')
    sender = db.relationship('DbCharacter')
