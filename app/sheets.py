"""Google Sheets API client for MCbN XP Tracker.

Wraps gspread to provide typed access to the six-tab spreadsheet
that serves as the application's database.

Tabs:
    - Roster: Character master list
    - Play Periods: Night schedule and status
    - XP Responses: Form submissions for XP claims
    - Spend Requests: Form submissions for XP spends
    - Audit Log: Staff action history
    - Dashboard: Optional calculated summary (formulas)
"""

import json
import time
from datetime import datetime
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

from .models import (
    Character, PlayPeriod, XPClaim, SpendRequest, AuditEntry
)


# Google API scopes
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]

# Sheet tab names
TAB_ROSTER = 'Roster'
TAB_PERIODS = 'Play Periods'
TAB_XP_RESPONSES = 'XP Responses'
TAB_SPEND_REQUESTS = 'Spend Requests'
TAB_AUDIT_LOG = 'Audit Log'

# Header rows for each tab
ROSTER_HEADERS = [
    'character_name', 'player_discord', 'clan', 'age_category', 'sect',
    'active', 'creation_xp', 'enemy', 'date_added', 'notes',
]

PERIODS_HEADERS = [
    'period_label', 'night_number', 'start_date', 'end_date',
    'session_number', 'submissions_open', 'active',
]

XP_RESPONSES_HEADERS = [
    'timestamp', 'character_name', 'play_period',
    'posted_once', 'posted_once_link',
    'hunting_awakening', 'hunting_awakening_link',
    'scene_with_another', 'scene_with_another_link',
    'conflict', 'conflict_link',
    'combat', 'combat_link',
    'unmitigated_stain', 'unmitigated_stain_link',
    'xp_claimed', 'status', 'approved_xp',
    'reviewed_by', 'review_date', 'st_notes',
]

SPEND_REQUESTS_HEADERS = [
    'timestamp', 'character_name', 'spend_category', 'trait_name',
    'current_dots', 'new_dots', 'xp_cost', 'is_in_clan',
    'justification', 'status', 'verified_cost',
    'reviewed_by', 'review_date', 'st_notes',
]

AUDIT_LOG_HEADERS = [
    'timestamp', 'staff_user', 'action_type', 'target_character', 'details',
]


def _parse_bool(value: str) -> bool:
    """Convert sheet cell value to boolean."""
    if isinstance(value, bool):
        return value
    return str(value).strip().upper() in ('TRUE', 'YES', '1')


def _parse_int(value, default: int = 0) -> int:
    """Convert sheet cell value to integer."""
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return default


def _now_str() -> str:
    """Return current timestamp as a string for sheet cells."""
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


class _Cache:
    """Simple in-memory cache with TTL."""

    def __init__(self, ttl: int = 30):
        self.ttl = ttl
        self._data: dict = {}
        self._timestamps: dict[str, float] = {}

    def get(self, key: str):
        ts = self._timestamps.get(key, 0)
        if time.time() - ts < self.ttl:
            return self._data.get(key)
        return None

    def set(self, key: str, value):
        self._data[key] = value
        self._timestamps[key] = time.time()

    def invalidate(self, key: str = None):
        if key:
            self._data.pop(key, None)
            self._timestamps.pop(key, None)
        else:
            self._data.clear()
            self._timestamps.clear()


