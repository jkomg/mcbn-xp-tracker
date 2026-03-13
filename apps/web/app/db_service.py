"""DBService — SQLAlchemy-backed drop-in replacement for SheetsClient.

All method signatures match SheetsClient. Returns the same dataclasses
from app.models so blueprints need minimal changes.

Phase 1: Primary reads/writes go to DB. Google Sheets is a write-through
mirror for new inserts only (handled by SheetsSyncWorker in the caller).
Status updates (approve/deny) are NOT mirrored to Sheets in this phase.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func

from app.db import db, DbCharacter, DbPlayPeriod, DbXPClaim, DbSpendRequest, DbLedgerEntry, DbAuditLog
from app.models import Character, PlayPeriod, XPClaim, SpendRequest, LedgerEntry, AuditEntry


def _now_str() -> str:
    """Return current UTC timestamp in YYYYMMDD HH:MM:SS format."""
    return datetime.utcnow().strftime('%Y%m%d %H:%M:%S')


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


def _row_to_character(row: DbCharacter) -> Character:
    return Character(
        character_name=row.character_name,
        player_discord=row.player_discord or '',
        player_discord_name=row.player_discord_name or '',
        clan=row.clan or '',
        age_category=row.age_category or '',
        sect=row.sect or '',
        active=bool(row.active),
        creation_xp=row.creation_xp or 0,
        enemy=row.enemy or '',
        date_added=row.date_added or '',
        notes=row.notes or '',
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

    def deactivate_character(self, name: str) -> None:
        self.update_character(name, {'active': 'FALSE'})

    def delete_character(self, name: str) -> None:
        row = DbCharacter.query.filter(
            func.lower(DbCharacter.character_name) == name.lower()
        ).first()
        if not row:
            raise ValueError(f'Character not found: {name}')
        db.session.delete(row)
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

    # ── XP Claims ────────────────────────────────────────────────────────────

    def get_all_claims(self) -> list[XPClaim]:
        rows = DbXPClaim.query.order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_pending_claims(self) -> list[XPClaim]:
        rows = DbXPClaim.query.filter(
            func.lower(DbXPClaim.status) == 'pending'
        ).order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_claims_for_character(self, name: str) -> list[XPClaim]:
        rows = DbXPClaim.query.filter(
            func.lower(DbXPClaim.character_name) == name.lower()
        ).order_by(DbXPClaim.id.asc()).all()
        return [_row_to_claim(r) for r in rows]

    def get_claim_by_row(self, row_index: int) -> Optional[XPClaim]:
        row = DbXPClaim.query.get(row_index)
        return _row_to_claim(row) if row else None

    def approve_claim(self, row_index: int, approved_xp: int,
                      reviewer: str, notes: str = '') -> None:
        row = DbXPClaim.query.get(row_index)
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
        row = DbXPClaim.query.get(row_index)
        if not row:
            raise ValueError(f'Claim not found: {row_index}')
        row.status = 'Denied'
        row.approved_xp = 0
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
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

    def get_pending_spends(self) -> list[SpendRequest]:
        rows = DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.status) == 'pending'
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_spends_for_character(self, name: str) -> list[SpendRequest]:
        rows = DbSpendRequest.query.filter(
            func.lower(DbSpendRequest.character_name) == name.lower()
        ).order_by(DbSpendRequest.id.asc()).all()
        return [_row_to_spend(r) for r in rows]

    def get_spend_by_row(self, row_index: int) -> Optional[SpendRequest]:
        row = DbSpendRequest.query.get(row_index)
        return _row_to_spend(row) if row else None

    def approve_spend(self, row_index: int, verified_cost: int,
                      reviewer: str, notes: str = '') -> None:
        row = DbSpendRequest.query.get(row_index)
        if not row:
            raise ValueError(f'Spend request not found: {row_index}')
        row.status = 'Approved'
        row.verified_cost = verified_cost
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def deny_spend(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        row = DbSpendRequest.query.get(row_index)
        if not row:
            raise ValueError(f'Spend request not found: {row_index}')
        row.status = 'Denied'
        row.verified_cost = 0
        row.reviewed_by = reviewer
        row.review_date = _now_str()
        row.st_notes = notes
        db.session.commit()

    def submit_spend_request(self, character_name: str, spend_category: str,
                             trait_name: str, current_dots: int,
                             new_dots: int, is_in_clan: bool,
                             justification: str) -> int:
        """Submit a new spend request. Returns the calculated XP cost.

        Raises ValueError if the cost calculation fails.
        """
        from app.xp_rules import calculate_xp_cost
        xp_cost = calculate_xp_cost(spend_category, current_dots, new_dots)

        row = DbSpendRequest(
            timestamp=_now_str(),
            character_name=character_name,
            spend_category=spend_category,
            trait_name=trait_name,
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
        )
        db.session.add(row)
        db.session.commit()
        return xp_cost

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
        # Sort by date descending (newest first)
        entries.sort(key=lambda e: e.date, reverse=True)
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
        row = DbLedgerEntry.query.get(row_index)
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
