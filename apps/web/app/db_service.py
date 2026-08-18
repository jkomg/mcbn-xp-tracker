"""DBService — SQLAlchemy-backed drop-in replacement for SheetsClient.

All method signatures match SheetsClient. Returns the same dataclasses
from app.models so blueprints need minimal changes.

Phase 1: Primary reads/writes go to DB. Google Sheets is a write-through
mirror for new inserts only (handled by SheetsSyncWorker in the caller).
Status updates (approve/deny) are NOT mirrored to Sheets in this phase.
"""

from __future__ import annotations

import re
from datetime import date as _date_type, datetime, timedelta
from typing import Optional

from sqlalchemy import func

from app.db import (
    db,
    DbCharacter,
    DbPlayPeriod,
    DbXPClaim,
    DbSpendRequest,
    DbLedgerEntry,
    DbAuditLog,
    DbReminderPreference,
    DbSheetsSyncError,
    DbCharacterBackground,
    DbBoon,
    DbWishListItem,
)
from app.models import Character, PlayPeriod, XPClaim, SpendRequest, LedgerEntry, AuditEntry
from app.game_calendar import next_night_after_downtime


def _now_str() -> str:
    """Return current UTC timestamp in YYYYMMDD HH:MM:SS format."""
    return datetime.utcnow().strftime('%Y%m%d %H:%M:%S')


def _parse_ledger_date(date_str: str) -> _date_type:
    """Parse a ledger date string into a date for sorting.

    Handles the inconsistent formats that exist in migrated data:
      YYYYMMDD        → 20260324
      M/D or MM/DD    → 9/7, 11/30  (no year; infer most recent past occurrence)
      M-D-YY          → 2-22-26, 12-30-25
      M-D-YYYY        → 2-22-2026
    Falls back to 1970-01-01 for anything unparseable.
    """
    s = (date_str or '').strip()

    # YYYYMMDD
    if re.fullmatch(r'\d{8}', s):
        try:
            return _date_type(int(s[:4]), int(s[4:6]), int(s[6:8]))
        except ValueError:
            pass

    # M-D-YYYY or MM-DD-YYYY (4-digit year, dash separator)
    m = re.fullmatch(r'(\d{1,2})-(\d{1,2})-(\d{4})', s)
    if m:
        try:
            return _date_type(int(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            pass

    # M-D-YY or MM-DD-YY (2-digit year, dash separator)
    m = re.fullmatch(r'(\d{1,2})-(\d{1,2})-(\d{2})', s)
    if m:
        try:
            return _date_type(2000 + int(m.group(3)), int(m.group(1)), int(m.group(2)))
        except ValueError:
            pass

    # M/D or MM/DD (no year — pick most recent past occurrence)
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})', s)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        today = _date_type.today()
        for year in (today.year, today.year - 1, today.year - 2):
            try:
                d = _date_type(year, month, day)
                if d <= today:
                    return d
            except ValueError:
                continue

    return _date_type(1970, 1, 1)


def _parse_yyyymmdd(value: str) -> Optional[datetime]:
    raw = str(value or '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y%m%d')
    except ValueError:
        return None


def _short_md(value: datetime) -> str:
    return f'{value.month}/{value.day}'


def _background_key(value: str) -> str:
    normalized = re.sub(r'[^a-z0-9]+', '-', str(value or '').strip().lower())
    normalized = normalized.strip('-')
    return normalized[:120]


def _row_to_character(row: DbCharacter) -> Character:
    return Character(
        character_name=row.character_name,
        player_discord=row.player_discord or '',
        player_discord_name=row.player_discord_name or '',
        clan=row.clan or '',
        age_category=row.age_category or '',
        sect=row.sect or '',
        active=bool(row.active),
        status=row.status or 'active',
        creation_xp=row.creation_xp or 0,
        enemy=row.enemy or '',
        date_added=row.date_added or '',
        notes=row.notes or '',
        ticket_channel_id=row.ticket_channel_id or None,
    )


def _row_to_period(row: DbPlayPeriod) -> PlayPeriod:
    return PlayPeriod(
        period_label=row.period_label,
        night_number=row.night_number or 0,
        start_date=row.start_date or '',
        end_date=row.end_date or '',
        session_number=row.session_number or 0,
        submissions_open=bool(row.submissions_open),
        active=bool(row.active),
    )


def _row_to_claim(row: DbXPClaim) -> XPClaim:
    return XPClaim(
        row_index=row.id,
        timestamp=row.timestamp or '',
        character_name=row.character_name or '',
        play_period=row.play_period or '',
        posted_once=bool(row.posted_once),
        posted_once_link=row.posted_once_link or '',
        hunting_awakening=bool(row.hunting_awakening),
        hunting_awakening_link=row.hunting_awakening_link or '',
        scene_with_another=bool(row.scene_with_another),
        scene_with_another_link=row.scene_with_another_link or '',
        conflict=bool(row.conflict),
        conflict_link=row.conflict_link or '',
        combat=bool(row.combat),
        combat_link=row.combat_link or '',
        unmitigated_stain=bool(row.unmitigated_stain),
        unmitigated_stain_link=row.unmitigated_stain_link or '',
        wildcard=bool(row.wildcard),
        wildcard_link=row.wildcard_link or '',
        wildcard_reason=row.wildcard_reason or '',
        wildcard_amount=row.wildcard_amount or 0,
        xp_claimed=row.xp_claimed or 0,
        status=row.status or 'Pending',
        approved_xp=row.approved_xp or 0,
        reviewed_by=row.reviewed_by or '',
        review_date=row.review_date or '',
        st_notes=row.st_notes or '',
    )


def _row_to_spend(row: DbSpendRequest) -> SpendRequest:
    return SpendRequest(
        row_index=row.id,
        timestamp=row.timestamp or '',
        character_name=row.character_name or '',
        spend_category=row.spend_category or '',
        trait_name=row.trait_name or '',
        power_name=row.power_name or '',
        current_dots=row.current_dots or 0,
        new_dots=row.new_dots or 0,
        xp_cost=row.xp_cost or 0,
        is_in_clan=bool(row.is_in_clan),
        justification=row.justification or '',
        status=row.status or 'Pending',
        verified_cost=row.verified_cost or 0,
        reviewed_by=row.reviewed_by or '',
        review_date=row.review_date or '',
        st_notes=row.st_notes or '',
        depends_on=row.depends_on or 0,
        coterie_id=row.coterie_id or 0,
        coterie_name=row.coterie.name if row.coterie_id and row.coterie else '',
    )


def _row_to_ledger(row: DbLedgerEntry) -> LedgerEntry:
    return LedgerEntry(
        row_index=row.id,
        character_name=row.character_name or '',
        date=row.date or '',
        awarded=row.awarded or 0,
        spent=row.spent or 0,
        reason=row.reason or '',
        entered_by=row.entered_by or '',
        timestamp=row.timestamp or '',
    )


