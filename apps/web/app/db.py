"""SQLAlchemy models for MCbN XP Tracker."""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Integer, String, Boolean, Text

db = SQLAlchemy()


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