class SheetsClient:
    """Primary data access layer for the MCbN XP Tracker."""

    def __init__(self, credentials_file: str, spreadsheet_id: str,
                 cache_ttl: int = 30, credentials_json: str = ''):
        # Cloud Run: load credentials from JSON env var; local: from file
        if credentials_json:
            info = json.loads(credentials_json)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        else:
            creds = Credentials.from_service_account_file(
                credentials_file, scopes=SCOPES
            )
        self.gc = gspread.authorize(creds)
        self.spreadsheet = self.gc.open_by_key(spreadsheet_id)
        self._cache = _Cache(ttl=cache_ttl)
        self._worksheets: dict[str, gspread.Worksheet] = {}

    def _ws(self, tab_name: str) -> gspread.Worksheet:
        """Get or cache a worksheet handle."""
        if tab_name not in self._worksheets:
            self._worksheets[tab_name] = self.spreadsheet.worksheet(tab_name)
        return self._worksheets[tab_name]

    def _get_all_rows(self, tab_name: str) -> list[dict]:
        """Read all rows from a tab as dicts, with caching."""
        cached = self._cache.get(tab_name)
        if cached is not None:
            return cached
        ws = self._ws(tab_name)
        rows = ws.get_all_records()
        self._cache.set(tab_name, rows)
        return rows

    # ── Setup ────────────────────────────────────────────────────────────────

    def setup_sheets(self):
        """Create tabs and headers if they don't exist. Safe to run multiple times."""
        existing = [ws.title for ws in self.spreadsheet.worksheets()]

        tabs = {
            TAB_ROSTER: ROSTER_HEADERS,
            TAB_PERIODS: PERIODS_HEADERS,
            TAB_XP_RESPONSES: XP_RESPONSES_HEADERS,
            TAB_SPEND_REQUESTS: SPEND_REQUESTS_HEADERS,
            TAB_AUDIT_LOG: AUDIT_LOG_HEADERS,
        }

        for tab_name, headers in tabs.items():
            if tab_name not in existing:
                ws = self.spreadsheet.add_worksheet(
                    title=tab_name, rows=1000, cols=len(headers)
                )
                ws.append_row(headers)
                self._worksheets[tab_name] = ws
            else:
                ws = self._ws(tab_name)
                # Check if headers exist
                first_row = ws.row_values(1)
                if not first_row:
                    ws.append_row(headers)

    # ── Roster ───────────────────────────────────────────────────────────────

    def get_all_characters(self) -> list[Character]:
        rows = self._get_all_rows(TAB_ROSTER)
        return [self._row_to_character(r) for r in rows if r.get('character_name')]

    def get_active_characters(self) -> list[Character]:
        return [c for c in self.get_all_characters() if c.active]

    def get_character(self, name: str) -> Optional[Character]:
        for c in self.get_all_characters():
            if c.character_name.lower() == name.lower():
                return c
        return None

    def add_character(self, char: Character) -> None:
        ws = self._ws(TAB_ROSTER)
        ws.append_row([
            char.character_name, char.player_discord, char.clan,
            char.age_category, char.sect, str(char.active).upper(),
            char.creation_xp, char.enemy,
            char.date_added or _now_str(), char.notes,
        ])
        self._cache.invalidate(TAB_ROSTER)

    def update_character(self, name: str, updates: dict) -> None:
        ws = self._ws(TAB_ROSTER)
        rows = self._get_all_rows(TAB_ROSTER)
        for i, row in enumerate(rows):
            if row.get('character_name', '').lower() == name.lower():
                row_num = i + 2  # +1 for header, +1 for 1-indexed
                for key, value in updates.items():
                    if key in ROSTER_HEADERS:
                        col = ROSTER_HEADERS.index(key) + 1
                        ws.update_cell(row_num, col, value)
                self._cache.invalidate(TAB_ROSTER)
                return
        raise ValueError(f'Character not found: {name}')

    def deactivate_character(self, name: str) -> None:
        self.update_character(name, {'active': 'FALSE'})

    def _row_to_character(self, row: dict) -> Character:
        return Character(
            character_name=str(row.get('character_name', '')),
            player_discord=str(row.get('player_discord', '')),
            clan=str(row.get('clan', '')),
            age_category=str(row.get('age_category', '')),
            sect=str(row.get('sect', '')),
            active=_parse_bool(row.get('active', 'FALSE')),
            creation_xp=_parse_int(row.get('creation_xp', 0)),
            enemy=str(row.get('enemy', '')),
            date_added=str(row.get('date_added', '')),
            notes=str(row.get('notes', '')),
        )

    # ── Play Periods ─────────────────────────────────────────────────────────

    def get_all_periods(self) -> list[PlayPeriod]:
        rows = self._get_all_rows(TAB_PERIODS)
        return [self._row_to_period(r) for r in rows if r.get('period_label')]

    def get_active_periods(self) -> list[PlayPeriod]:
        return [p for p in self.get_all_periods() if p.active]

    def create_period(self, period: PlayPeriod) -> None:
        ws = self._ws(TAB_PERIODS)
        ws.append_row([
            period.period_label, period.night_number,
            period.start_date, period.end_date,
            period.session_number,
            str(period.submissions_open).upper(),
            str(period.active).upper(),
        ])
        self._cache.invalidate(TAB_PERIODS)

    def update_period(self, label: str, updates: dict) -> None:
        ws = self._ws(TAB_PERIODS)
        rows = self._get_all_rows(TAB_PERIODS)
        for i, row in enumerate(rows):
            if row.get('period_label') == label:
                row_num = i + 2
                for key, value in updates.items():
                    if key in PERIODS_HEADERS:
                        col = PERIODS_HEADERS.index(key) + 1
                        ws.update_cell(row_num, col, value)
                self._cache.invalidate(TAB_PERIODS)
                return
        raise ValueError(f'Period not found: {label}')

    def get_next_night_number(self) -> int:
        periods = self.get_all_periods()
        if not periods:
            return 1
        return max(p.night_number for p in periods) + 1

    def _row_to_period(self, row: dict) -> PlayPeriod:
        return PlayPeriod(
            period_label=str(row.get('period_label', '')),
            night_number=_parse_int(row.get('night_number', 0)),
            start_date=str(row.get('start_date', '')),
            end_date=str(row.get('end_date', '')),
            session_number=_parse_int(row.get('session_number', 0)),
            submissions_open=_parse_bool(row.get('submissions_open', 'TRUE')),
            active=_parse_bool(row.get('active', 'TRUE')),
        )

    # ── XP Claims ────────────────────────────────────────────────────────────

    def get_all_claims(self) -> list[XPClaim]:
        rows = self._get_all_rows(TAB_XP_RESPONSES)
        return [self._row_to_claim(i, r) for i, r in enumerate(rows)
                if r.get('character_name')]

    def get_pending_claims(self) -> list[XPClaim]:
        return [c for c in self.get_all_claims()
                if c.status.lower() == 'pending']

    def get_claims_for_character(self, name: str) -> list[XPClaim]:
        return [c for c in self.get_all_claims()
                if c.character_name.lower() == name.lower()]

    def get_claim_by_row(self, row_index: int) -> Optional[XPClaim]:
        claims = self.get_all_claims()
        for c in claims:
            if c.row_index == row_index:
                return c
        return None

    def approve_claim(self, row_index: int, approved_xp: int,
                      reviewer: str, notes: str = '') -> None:
        ws = self._ws(TAB_XP_RESPONSES)
        row_num = row_index + 2  # +1 header, +1 for 1-indexed

        # Columns: status=17, approved_xp=18, reviewed_by=19,
        #          review_date=20, st_notes=21
        status_col = XP_RESPONSES_HEADERS.index('status') + 1
        ws.update_cell(row_num, status_col, 'Approved')
        ws.update_cell(row_num, status_col + 1, approved_xp)
        ws.update_cell(row_num, status_col + 2, reviewer)
        ws.update_cell(row_num, status_col + 3, _now_str())
        ws.update_cell(row_num, status_col + 4, notes)
        self._cache.invalidate(TAB_XP_RESPONSES)

    def deny_claim(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        ws = self._ws(TAB_XP_RESPONSES)
        row_num = row_index + 2

        status_col = XP_RESPONSES_HEADERS.index('status') + 1
        ws.update_cell(row_num, status_col, 'Denied')
        ws.update_cell(row_num, status_col + 1, 0)
        ws.update_cell(row_num, status_col + 2, reviewer)
        ws.update_cell(row_num, status_col + 3, _now_str())
        ws.update_cell(row_num, status_col + 4, notes)
        self._cache.invalidate(TAB_XP_RESPONSES)

    def _row_to_claim(self, index: int, row: dict) -> XPClaim:
        return XPClaim(
            row_index=index,
            timestamp=str(row.get('timestamp', '')),
            character_name=str(row.get('character_name', '')),
            play_period=str(row.get('play_period', '')),
            posted_once=_parse_bool(row.get('posted_once', False)),
            posted_once_link=str(row.get('posted_once_link', '')),
            hunting_awakening=_parse_bool(
                row.get('hunting_awakening', False)),
            hunting_awakening_link=str(
                row.get('hunting_awakening_link', '')),
            scene_with_another=_parse_bool(
                row.get('scene_with_another', False)),
            scene_with_another_link=str(
                row.get('scene_with_another_link', '')),
            conflict=_parse_bool(row.get('conflict', False)),
            conflict_link=str(row.get('conflict_link', '')),
            combat=_parse_bool(row.get('combat', False)),
            combat_link=str(row.get('combat_link', '')),
            unmitigated_stain=_parse_bool(
                row.get('unmitigated_stain', False)),
            unmitigated_stain_link=str(
                row.get('unmitigated_stain_link', '')),
            xp_claimed=_parse_int(row.get('xp_claimed', 0)),
            status=str(row.get('status', 'Pending')),
            approved_xp=_parse_int(row.get('approved_xp', 0)),
            reviewed_by=str(row.get('reviewed_by', '')),
            review_date=str(row.get('review_date', '')),
            st_notes=str(row.get('st_notes', '')),
        )

    # ── Spend Requests ───────────────────────────────────────────────────────

    def get_all_spends(self) -> list[SpendRequest]:
        rows = self._get_all_rows(TAB_SPEND_REQUESTS)
        return [self._row_to_spend(i, r) for i, r in enumerate(rows)
                if r.get('character_name')]

    def get_pending_spends(self) -> list[SpendRequest]:
        return [s for s in self.get_all_spends()
                if s.status.lower() == 'pending']

    def get_spends_for_character(self, name: str) -> list[SpendRequest]:
        return [s for s in self.get_all_spends()
                if s.character_name.lower() == name.lower()]

    def get_spend_by_row(self, row_index: int) -> Optional[SpendRequest]:
        spends = self.get_all_spends()
        for s in spends:
            if s.row_index == row_index:
                return s
        return None

    def approve_spend(self, row_index: int, verified_cost: int,
                      reviewer: str, notes: str = '') -> None:
        ws = self._ws(TAB_SPEND_REQUESTS)
        row_num = row_index + 2

        status_col = SPEND_REQUESTS_HEADERS.index('status') + 1
        ws.update_cell(row_num, status_col, 'Approved')
        ws.update_cell(row_num, status_col + 1, verified_cost)
        ws.update_cell(row_num, status_col + 2, reviewer)
        ws.update_cell(row_num, status_col + 3, _now_str())
        ws.update_cell(row_num, status_col + 4, notes)
        self._cache.invalidate(TAB_SPEND_REQUESTS)

    def deny_spend(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        ws = self._ws(TAB_SPEND_REQUESTS)
        row_num = row_index + 2

        status_col = SPEND_REQUESTS_HEADERS.index('status') + 1
        ws.update_cell(row_num, status_col, 'Denied')
        ws.update_cell(row_num, status_col + 1, 0)
        ws.update_cell(row_num, status_col + 2, reviewer)
        ws.update_cell(row_num, status_col + 3, _now_str())
        ws.update_cell(row_num, status_col + 4, notes)
        self._cache.invalidate(TAB_SPEND_REQUESTS)

    def _row_to_spend(self, index: int, row: dict) -> SpendRequest:
        return SpendRequest(
            row_index=index,
            timestamp=str(row.get('timestamp', '')),
            character_name=str(row.get('character_name', '')),
            spend_category=str(row.get('spend_category', '')),
            trait_name=str(row.get('trait_name', '')),
            current_dots=_parse_int(row.get('current_dots', 0)),
            new_dots=_parse_int(row.get('new_dots', 0)),
            xp_cost=_parse_int(row.get('xp_cost', 0)),
            is_in_clan=_parse_bool(row.get('is_in_clan', False)),
            justification=str(row.get('justification', '')),
            status=str(row.get('status', 'Pending')),
            verified_cost=_parse_int(row.get('verified_cost', 0)),
            reviewed_by=str(row.get('reviewed_by', '')),
            review_date=str(row.get('review_date', '')),
            st_notes=str(row.get('st_notes', '')),
        )

    # ── Dashboard (computed) ─────────────────────────────────────────────────

    def get_dashboard_data(self) -> list[dict]:
        """Compute per-character XP summary by joining roster, claims, spends."""
        characters = self.get_all_characters()
        all_claims = self.get_all_claims()
        all_spends = self.get_all_spends()

        result = []
        for char in characters:
            # Sum approved XP claims
            char_claims = [
                c for c in all_claims
                if c.character_name.lower() == char.character_name.lower()
                and c.status.lower() == 'approved'
            ]
            earned_xp = sum(c.approved_xp for c in char_claims)

            # Sum approved spends
            char_spends = [
                s for s in all_spends
                if s.character_name.lower() == char.character_name.lower()
                and s.status.lower() == 'approved'
            ]
            total_spends = sum(s.verified_cost for s in char_spends)

            total_xp = char.creation_xp + earned_xp
            available_xp = total_xp - total_spends

            # Find last submission date
            last_sub = ''
            if char_claims:
                last_sub = max(c.timestamp for c in char_claims)

            result.append({
                'character_name': char.character_name,
                'player_discord': char.player_discord,
                'clan': char.clan,
                'active': char.active,
                'creation_xp': char.creation_xp,
                'earned_xp': earned_xp,
                'total_xp': total_xp,
                'approved_spends': total_spends,
                'available_xp': available_xp,
                'last_submission': last_sub,
            })

        # Sort active first, then by name
        result.sort(key=lambda r: (not r['active'], r['character_name']))
        return result

    # ── XP Adjustments ────────────────────────────────────────────────────────

    def add_xp_adjustment(self, character_name: str, xp_amount: int,
                          reason: str, staff_user: str) -> None:
        """Add a manual XP adjustment as a synthetic claim row.

        Positive amounts grant XP; negative amounts remove XP.
        The row is auto-approved so it takes effect immediately.
        """
        ws = self._ws(TAB_XP_RESPONSES)
        now = _now_str()
        # Build a row matching XP_RESPONSES_HEADERS:
        # timestamp, character_name, play_period,
        # posted_once, link, hunting, link, scene, link,
        # conflict, link, combat, link, stain, link,
        # xp_claimed, status, approved_xp, reviewed_by, review_date, st_notes
        row = [
            now,                          # timestamp
            character_name,               # character_name
            'Staff Adjustment',           # play_period
            '', '', '', '', '', '',       # 6 category checkboxes + links (empty)
            '', '', '', '', '', '',
            xp_amount,                    # xp_claimed
            'Approved',                   # status (auto-approved)
            xp_amount,                    # approved_xp
            staff_user,                   # reviewed_by
            now,                          # review_date
            f'STAFF ADJUSTMENT: {reason}',  # st_notes
        ]
        ws.append_row(row)
        self._cache.invalidate(TAB_XP_RESPONSES)

    def add_spend_adjustment(self, character_name: str, xp_amount: int,
                             reason: str, staff_user: str) -> None:
        """Add a manual spend adjustment as a synthetic spend row.

        Positive amounts add to spends (reduce available XP);
        negative amounts refund spends (increase available XP).
        The row is auto-approved so it takes effect immediately.
        """
        ws = self._ws(TAB_SPEND_REQUESTS)
        now = _now_str()
        # Build a row matching SPEND_REQUESTS_HEADERS:
        # timestamp, character_name, spend_category, trait_name,
        # current_dots, new_dots, xp_cost, is_in_clan,
        # justification, status, verified_cost,
        # reviewed_by, review_date, st_notes
        row = [
            now,                          # timestamp
            character_name,               # character_name
            'Staff Adjustment',           # spend_category
            'Manual Adjustment',          # trait_name
            0,                            # current_dots
            0,                            # new_dots
            xp_amount,                    # xp_cost
            '',                           # is_in_clan
            reason,                       # justification
            'Approved',                   # status (auto-approved)
            xp_amount,                    # verified_cost
            staff_user,                   # reviewed_by
            now,                          # review_date
            f'STAFF ADJUSTMENT: {reason}',  # st_notes
        ]
        ws.append_row(row)
        self._cache.invalidate(TAB_SPEND_REQUESTS)

    # ── Audit Log ────────────────────────────────────────────────────────────

    def log_action(self, staff_user: str, action_type: str,
                   target: str, details: str) -> None:
        ws = self._ws(TAB_AUDIT_LOG)
        ws.append_row([_now_str(), staff_user, action_type, target, details])
        self._cache.invalidate(TAB_AUDIT_LOG)

    def get_audit_log(self, limit: int = 100) -> list[AuditEntry]:
        rows = self._get_all_rows(TAB_AUDIT_LOG)
        entries = [
            AuditEntry(
                timestamp=str(r.get('timestamp', '')),
                staff_user=str(r.get('staff_user', '')),
                action_type=str(r.get('action_type', '')),
                target_character=str(r.get('target_character', '')),
                details=str(r.get('details', '')),
            )
            for r in rows if r.get('timestamp')
        ]
        # Return most recent first
        entries.reverse()
        return entries[:limit]