class DBService:
    """SQLAlchemy-backed data service with the same API as SheetsClient."""

    def __init__(self, sheets_client=None):
        # Held for delegating preview_* methods which require Sheets access.
        self._sheets = sheets_client

    # ── Roster ───────────────────────────────────────────────────────────────

    def get_all_characters(self) -> list[Character]:
        rows = DbCharacter.query.all()
        return [_row_to_character(r) for r in rows]

    def get_active_characters(self) -> list[Character]:
        rows = DbCharacter.query.filter_by(active=True).all()
        return [_row_to_character(r) for r in rows]

    def get_character(self, name: str) -> Optional[Character]:
        row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == name.lower()
        ).first()
        return _row_to_character(row) if row else None

    def add_character(self, char: Character) -> None:
        row = DbCharacter(
            character_name=char.character_name,
            player_discord=char.player_discord or '',
            player_discord_name=char.player_discord_name or '',
            clan=char.clan or '',
            age_category=char.age_category or '',
            sect=char.sect or '',
            active=char.active,
            creation_xp=char.creation_xp or 0,
            enemy=char.enemy or '',
            date_added=char.date_added or _now_str(),
            notes=char.notes or '',
        )
        db.session.add(row)
        db.session.commit()

    def update_character(self, name: str, updates: dict) -> None:
        row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == name.lower()
        ).first()
        if not row:
            raise ValueError(f'Character not found: {name}')

        bool_fields = {'active'}
        for key, value in updates.items():
            if not hasattr(row, key):
                continue
            if key in bool_fields:
                # Accept 'TRUE'/'FALSE' strings (from sheets.py callers) or booleans
                if isinstance(value, str):
                    setattr(row, key, value.strip().upper() in ('TRUE', 'YES', '1'))
                else:
                    setattr(row, key, bool(value))
            elif key == 'creation_xp':
                try:
                    setattr(row, key, int(value))
                except (TypeError, ValueError):
                    setattr(row, key, 0)
            else:
                setattr(row, key, str(value) if value is not None else '')

        db.session.commit()

    def get_characters_by_discord_id(self, discord_id: str) -> list[Character]:
        rows = DbCharacter.query.filter_by(player_discord=str(discord_id)).all()
        return [_row_to_character(r) for r in rows]

    def get_unlinked_characters(self) -> list[Character]:
        rows = DbCharacter.query.filter(
            DbCharacter.active == True,  # noqa: E712
            (DbCharacter.player_discord == None) | (DbCharacter.player_discord == ''),  # noqa: E711
        ).all()
        return [_row_to_character(r) for r in rows]

    def link_character_to_discord(self, character_name: str, discord_id: str,
                                  discord_name: str) -> None:
        self.update_character(character_name, {
            'player_discord': discord_id,
            'player_discord_name': discord_name,
        })

    def set_character_status(self, name: str, status: str) -> None:
        """Set character status (active/deceased/retired) and sync active flag."""
        if status not in ('active', 'deceased', 'retired'):
            raise ValueError(f'Invalid status: {status}')
        self.update_character(name, {
            'status': status,
            'active': 'TRUE' if status == 'active' else 'FALSE',
        })

    def deactivate_character(self, name: str) -> None:
        self.update_character(name, {'active': 'FALSE', 'status': 'retired'})

    def delete_character(self, name: str) -> None:
        row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == name.lower()
        ).first()
        if not row:
            raise ValueError(f'Character not found: {name}')
        db.session.delete(row)
        db.session.commit()

    def rename_character(self, old_name: str, new_name: str) -> None:
        """Rename a character and update all related records atomically."""
        char_row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == old_name.lower()
        ).first()
        if not char_row:
            raise ValueError(f'Character not found: {old_name}')
        if DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == new_name.lower()
        ).first():
            raise ValueError(f'A character named "{new_name}" already exists.')

        char_row.character_name = new_name
        DbXPClaim.query.filter(
            func.lower(DbXPClaim.character_name) == old_name.lower()
        ).update({'character_name': new_name}, synchronize_session=False)
        DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.character_name) == old_name.lower()
        ).update({'character_name': new_name}, synchronize_session=False)
        DbLedgerEntry.query.filter(
            func.lower(DbLedgerEntry.character_name) == old_name.lower()
        ).update({'character_name': new_name}, synchronize_session=False)
        DbWishListItem.query.filter(
            func.lower(DbWishListItem.character_name) == old_name.lower()
        ).update({'character_name': new_name}, synchronize_session=False)
        _character_action_types = {
            'add_character', 'edit_character', 'activate_character',
            'deactivate_character', 'delete_character', 'rename_character',
            'approve_claim', 'deny_claim', 'reopen_claim',
            'approve_spend', 'deny_spend',
            'xp_adjustment', 'spend_adjustment',
            'ledger_entry', 'delete_ledger_entry',
            'bot_claim_submitted', 'bot_spend_submitted',
            'player_claim_submitted', 'player_claim_amended',
            'player_spend_submitted', 'player_link_character',
        }
        DbAuditLog.query.filter(
            func.lower(DbAuditLog.target_character) == old_name.lower(),
            DbAuditLog.action_type.in_(_character_action_types),
        ).update({'target_character': new_name}, synchronize_session=False)
        db.session.commit()

    # ── Play Periods ─────────────────────────────────────────────────────────

    def get_all_periods(self) -> list[PlayPeriod]:
        rows = DbPlayPeriod.query.all()
        return [_row_to_period(r) for r in rows]

    def get_active_periods(self) -> list[PlayPeriod]:
        rows = DbPlayPeriod.query.filter_by(active=True).all()
        return [_row_to_period(r) for r in rows]

    def create_period(self, period: PlayPeriod) -> None:
        row = DbPlayPeriod(
            period_label=period.period_label,
            night_number=period.night_number,
            start_date=period.start_date or '',
            end_date=period.end_date or '',
            session_number=period.session_number,
            submissions_open=period.submissions_open,
            active=period.active,
        )
        db.session.add(row)
        db.session.commit()

    def update_period(self, label: str, updates: dict) -> None:
        row = DbPlayPeriod.query.filter_by(period_label=label).first()
        if not row:
            raise ValueError(f'Period not found: {label}')

        bool_fields = {'submissions_open', 'active'}
        for key, value in updates.items():
            if not hasattr(row, key):
                continue
            if key in bool_fields:
                if isinstance(value, str):
                    setattr(row, key, value.strip().upper() in ('TRUE', 'YES', '1'))
                else:
                    setattr(row, key, bool(value))
            elif key in ('night_number', 'session_number'):
                try:
                    setattr(row, key, int(value))
                except (TypeError, ValueError):
                    setattr(row, key, 0)
            else:
                setattr(row, key, str(value) if value is not None else '')

        db.session.commit()

    def get_next_night_number(self) -> int:
        periods = self.get_all_periods()
        if not periods:
            return 1
        return max(p.night_number for p in periods) + 1

    def auto_create_next_period_if_due(
        self,
        *,
        open_lead_days: int = 1,
        default_length_days: int = 14,
        default_gap_days: int = 0,
        now: Optional[datetime] = None,
    ) -> dict:
        """Create the next play period when the latest period is near end-date.

        Returns a dict:
            {
              'created': bool,
              'reason': str,
              'period': PlayPeriod | None,
            }
        """
        periods = self.get_all_periods()
        if not periods:
            return {'created': False, 'reason': 'no_periods', 'period': None}

        periods.sort(key=lambda p: p.night_number)
        latest = periods[-1]
        next_night = latest.night_number + 1
        if any(p.night_number == next_night for p in periods):
            return {'created': False, 'reason': 'next_already_exists', 'period': None}

        latest_start = _parse_yyyymmdd(latest.start_date)
        latest_end = _parse_yyyymmdd(latest.end_date)
        if not latest_start or not latest_end:
            return {'created': False, 'reason': 'invalid_latest_dates', 'period': None}

        now_dt = now or datetime.now()
        trigger_dt = latest_end - timedelta(days=max(0, int(open_lead_days)))
        if now_dt < trigger_dt:
            return {'created': False, 'reason': 'not_due_yet', 'period': None}

        length_days = max(1, int(default_length_days))
        gap_days = max(0, int(default_gap_days))
        if len(periods) >= 2:
            prev = periods[-2]
            prev_end = _parse_yyyymmdd(prev.end_date)
            inferred_len = (latest_end - latest_start).days
            if inferred_len > 0:
                length_days = inferred_len
            if prev_end:
                inferred_gap = (latest_start - prev_end).days
                if inferred_gap >= 0:
                    gap_days = inferred_gap

        next_start = latest_end + timedelta(days=gap_days)
        next_end = next_start + timedelta(days=length_days)
        next_period = PlayPeriod(
            period_label=f'Night {next_night} - {_short_md(next_start)} - {_short_md(next_end)}',
            night_number=next_night,
            start_date=next_start.strftime('%Y%m%d'),
            end_date=next_end.strftime('%Y%m%d'),
            session_number=next_night,
            submissions_open=True,
            active=True,
        )
        self.create_period(next_period)
        return {'created': True, 'reason': 'created', 'period': next_period}

    def auto_close_period_if_due(self, *, now: Optional[datetime] = None) -> dict:
        """Close submissions for the most recent open period if its end_date has passed.

        Returns:
            {
              'closed': bool,
              'reason': str,
              'period': PlayPeriod | None,
              'reminder_targets': list[dict]   # [{discordId, characterName}] of unclaimed players
            }
        """
        periods = self.get_all_periods()
        open_periods = [
            p for p in periods
            if p.submissions_open and p.active and p.end_date
        ]
        if not open_periods:
            return {'closed': False, 'reason': 'no_open_period', 'period': None, 'reminder_targets': []}

        open_periods.sort(key=lambda p: p.night_number)
        target = open_periods[-1]

        end_dt = _parse_yyyymmdd(target.end_date)
        if not end_dt:
            return {'closed': False, 'reason': 'invalid_end_date', 'period': None, 'reminder_targets': []}

        now_dt = now or datetime.now()
        # Close once end_date day has passed (i.e. now is strictly after end_date day)
        if now_dt.date() <= end_dt.date():
            return {'closed': False, 'reason': 'not_due_yet', 'period': None, 'reminder_targets': []}

        # Collect reminder targets before closing
        active_chars = self.get_active_characters()
        all_claims = self.get_all_claims()
        submitted = {
            str(c.character_name).strip().lower()
            for c in all_claims
            if str(c.play_period).strip() == target.period_label
            and str(c.status).strip().lower() != 'denied'
        }
        reminder_targets = [
            {'discordId': str(c.player_discord or '').strip(), 'characterName': c.character_name}
            for c in active_chars
            if c.player_discord
            and c.character_name.strip().lower() not in submitted
        ]

        self.update_period(target.period_label, {'submissions_open': 'FALSE'})
        return {
            'closed': True,
            'reason': 'closed',
            'period': target,
            'reminder_targets': reminder_targets,
        }

    # ── XP Claims ────────────────────────────────────────────────────────────

    def get_all_claims(self) -> list[XPClaim]:
        rows = DbXPClaim.query.order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_reviewed_claims_since(self, since_date_str: str) -> list[XPClaim]:
        """Return approved/denied claims with review_date >= since_date_str ('YYYYMMDD HH:MM:SS')."""
        rows = DbXPClaim.query.filter(
            func.lower(DbXPClaim.status).in_(['approved', 'denied']),
            DbXPClaim.review_date >= since_date_str,
        ).order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_pending_claims(self) -> list[XPClaim]:
        rows = DbXPClaim.query.filter(
            func.lower(DbXPClaim.status) == 'pending'
        ).order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_pending_claims_since(self, since_date_str: str) -> list[XPClaim]:
        """Return pending claims submitted at or after since_date_str ('YYYYMMDD HH:MM:SS')."""
        q = DbXPClaim.query.filter(func.lower(DbXPClaim.status) == 'pending')
        if since_date_str:
            q = q.filter(DbXPClaim.timestamp >= since_date_str)
        return [_row_to_claim(r) for r in q.order_by(DbXPClaim.id.asc()).all()]

    def get_claims_for_character(self, name: str) -> list[XPClaim]:
        rows = DbXPClaim.query.filter(
            func.lower(DbXPClaim.character_name) == name.lower()
        ).order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_claim_by_row(self, row_index: int) -> Optional[XPClaim]:
        row = db.session.get(DbXPClaim, row_index)
        return _row_to_claim(row) if row else None

    def approve_claim(self, row_index: int, approved_xp: int,
                      reviewer: str, notes: str = '') -> None:
        row = db.session.get(DbXPClaim, row_index)
        if not row:
            raise ValueError(f'Claim not found: {row_index}')
        row.status = 'Approved'
        row.approved_xp = approved_xp
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def deny_claim(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        row = db.session.get(DbXPClaim, row_index)
        if not row:
            raise ValueError(f'Claim not found: {row_index}')
        row.status = 'Denied'
        row.approved_xp = 0
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def reopen_claim_for_amendment(self, row_index: int, reviewer: str,
                                   notes: str = '') -> None:
        """Set a denied claim to 'Amend' so the player can edit and resubmit."""
        row = db.session.get(DbXPClaim, row_index)
        if not row:
            raise ValueError(f'Claim not found: {row_index}')
        row.status = 'Amend'
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def amend_claim(self, row_index: int, categories: dict) -> None:
        """Update claim evidence fields in-place and return it to Pending."""
        row = db.session.get(DbXPClaim, row_index)
        if not row:
            raise ValueError(f'Claim not found: {row_index}')
        cat_keys = [
            'posted_once', 'hunting_awakening', 'scene_with_another',
            'conflict', 'combat', 'unmitigated_stain', 'wildcard',
        ]
        try:
            wildcard_amount = int(categories.get('wildcard_amount', 1))
        except (TypeError, ValueError):
            wildcard_amount = 1
        xp_claimed = sum(1 for k in cat_keys if k in categories and k != 'wildcard')
        if 'wildcard' in categories:
            xp_claimed += wildcard_amount
        row.posted_once = 'posted_once' in categories
        row.posted_once_link = categories.get('posted_once', '')
        row.hunting_awakening = 'hunting_awakening' in categories
        row.hunting_awakening_link = categories.get('hunting_awakening', '')
        row.scene_with_another = 'scene_with_another' in categories
        row.scene_with_another_link = categories.get('scene_with_another', '')
        row.conflict = 'conflict' in categories
        row.conflict_link = categories.get('conflict', '')
        row.combat = 'combat' in categories
        row.combat_link = categories.get('combat', '')
        row.unmitigated_stain = 'unmitigated_stain' in categories
        row.unmitigated_stain_link = categories.get('unmitigated_stain', '')
        row.wildcard = 'wildcard' in categories
        row.wildcard_link = categories.get('wildcard', '')
        row.wildcard_reason = categories.get('wildcard_reason', '')
        row.wildcard_amount = wildcard_amount if 'wildcard' in categories else 0
        row.xp_claimed = xp_claimed
        row.status = 'Pending'
        row.timestamp = _now_str()
        row.approved_xp = 0
        row.reviewed_by = ''
        row.review_date = ''
        row.st_notes = ''
        db.session.commit()

    def submit_xp_claim(self, character_name: str, play_period: str,
                        categories: dict) -> None:
        """Submit a new XP claim.

        Raises ValueError if a non-denied claim already exists for this
        character + period.
        """
        # Duplicate check (case-insensitive)
        existing = DbXPClaim.query.filter(
            func.lower(DbXPClaim.character_name) == character_name.lower(),
            func.lower(DbXPClaim.play_period) == play_period.lower(),
        ).all()
        for c in existing:
            if (c.status or '').lower() not in ('denied',):
                raise ValueError(
                    f'An XP claim for {character_name} in "{play_period}" '
                    f'already exists (status: {c.status}).'
                )

        cat_keys = [
            'posted_once', 'hunting_awakening', 'scene_with_another',
            'conflict', 'combat', 'unmitigated_stain', 'wildcard',
        ]
        try:
            wildcard_amount = int(categories.get('wildcard_amount', 1))
        except (TypeError, ValueError):
            wildcard_amount = 1
        xp_claimed = sum(1 for k in cat_keys if k in categories and k != 'wildcard')
        if 'wildcard' in categories:
            xp_claimed += wildcard_amount

        row = DbXPClaim(
            timestamp=_now_str(),
            character_name=character_name,
            play_period=play_period,
            posted_once='posted_once' in categories,
            posted_once_link=categories.get('posted_once', ''),
            hunting_awakening='hunting_awakening' in categories,
            hunting_awakening_link=categories.get('hunting_awakening', ''),
            scene_with_another='scene_with_another' in categories,
            scene_with_another_link=categories.get('scene_with_another', ''),
            conflict='conflict' in categories,
            conflict_link=categories.get('conflict', ''),
            combat='combat' in categories,
            combat_link=categories.get('combat', ''),
            unmitigated_stain='unmitigated_stain' in categories,
            unmitigated_stain_link=categories.get('unmitigated_stain', ''),
            wildcard='wildcard' in categories,
            wildcard_link=categories.get('wildcard', ''),
            wildcard_reason=categories.get('wildcard_reason', ''),
            wildcard_amount=wildcard_amount if 'wildcard' in categories else 0,
            xp_claimed=xp_claimed,
            status='Pending',
            approved_xp=0,
            reviewed_by='',
            review_date='',
            st_notes='',
        )
        db.session.add(row)
        db.session.commit()

    # ── Spend Requests ───────────────────────────────────────────────────────

    def get_all_spends(self) -> list[SpendRequest]:
        rows = DbSpendRequest.query.order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_reviewed_spends_since(self, since_date_str: str) -> list[SpendRequest]:
        """Return approved/denied spends with review_date >= since_date_str ('YYYYMMDD HH:MM:SS')."""
        rows = DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.status).in_(['approved', 'denied']),
            DbSpendRequest.review_date >= since_date_str,
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_pending_spends(self) -> list[SpendRequest]:
        rows = DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.status) == 'pending'
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_pending_spends_since(self, since_date_str: str) -> list[SpendRequest]:
        """Return pending spends submitted at or after since_date_str ('YYYYMMDD HH:MM:SS')."""
        q = DbSpendRequest.query.filter(func.lower(DbSpendRequest.status) == 'pending')
        if since_date_str:
            q = q.filter(DbSpendRequest.timestamp >= since_date_str)
        return [_row_to_spend(r) for r in q.order_by(DbSpendRequest.id.asc()).all()]

    def get_spends_for_character(self, name: str) -> list[SpendRequest]:
        rows = DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.character_name) == name.lower()
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_spend_by_row(self, row_index: int) -> Optional[SpendRequest]:
        row = db.session.get(DbSpendRequest, row_index)
        return _row_to_spend(row) if row else None

    def approve_spend(self, row_index: int, verified_cost: int,
                      reviewer: str, notes: str = '', trait_name: str | None = None) -> None:
        """Approve a spend request.

        trait_name, when provided, corrects the stored trait name before the
        sheet patch is applied — lets staff resolve a "close match" warning
        (e.g. submitted as "Retainer" when the sheet already has "Retainer
        (Mortal Steve)") by fixing the name at approval time instead of
        needing to hand-edit the character's JSON afterward.
        """
        row = db.session.get(DbSpendRequest, row_index)
        if not row:
            raise ValueError(f'Spend request not found: {row_index}')
        if trait_name is not None:
            row.trait_name = trait_name.strip()[:100]
        row.status = 'Approved'
        row.verified_cost = verified_cost
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def deny_spend(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        row = db.session.get(DbSpendRequest, row_index)
        if not row:
            raise ValueError(f'Spend request not found: {row_index}')
        row.status = 'Denied'
        row.verified_cost = 0
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def reverse_spend(self, row_index: int, staff: str, notes: str = '') -> dict:
        """Reverse an approved spend request back to Pending, restoring its XP.

        Also attempts to roll back the character sheet patch that approval
        applied. Raises ValueError if the spend isn't found, isn't currently
        Approved, or has an already-approved dependent that must be reversed
        first. Returns {'spend': SpendRequest, 'sheet_reverted': bool}.
        """
        from app.character_sheet import reverse_character_sheet_patch

        row = db.session.get(DbSpendRequest, row_index)
        if not row:
            raise ValueError(f'Spend request not found: {row_index}')
        if row.status.lower() != 'approved':
            raise ValueError('Only an approved spend request can be reversed.')

        dependent = DbSpendRequest.query.filter(
            DbSpendRequest.depends_on == row_index,
            func.lower(DbSpendRequest.status) == 'approved',
        ).first()
        if dependent:
            raise ValueError(
                f'{dependent.character_name} / {dependent.trait_name} depends on this '
                'spend and is already approved — reverse it first.'
            )

        # Catch sequential purchases of the same trait that were submitted
        # independently (depends_on is optional in the submission UI) — e.g.
        # a 1→2 and a later 2→3 both approved with no declared link between
        # them. Without this, reversing the 1→2 spend would restore its XP
        # and leave the 2→3 spend approved on top of a purchase that's now
        # nominally un-approved.
        implicit_dependent = DbSpendRequest.query.filter(
            DbSpendRequest.id != row_index,
            func.lower(DbSpendRequest.character_name) == row.character_name.lower(),
            DbSpendRequest.spend_category == row.spend_category,
            func.lower(DbSpendRequest.trait_name) == (row.trait_name or '').lower(),
            DbSpendRequest.current_dots == row.new_dots,
            func.lower(DbSpendRequest.status) == 'approved',
        ).first()
        if implicit_dependent:
            raise ValueError(
                f'{implicit_dependent.character_name} / {implicit_dependent.trait_name} '
                f'({implicit_dependent.current_dots}→{implicit_dependent.new_dots}) was approved '
                'assuming this spend already applied — reverse it first.'
            )

        spend = _row_to_spend(row)
        sheet_reverted = reverse_character_sheet_patch(spend)

        row.status = 'Pending'
        row.verified_cost = 0
        row.reviewed_by = ''
        row.review_date = ''
        row.st_notes = notes
        db.session.commit()

        return {'spend': spend, 'sheet_reverted': sheet_reverted}

    def get_spend_dependents(self, row_index: int) -> list[SpendRequest]:
        """Return pending spends that declare they depend on row_index."""
        rows = DbSpendRequest.query.filter(
            DbSpendRequest.depends_on == row_index,
            func.lower(DbSpendRequest.status) == 'pending',
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def submit_spend_request(self, character_name: str, spend_category: str,
                             trait_name: str, current_dots: int,
                             new_dots: int, is_in_clan: bool,
                             justification: str, depends_on: int = 0,
                             power_name: str = '',
                             coterie_id: int | None = None) -> int:
        """Submit a new spend request. Returns the calculated XP cost.

        Raises ValueError if the cost calculation fails, or if a fixed-trait
        vital's current_dots contradicts the character sheet.
        """
        from app.character_sheet import character_vital_rating
        from app.xp_rules import calculate_xp_cost

        # Fixed-trait vitals (Humanity, Blood Potency) are stored on the sheet
        # as unambiguous scalars, so a client-supplied current_dots can and
        # must be checked against them rather than trusted. This is the shared
        # chokepoint: both player.submit_spend and player.convert_wish_list_item
        # land here, and the latter bypasses the route-level validation
        # entirely — a wish-list item left at the default 0->1 would otherwise
        # charge 10 XP to "raise" a Blood Potency 4 character and downgrade the
        # sheet to 1 on approval. A None rating means unknown (no imported
        # sheet, or the field is absent), so there is nothing to check against
        # and the spend proceeds as before.
        sheet_rating = character_vital_rating(character_name, spend_category)
        if sheet_rating is not None and sheet_rating != current_dots:
            raise ValueError(
                f'{spend_category} is {sheet_rating} on the character sheet, '
                f'but this request says {current_dots}. Re-submit with the '
                f'correct current rating.'
            )

        xp_cost = calculate_xp_cost(spend_category, current_dots, new_dots)

        row = DbSpendRequest(
            timestamp=_now_str(),
            character_name=character_name,
            spend_category=spend_category,
            trait_name=trait_name,
            power_name=power_name or '',
            current_dots=current_dots,
            new_dots=new_dots,
            xp_cost=xp_cost,
            is_in_clan=bool(is_in_clan),
            justification=justification,
            status='Pending',
            verified_cost=0,
            reviewed_by='',
            review_date='',
            st_notes='',
            depends_on=depends_on if depends_on else None,
            coterie_id=coterie_id or None,
        )
        db.session.add(row)
        db.session.commit()
        return xp_cost

    # ── Wish List ─────────────────────────────────────────────────────────────

    def get_wish_list_items(self, character_name: str) -> list[dict]:
        rows = DbWishListItem.query.filter(
            func.lower(DbWishListItem.character_name) == character_name.lower(),
        ).order_by(DbWishListItem.id.asc()).all()
        return [{
            'id': row.id,
            'spend_category': row.spend_category,
            'trait_name': row.trait_name,
            'power_name': row.power_name or '',
            'current_dots': row.current_dots,
            'new_dots': row.new_dots,
            'is_in_clan': bool(row.is_in_clan),
            'xp_cost': row.xp_cost,
            'justification': row.justification or '',
            'created_at': row.created_at or '',
        } for row in rows]

    def add_wish_list_item(self, character_name: str, spend_category: str,
                            trait_name: str, current_dots: int, new_dots: int,
                            is_in_clan: bool = False, power_name: str = '',
                            justification: str = '') -> dict:
        """Add a wish list item. Returns {'xp_cost': int, 'created_at': str}.

        Raises ValueError if the cost calculation fails.
        """
        from app.xp_rules import calculate_xp_cost
        xp_cost = calculate_xp_cost(spend_category, current_dots, new_dots)
        created_at = _now_str()

        row = DbWishListItem(
            character_name=character_name,
            spend_category=spend_category,
            trait_name=trait_name,
            power_name=power_name or '',
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=bool(is_in_clan),
            xp_cost=xp_cost,
            justification=justification,
            created_at=created_at,
        )
        db.session.add(row)
        db.session.commit()
        return {'xp_cost': xp_cost, 'created_at': created_at}

    def get_wish_list_item(self, item_id: int, character_name: str) -> Optional[DbWishListItem]:
        return DbWishListItem.query.filter(
            DbWishListItem.id == item_id,
            func.lower(DbWishListItem.character_name) == character_name.lower(),
        ).first()

    def delete_wish_list_item(self, item_id: int, character_name: str) -> bool:
        row = self.get_wish_list_item(item_id, character_name)
        if not row:
            return False
        db.session.delete(row)
        db.session.commit()
        return True

    # ── XP Totals (computed) ─────────────────────────────────────────────────

    def get_xp_totals(self, name: str) -> dict:
        """Compute XP totals for a character using SQL aggregates.

        Returns dict with: earned_xp, total_spends, ledger_awarded,
        ledger_spent, total_xp, available_xp, creation_xp
        """
        char_row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == name.lower()
        ).first()
        creation_xp = char_row.creation_xp or 0 if char_row else 0

        # Approved spend totals
        spend_result = db.session.query(
            func.coalesce(func.sum(DbSpendRequest.verified_cost), 0)
        ).filter(
            func.lower(DbSpendRequest.character_name) == name.lower(),
            func.lower(DbSpendRequest.status) == 'approved',
        ).scalar()
        total_spends = int(spend_result or 0)

        # Ledger aggregates
        ledger_result = db.session.query(
            func.coalesce(func.sum(DbLedgerEntry.awarded), 0).label('awarded'),
            func.coalesce(func.sum(DbLedgerEntry.spent), 0).label('spent'),
        ).filter(
            func.lower(DbLedgerEntry.character_name) == name.lower()
        ).first()
        ledger_awarded = int(ledger_result.awarded or 0)
        ledger_spent = int(ledger_result.spent or 0)

        total_xp = creation_xp + ledger_awarded
        available_xp = total_xp - total_spends - ledger_spent

        return {
            'creation_xp': creation_xp,
            'earned_xp': ledger_awarded,
            'total_spends': total_spends,
            'ledger_awarded': ledger_awarded,
            'ledger_spent': ledger_spent,
            'total_xp': total_xp,
            'available_xp': available_xp,
        }

    def get_dashboard_data(self) -> list[dict]:
        """Compute per-character XP summary using SQL aggregates.

        Returns a list of dicts with keys:
            character_name, player_discord, clan, active, creation_xp,
            earned_xp, total_xp, approved_spends, available_xp, last_submission
        """
        characters = DbCharacter.query.all()

        # Ledger aggregates per character
        ledger_agg = db.session.query(
            func.lower(DbLedgerEntry.character_name).label('name_lower'),
            func.coalesce(func.sum(DbLedgerEntry.awarded), 0).label('earned_xp'),
            func.coalesce(func.sum(DbLedgerEntry.spent), 0).label('ledger_spent'),
            func.max(DbLedgerEntry.timestamp).label('last_submission'),
        ).group_by(func.lower(DbLedgerEntry.character_name)).all()

        ledger_by_name: dict[str, dict] = {}
        for row in ledger_agg:
            ledger_by_name[row.name_lower] = {
                'earned_xp': int(row.earned_xp or 0),
                'ledger_spent': int(row.ledger_spent or 0),
                'last_submission': row.last_submission or '',
            }

        # Approved spend aggregates per character
        spend_agg = db.session.query(
            func.lower(DbSpendRequest.character_name).label('name_lower'),
            func.coalesce(func.sum(DbSpendRequest.verified_cost), 0).label('total_spends'),
        ).filter(
            func.lower(DbSpendRequest.status) == 'approved'
        ).group_by(func.lower(DbSpendRequest.character_name)).all()

        spend_by_name: dict[str, int] = {}
        for row in spend_agg:
            spend_by_name[row.name_lower] = int(row.total_spends or 0)

        result = []
        for char in characters:
            name_lower = char.character_name.lower()
            ledger_data = ledger_by_name.get(name_lower, {
                'earned_xp': 0, 'ledger_spent': 0, 'last_submission': ''
            })
            earned_xp = ledger_data['earned_xp']
            ledger_spent = ledger_data['ledger_spent']
            last_submission = ledger_data['last_submission']

            total_spends = spend_by_name.get(name_lower, 0)
            creation_xp = char.creation_xp or 0
            total_xp = creation_xp + earned_xp
            available_xp = total_xp - total_spends - ledger_spent

            result.append({
                'character_name': char.character_name,
                'player_discord': char.player_discord or '',
                'clan': char.clan or '',
                'active': bool(char.active),
                'creation_xp': creation_xp,
                'earned_xp': earned_xp,
                'total_xp': total_xp,
                'approved_spends': total_spends + ledger_spent,
                'available_xp': available_xp,
                'last_submission': last_submission,
            })

        # Sort active first, then by name
        result.sort(key=lambda r: (not r['active'], r['character_name']))
        return result

    # ── XP Ledger ────────────────────────────────────────────────────────────

    def get_ledger_for_character(self, name: str) -> list[LedgerEntry]:
        rows = DbLedgerEntry.query.filter(
            func.lower(DbLedgerEntry.character_name) == name.lower()
        ).all()
        entries = [_row_to_ledger(r) for r in rows]
        entries.sort(key=lambda e: _parse_ledger_date(e.date), reverse=True)
        return entries

    def add_ledger_entry(self, character_name: str, date: str,
                         awarded: int, spent: int, reason: str,
                         staff_user: str) -> None:
        row = DbLedgerEntry(
            character_name=character_name,
            date=date,
            awarded=awarded,
            spent=spent,
            reason=reason,
            entered_by=staff_user,
            timestamp=_now_str(),
        )
        db.session.add(row)
        db.session.commit()

    def delete_ledger_entry(self, row_index: int) -> None:
        """Delete a ledger entry by its DB id (row_index == id)."""
        row = db.session.get(DbLedgerEntry, row_index)
        if not row:
            raise ValueError(f'Ledger entry not found: {row_index}')
        db.session.delete(row)
        db.session.commit()

    def bulk_add_ledger_entries(self, character_name: str,
                                entries: list[dict],
                                staff_user: str) -> int:
        """Bulk-import ledger entries for a character.

        entries: list of dicts with keys: date, awarded, spent, reason
        Returns the number of rows added.
        """
        now = _now_str()
        rows = []
        for e in entries:
            rows.append(DbLedgerEntry(
                character_name=character_name,
                date=e['date'],
                awarded=e.get('awarded', 0),
                spent=e.get('spent', 0),
                reason=e.get('reason', ''),
                entered_by=staff_user,
                timestamp=now,
            ))
        if rows:
            db.session.add_all(rows)
            db.session.commit()
        return len(rows)

    # ── Ledger Import (delegates to Sheets for reading external spreadsheets) ─

    def preview_ledger_import(self, spreadsheet_url: str) -> list[dict]:
        """Read an external XP ledger spreadsheet.

        Delegates to the Sheets client which has the Google API credentials.
        Raises RuntimeError if no Sheets client is configured.
        """
        if self._sheets is None:
            raise RuntimeError('Sheets client required for import preview')
        return self._sheets.preview_ledger_import(spreadsheet_url)

    # ── Play-Period Import (delegates to Sheets) ──────────────────────────────

    def preview_period_import(self, spreadsheet_url: str) -> list[dict]:
        """Read tab names from a master XP spreadsheet.

        Delegates to the Sheets client which has the Google API credentials.
        Raises RuntimeError if no Sheets client is configured.
        """
        if self._sheets is None:
            raise RuntimeError('Sheets client required for import preview')
        return self._sheets.preview_period_import(spreadsheet_url)

    def bulk_add_periods(self, periods: list[dict], staff_user: str) -> int:
        """Bulk-import play periods, skipping any that already exist by night_number.

        periods: list from preview_period_import()
        Returns count of newly added periods.
        """
        existing_nights = {p.night_number for p in self.get_all_periods()}
        added = 0
        for p in periods:
            if p['night'] in existing_nights:
                continue
            label = p.get('label', f"Night {p['night']}")
            # Build a proper period label if it's just "Night N"
            if ' - ' not in label and p.get('start') and p.get('end'):
                try:
                    from datetime import datetime as _dt
                    sd = _dt.strptime(p['start'], '%Y%m%d')
                    ed = _dt.strptime(p['end'], '%Y%m%d')
                    label = f"Night {p['night']} - {_short_md(sd)} - {_short_md(ed)}"
                except (ValueError, KeyError):
                    pass
            row = DbPlayPeriod(
                period_label=label,
                night_number=p['night'],
                start_date=p.get('start', ''),
                end_date=p.get('end', ''),
                session_number=p['night'],
                submissions_open=False,
                active=True,
            )
            db.session.add(row)
            existing_nights.add(p['night'])
            added += 1
        if added:
            db.session.commit()
        return added

    # ── Audit Log ────────────────────────────────────────────────────────────

    def log_action(self, staff_user: str, action_type: str,
                   target: str, details: str) -> None:
        row = DbAuditLog(
            timestamp=_now_str(),
            staff_user=staff_user,
            action_type=action_type,
            target_character=target,
            details=details,
        )
        db.session.add(row)
        db.session.commit()

    def get_all_audit_entries(self) -> list[AuditEntry]:
        """Every audit entry, oldest first — for Sheets reconciliation."""
        rows = DbAuditLog.query.order_by(DbAuditLog.id.asc()).all()
        return [
            AuditEntry(
                timestamp=r.timestamp or '',
                staff_user=r.staff_user or '',
                action_type=r.action_type or '',
                target_character=r.target_character or '',
                details=r.details or '',
            )
            for r in rows
        ]

    def get_audit_log(self, limit: int = 100) -> list[AuditEntry]:
        rows = DbAuditLog.query.order_by(DbAuditLog.id.desc()).limit(limit).all()
        return [
            AuditEntry(
                timestamp=r.timestamp or '',
                staff_user=r.staff_user or '',
                action_type=r.action_type or '',
                target_character=r.target_character or '',
                details=r.details or '',
            )
            for r in rows
        ]

    def get_xp_timeline(self, name: str) -> dict | None:
        """Return a character's full XP history as a unified, sorted timeline.

        Combines approved claims, approved spends, and ledger entries into a
        single chronological list with a running balance. Pending and denied
        items are returned separately for reference.

        Each event dict has:
          kind        – 'claim' | 'spend' | 'ledger'
          sort_key    – comparable string for chronological ordering
          date_display – human-readable date string
          delta       – signed XP change (positive = gain, negative = cost)
          description – short summary line
          detail      – secondary info (reviewer, period, etc.)
          row_id      – DB row id for linking
          status      – 'approved' | 'pending' | 'denied' | 'amend'
        """
        char = self.get_character(name)
        if not char:
            return None

        claims = self.get_claims_for_character(name)
        spends = self.get_spends_for_character(name)
        ledger = self.get_ledger_for_character(name)

        def _sort_key(raw: str) -> str:
            """Normalize YYYYMMDD[ HH:MM:SS] to a sortable string."""
            return (raw or '').strip().replace(' ', 'T') or '00000000'

        def _display_date(raw: str) -> str:
            """Convert YYYYMMDD[ HH:MM:SS] to YYYY-MM-DD."""
            s = (raw or '').strip()[:8]
            if len(s) == 8 and s.isdigit():
                return f'{s[:4]}-{s[4:6]}-{s[6:]}'
            return s or '—'

        approved_events: list[dict] = []
        pending_claims: list[XPClaim] = []
        pending_spends: list[SpendRequest] = []
        other_claims: list[XPClaim] = []
        other_spends: list[SpendRequest] = []

        for c in claims:
            st = c.status.strip().lower()
            if st == 'approved':
                approved_events.append({
                    'kind': 'claim',
                    'sort_key': _sort_key(c.review_date),
                    'date_display': _display_date(c.review_date),
                    'delta': c.approved_xp or c.xp_claimed or 0,
                    'description': f'XP Claim — {c.play_period}',
                    'detail': f'Approved by {c.reviewed_by}' if c.reviewed_by else '',
                    'row_id': c.row_index,
                    'status': 'approved',
                })
            elif st == 'pending':
                pending_claims.append(c)
            else:
                other_claims.append(c)

        for s in spends:
            st = s.status.strip().lower()
            if st == 'approved':
                cost = s.verified_cost or s.xp_cost or 0
                approved_events.append({
                    'kind': 'spend',
                    'sort_key': _sort_key(s.review_date),
                    'date_display': _display_date(s.review_date),
                    'delta': -cost,
                    'description': f'Spend — {s.trait_name} ({s.current_dots}→{s.new_dots})',
                    'detail': f'{s.spend_category} · Approved by {s.reviewed_by}' if s.reviewed_by else s.spend_category,
                    'row_id': s.row_index,
                    'status': 'approved',
                })
            elif st == 'pending':
                pending_spends.append(s)
            else:
                other_spends.append(s)

        for e in ledger:
            delta = (e.awarded or 0) - (e.spent or 0)
            approved_events.append({
                'kind': 'ledger',
                'sort_key': _sort_key(e.date),
                'date_display': _display_date(e.date),
                'delta': delta,
                'description': e.reason or '(no reason)',
                'detail': f'Entered by {e.entered_by}' if e.entered_by else '',
                'row_id': e.row_index,
                'status': 'approved',
            })

        approved_events.sort(key=lambda ev: ev['sort_key'])

        xp = self.get_xp_totals(name)
        return {
            'character': char,
            'creation_xp': char.creation_xp or 0,
            'events': approved_events,
            'pending_claims': pending_claims,
            'pending_spends': pending_spends,
            'other_claims': other_claims,
            'other_spends': other_spends,
            'summary': xp,
        }

    # ── Background Blanking ──────────────────────────────────────────────────

    def get_character_backgrounds(self, name: str) -> list[dict]:
        rows = DbCharacterBackground.query.filter(
            func.lower(DbCharacterBackground.character_name) == name.lower(),
        ).order_by(DbCharacterBackground.background_name.asc()).all()
        result: list[dict] = []
        for row in rows:
            total = max(0, int(row.dots_total or 0))
            blanked = max(0, min(total, int(row.dots_blanked or 0)))
            available = max(0, total - blanked)
            result.append({
                'id': row.id,
                'background_name': row.background_name,
                'dots_total': total,
                'dots_blanked': blanked,
                'dots_available': available,
                'blanked': blanked > 0,
                'blanked_at_night_number': row.blanked_at_night_number,
                'release_night_number': row.release_night_number,
                'updated_at': row.updated_at or '',
                'updated_by': row.updated_by or '',
            })
        return result

    def get_boons_for_character(self, name: str) -> list[dict]:
        """Boons where this character is either creditor or debtor. Read-only —
        all mutations happen through the bot's /prestation command."""
        from sqlalchemy import or_ as _or

        char = DbCharacter.query.filter(func.lower(DbCharacter.character_name) == name.lower()).first()
        if not char:
            return []

        rows = DbBoon.query.filter(
            _or(DbBoon.creditor_character_id == char.id, DbBoon.debtor_character_id == char.id)
        ).order_by(DbBoon.created_at.desc()).all()

        result: list[dict] = []
        for row in rows:
            direction = 'owed_to_me' if row.creditor_character_id == char.id else 'i_owe'
            counterparty = row.debtor if direction == 'owed_to_me' else row.creditor
            result.append({
                'id': row.id,
                'direction': direction,
                'counterparty_name': counterparty.character_name,
                'tier': row.tier,
                'reason': row.reason or '',
                'status': row.status,
                'created_at': row.created_at,
            })
        return result

    def set_character_background(self, character_name: str, background_name: str, dots_total: int, updated_by: str) -> dict:
        bg_name = str(background_name or '').strip()[:120]
        if not bg_name:
            raise ValueError('Background name is required.')
        bg_key = _background_key(bg_name)
        if not bg_key:
            raise ValueError('Background name is required.')

        row = DbCharacterBackground.query.filter(
            func.lower(DbCharacterBackground.character_name) == character_name.lower(),
            DbCharacterBackground.background_key == bg_key,
        ).first()
        total = max(0, int(dots_total))
        if not row:
            if total == 0:
                return {'deleted': False, 'background': bg_name}
            row = DbCharacterBackground(
                character_name=character_name,
                background_key=bg_key,
                background_name=bg_name,
                dots_total=total,
                dots_blanked=0,
                blanked_at_night_number=None,
                release_night_number=None,
                updated_at=_now_str(),
                updated_by=updated_by[:100],
            )
            db.session.add(row)
            db.session.commit()
            return {'deleted': False, 'background': row.background_name}

        if total == 0:
            db.session.delete(row)
            db.session.commit()
            return {'deleted': True, 'background': row.background_name}

        row.background_name = bg_name
        row.dots_total = total
        row.dots_blanked = max(0, min(total, int(row.dots_blanked or 0)))
        if row.dots_blanked == 0:
            row.blanked_at_night_number = None
            row.release_night_number = None
        row.updated_at = _now_str()
        row.updated_by = updated_by[:100]
        db.session.commit()
        return {'deleted': False, 'background': row.background_name}

    def blank_character_background(
        self,
        character_name: str,
        background_name: str,
        dots_to_blank: int,
        current_night_number: int,
        updated_by: str,
    ) -> dict:
        bg_key = _background_key(background_name)
        if not bg_key:
            raise ValueError('Background name is required.')
        if current_night_number <= 0:
            raise ValueError('Current night number is required for blanking.')

        row = DbCharacterBackground.query.filter(
            func.lower(DbCharacterBackground.character_name) == character_name.lower(),
            DbCharacterBackground.background_key == bg_key,
        ).first()
        if not row:
            raise ValueError(f'Background "{background_name}" is not tracked for {character_name}.')

        dots = int(dots_to_blank)
        if dots <= 0:
            raise ValueError('Dots to blank must be at least 1.')
        total = max(0, int(row.dots_total or 0))
        blanked = max(0, min(total, int(row.dots_blanked or 0)))
        available = total - blanked
        if dots > available:
            raise ValueError(
                f'Cannot blank {dots} dot(s) from {row.background_name}; only {available} available.',
            )

        # If an older blank is already due this night (or earlier), release it
        # before adding the new blank so one-night expiry is preserved.
        existing_release_night = int(row.release_night_number or 0)
        if blanked > 0 and existing_release_night > 0 and existing_release_night <= current_night_number:
            row.dots_blanked = 0
            row.blanked_at_night_number = None
            row.release_night_number = None
            blanked = 0

        row.dots_blanked = blanked + dots
        row.blanked_at_night_number = current_night_number
        row.release_night_number = (
            next_night_after_downtime(current_night_number)
            or current_night_number + 1
        )
        row.updated_at = _now_str()
        row.updated_by = updated_by[:100]
        db.session.commit()
        return {
            'character_name': row.character_name,
            'background_name': row.background_name,
            'dots_blanked_now': dots,
            'dots_total': row.dots_total,
            'dots_blanked_total': row.dots_blanked,
            'dots_available': max(0, row.dots_total - row.dots_blanked),
            'release_night_number': row.release_night_number,
        }

    def release_due_background_blanks(self, current_night_number: int) -> list[dict]:
        if current_night_number <= 0:
            return []

        rows = DbCharacterBackground.query.filter(
            DbCharacterBackground.dots_blanked > 0,
            DbCharacterBackground.release_night_number.isnot(None),
            DbCharacterBackground.release_night_number <= current_night_number,
        ).all()
        if not rows:
            return []

        releases: list[dict] = []
        for row in rows:
            released = int(row.dots_blanked or 0)
            if released <= 0:
                continue
            char = DbCharacter.query.filter(
                func.lower(DbCharacter.character_name) == row.character_name.lower(),
            ).first()
            releases.append({
                'character_name': row.character_name,
                'background_name': row.background_name,
                'dots_released': released,
                'player_discord': (char.player_discord if char else '') or '',
            })
            row.dots_blanked = 0
            row.blanked_at_night_number = None
            row.release_night_number = None
            row.updated_at = _now_str()
            row.updated_by = 'system:release'
        db.session.commit()
        return releases

    # ── Reminder Preferences ──────────────────────────────────────────────────

    def get_all_reminder_prefs(self) -> dict:
        """Return all reminder preferences as a dict keyed by discord_id."""
        rows = DbReminderPreference.query.all()
        return {
            r.discord_id: {
                'optOut': r.opt_out,
                'snoozeUntilEpoch': r.snooze_until_epoch,
            }
            for r in rows
        }

    def set_reminder_pref(self, discord_id: str, opt_out: bool, snooze_until_epoch: int) -> None:
        """Upsert reminder preference for a Discord user."""
        row = DbReminderPreference.query.filter_by(discord_id=discord_id).first()
        if row:
            row.opt_out = opt_out
            row.snooze_until_epoch = snooze_until_epoch
            row.updated_at = _now_str()
        else:
            row = DbReminderPreference(
                discord_id=discord_id,
                opt_out=opt_out,
                snooze_until_epoch=snooze_until_epoch,
                updated_at=_now_str(),
            )
            db.session.add(row)
        db.session.commit()

    # ── Sheets sync error log ─────────────────────────────────────────────────

    def get_all_ledger_entries(self) -> list[LedgerEntry]:
        rows = DbLedgerEntry.query.order_by(DbLedgerEntry.id.asc()).all()
        return [_row_to_ledger(r) for r in rows]

    def log_sheets_sync_error(self, operation: str, error: str, details: str = '') -> None:
        from datetime import timezone as _tz
        row = DbSheetsSyncError(
            timestamp=datetime.now(_tz.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
            operation=operation,
            error=error,
            details=details,
        )
        db.session.add(row)
        db.session.commit()

    def get_recent_sync_errors(self, limit: int = 100, show_dismissed: bool = False) -> list[dict]:
        query = DbSheetsSyncError.query
        if not show_dismissed:
            query = query.filter(DbSheetsSyncError.dismissed == False)  # noqa: E712
        rows = query.order_by(DbSheetsSyncError.id.desc()).limit(limit).all()
        return [
            {
                'id': r.id,
                'timestamp': r.timestamp,
                'operation': r.operation,
                'error': r.error,
                'details': r.details,
                'dismissed': r.dismissed,
            }
            for r in rows
        ]
