"""Google Sheets API client for MCbN XP Tracker.

Wraps gspread to provide typed access to the six-tab spreadsheet
that serves as the application's database.

Tabs:
    - Roster: Character master list
    - Play Periods: Night schedule and status
    - XP Responses: XP claim submissions
    - Spend Requests: XP spend submissions
    - XP Ledger: Authoritative record of all XP awarded/spent
    - Audit Log: Staff action history
"""

import json
import logging
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import gspread
from gspread.exceptions import APIError
from google.oauth2.service_account import Credentials

from .models import (
    Character, PlayPeriod, XPClaim, SpendRequest, LedgerEntry, AuditEntry
)


def _normalize_header(header: str) -> str:
    """Convert any header to snake_case, then apply alias mapping.

    Legacy headers used long descriptive names like
    'Is this an in-clan Discipline?' while our code expects 'is_in_clan'.
    This function converts to snake_case, then maps known header
    variants to the canonical key name our code uses.
    """
    s = header.strip().lower()
    # Replace hyphens, slashes, dots with spaces first
    s = re.sub(r'[-/.]', ' ', s)
    # Remove anything that isn't alphanumeric or space/underscore
    s = re.sub(r'[^a-z0-9 _]', '', s)
    # Collapse whitespace and convert to underscores
    s = re.sub(r'\s+', '_', s.strip())
    # Collapse multiple underscores
    s = re.sub(r'_+', '_', s)
    # Map known header variants to canonical keys
    return _HEADER_ALIASES.get(s, s)


# Maps legacy header variants → canonical keys used in code.
# Only entries that don't already match need to be listed.
_HEADER_ALIASES = {
    # ── Spend Requests tab ──────────────────────────────────────────
    'new_dots_desired_rating': 'new_dots',
    'is_this_an_in_clan_discipline': 'is_in_clan',
    'justification_rp_rationale': 'justification',
    # ── XP Responses tab ────────────────────────────────────────────
    'al': 'character_name',  # Legacy truncated header
    'posted_at_least_once_during_this_play_period': 'posted_once',
    'post_link_posted_at_least_once': 'posted_once_link',
    'posted_a_hunting_and_or_awakening_scene': 'hunting_awakening',
    'post_link_hunting_awakening_scene': 'hunting_awakening_link',
    'participated_in_a_scene_with_another_character': 'scene_with_another',
    'post_link_scene_with_another_character': 'scene_with_another_link',
    'engaged_in_conflict_with_another_character': 'conflict',
    'post_link_conflict_with_another_character': 'conflict_link',
    'engaged_in_combat_with_another_character': 'combat',
    'post_link_combat_with_another_character': 'combat_link',
    'took_an_unmitigated_stain': 'unmitigated_stain',
    'post_link_unmitigated_stain': 'unmitigated_stain_link',
}


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
TAB_XP_LEDGER = 'XP Ledger'
TAB_AUDIT_LOG = 'Audit Log'

# Header rows for each tab
ROSTER_HEADERS = [
    'character_name', 'player_discord', 'player_discord_name', 'clan',
    'age_category', 'sect', 'active', 'creation_xp', 'enemy',
    'date_added', 'notes',
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
    'wildcard', 'wildcard_link', 'wildcard_reason', 'wildcard_amount',
    'xp_claimed', 'status', 'approved_xp',
    'reviewed_by', 'review_date', 'st_notes',
]

SPEND_REQUESTS_HEADERS = [
    'timestamp', 'character_name', 'spend_category', 'trait_name',
    'current_dots', 'new_dots', 'xp_cost', 'is_in_clan',
    'justification', 'status', 'verified_cost',
    'reviewed_by', 'review_date', 'st_notes',
]

XP_LEDGER_HEADERS = [
    'character_name', 'date', 'awarded', 'spent', 'reason',
    'entered_by', 'timestamp',
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
    return datetime.now().strftime('%Y%m%d %H:%M:%S')


def _parse_yyyymmdd(value: str) -> Optional[datetime]:
    raw = str(value or '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y%m%d')
    except ValueError:
        return None


def _normalize_status(value, default: str = 'Pending') -> str:
    """Normalize status strings from Sheets (trim whitespace, keep casing)."""
    text = str(value if value is not None else '').strip()
    return text or default


def _short_md(value: datetime) -> str:
    return f'{value.month}/{value.day}'


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
                 cache_ttl: int = 30, credentials_json: str = '',
                 validate_headers_on_startup: bool = False,
                 startup_max_retries: int = 5,
                 startup_retry_base_seconds: float = 1.5):
        # Cloud Run: load credentials from JSON env var; local: from file
        if credentials_json:
            info = json.loads(credentials_json)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        else:
            creds = Credentials.from_service_account_file(
                credentials_file, scopes=SCOPES
            )
        self.gc = gspread.authorize(creds)
        self.spreadsheet = self._open_with_retry(
            spreadsheet_id=spreadsheet_id,
            max_retries=max(0, startup_max_retries),
            retry_base_seconds=max(0.1, startup_retry_base_seconds),
        )
        self._cache = _Cache(ttl=cache_ttl)
        self._worksheets: dict[str, gspread.Worksheet] = {}
        self._next_row_cache: dict[str, int] = {}

        # Optional expensive startup check (off by default to reduce quota pressure).
        if validate_headers_on_startup:
            self._validate_headers()

    @staticmethod
    def _is_retryable_api_error(exc: Exception) -> bool:
        text = str(exc)
        retry_tokens = (
            '[429]',
            'quota exceeded',
            'resource_exhausted',
            '[500]',
            '[502]',
            '[503]',
            '[504]',
            'backend error',
        )
        lowered = text.lower()
        return any(token in lowered for token in retry_tokens)

    def _open_with_retry(
        self,
        spreadsheet_id: str,
        max_retries: int,
        retry_base_seconds: float,
    ):
        log = logging.getLogger(__name__)
        attempt = 0
        while True:
            try:
                return self.gc.open_by_key(spreadsheet_id)
            except APIError as exc:
                if attempt >= max_retries or not self._is_retryable_api_error(exc):
                    raise
                delay = retry_base_seconds * (2 ** attempt)
                log.warning(
                    'Sheets open_by_key retrying after API error (attempt %d/%d, delay %.1fs): %s',
                    attempt + 1,
                    max_retries,
                    delay,
                    exc,
                )
                time.sleep(delay)
                attempt += 1

    def _validate_headers(self):
        """Check all sheet headers on startup. Log warnings for mismatches.

        Each raw header is run through _normalize_header (which applies
        snake_case conversion + alias mapping) and compared to the
        expected header list.  A mismatch means queries against that
        column will silently return empty data.
        """
        tabs = {
            TAB_ROSTER: ROSTER_HEADERS,
            TAB_PERIODS: PERIODS_HEADERS,
            TAB_XP_RESPONSES: XP_RESPONSES_HEADERS,
            TAB_SPEND_REQUESTS: SPEND_REQUESTS_HEADERS,
            TAB_XP_LEDGER: XP_LEDGER_HEADERS,
            TAB_AUDIT_LOG: AUDIT_LOG_HEADERS,
        }
        import logging
        log = logging.getLogger(__name__)

        for tab_name, expected in tabs.items():
            try:
                ws = self._ws(tab_name)
                raw = ws.row_values(1)
            except Exception as exc:
                log.error('HEADER CHECK: tab %r not found: %s', tab_name, exc)
                continue

            normalized = [_normalize_header(h) for h in raw]

            if len(normalized) < len(expected):
                log.warning(
                    'HEADER CHECK: %s has %d columns, expected %d. '
                    'Raw: %s',
                    tab_name, len(normalized), len(expected), raw,
                )

            for i, exp_key in enumerate(expected):
                if i >= len(normalized):
                    log.warning(
                        'HEADER CHECK: %s column %d missing — '
                        'expected %r',
                        tab_name, i + 1, exp_key,
                    )
                elif normalized[i] != exp_key:
                    log.warning(
                        'HEADER CHECK: %s column %d mismatch — '
                        'got %r (raw: %r), expected %r',
                        tab_name, i + 1, normalized[i], raw[i], exp_key,
                    )

        log.info('Sheet header validation complete.')

    def _ws(self, tab_name: str) -> gspread.Worksheet:
        """Get or cache a worksheet handle."""
        if tab_name not in self._worksheets:
            self._worksheets[tab_name] = self.spreadsheet.worksheet(tab_name)
        return self._worksheets[tab_name]

    def _safe_append_row(self, tab_name: str, row: list) -> None:
        """Append a row by writing to an explicit row number.

        gspread's append_row uses the Sheets API table-range auto-detection,
        which can misidentify the last occupied row and *overwrite* data —
        especially on sheets with few rows.  This helper reads the current
        row count and writes to the next empty row, eliminating ambiguity.
        """
        ws = self._ws(tab_name)
        next_row = self._get_next_row(tab_name)
        # Write the whole row starting at column A
        ws.update(f'A{next_row}', [row], value_input_option='RAW')
        self._next_row_cache[tab_name] = next_row + 1
        self._cache.invalidate(tab_name)

    def _get_next_row(self, tab_name: str) -> int:
        """Return the next write row for a tab, with lightweight caching."""
        cached = self._next_row_cache.get(tab_name)
        if cached:
            return cached
        ws = self._ws(tab_name)
        # Column A is required for every tab in this app.
        col_a = ws.col_values(1)
        next_row = len(col_a) + 1
        self._next_row_cache[tab_name] = next_row
        return next_row

    def _get_all_rows(self, tab_name: str) -> list[dict]:
        """Read all rows from a tab as dicts, with caching.

        Headers are normalized to snake_case so that legacy headers
        like 'Character Name' map to the 'character_name' keys our
        code expects.
        """
        cached = self._cache.get(tab_name)
        if cached is not None:
            return cached
        ws = self._ws(tab_name)
        rows = ws.get_all_records()
        # Normalize dict keys to snake_case
        normalized = []
        for row in rows:
            normalized.append({
                _normalize_header(k): v for k, v in row.items()
            })
        self._cache.set(tab_name, normalized)
        return normalized

    # ── Setup ────────────────────────────────────────────────────────────────

    def setup_sheets(self):
        """Create tabs and headers if they don't exist. Safe to run multiple times."""
        existing = [ws.title for ws in self.spreadsheet.worksheets()]

        tabs = {
            TAB_ROSTER: ROSTER_HEADERS,
            TAB_PERIODS: PERIODS_HEADERS,
            TAB_XP_RESPONSES: XP_RESPONSES_HEADERS,
            TAB_SPEND_REQUESTS: SPEND_REQUESTS_HEADERS,
            TAB_XP_LEDGER: XP_LEDGER_HEADERS,
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
        self._safe_append_row(TAB_ROSTER, [
            char.character_name, char.player_discord,
            char.player_discord_name, char.clan,
            char.age_category, char.sect, str(char.active).upper(),
            char.creation_xp, char.enemy,
            char.date_added or _now_str(), char.notes,
        ])

    def update_character(self, name: str, updates: dict) -> None:
        ws = self._ws(TAB_ROSTER)
        rows = self._get_all_rows(TAB_ROSTER)
        for i, row in enumerate(rows):
            if row.get('character_name', '').lower() == name.lower():
                row_num = i + 2  # +1 for header, +1 for 1-indexed
                requests = []
                for key, value in updates.items():
                    if key in ROSTER_HEADERS:
                        col = ROSTER_HEADERS.index(key) + 1
                        requests.append({
                            'range': gspread.utils.rowcol_to_a1(row_num, col),
                            'values': [[value]],
                        })
                if requests:
                    ws.batch_update(requests, value_input_option='RAW')
                self._cache.invalidate(TAB_ROSTER)
                return
        raise ValueError(f'Character not found: {name}')

    def get_characters_by_discord_id(self, discord_id: str) -> list[Character]:
        """Return all characters linked to the given numeric Discord user ID."""
        return [
            c for c in self.get_all_characters()
            if c.player_discord == str(discord_id)
        ]

    def get_unlinked_characters(self) -> list[Character]:
        """Return active characters with no Discord ID linked."""
        return [
            c for c in self.get_active_characters()
            if not c.player_discord.strip()
        ]

    def link_character_to_discord(self, character_name: str, discord_id: str,
                                  discord_name: str) -> None:
        """Set the Discord ID and display name on a character's roster entry."""
        self.update_character(character_name, {
            'player_discord': discord_id,
            'player_discord_name': discord_name,
        })

    def deactivate_character(self, name: str) -> None:
        self.update_character(name, {'active': 'FALSE'})

    def delete_character(self, name: str) -> None:
        """Hard-delete a character row from the Roster sheet.

        Does NOT cascade to Claims, Spends, or Ledger — those records are
        retained for audit purposes as orphaned rows.
        """
        ws = self._ws(TAB_ROSTER)
        rows = self._get_all_rows(TAB_ROSTER)
        for i, row in enumerate(rows):
            if row.get('character_name', '').lower() == name.lower():
                row_num = i + 2  # +1 header, +1 for 1-indexed
                ws.delete_rows(row_num)
                self._cache.invalidate(TAB_ROSTER)
                self._next_row_cache.pop(TAB_ROSTER, None)
                return
        raise ValueError(f'Character not found: {name}')

    def _row_to_character(self, row: dict) -> Character:
        return Character(
            character_name=str(row.get('character_name', '')),
            player_discord=str(row.get('player_discord', '')),
            player_discord_name=str(row.get('player_discord_name', '')),
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
        self._safe_append_row(TAB_PERIODS, [
            period.period_label, period.night_number,
            period.start_date, period.end_date,
            period.session_number,
            str(period.submissions_open).upper(),
            str(period.active).upper(),
        ])

    def update_period(self, label: str, updates: dict) -> None:
        ws = self._ws(TAB_PERIODS)
        rows = self._get_all_rows(TAB_PERIODS)
        for i, row in enumerate(rows):
            if row.get('period_label') == label:
                row_num = i + 2
                requests = []
                for key, value in updates.items():
                    if key in PERIODS_HEADERS:
                        col = PERIODS_HEADERS.index(key) + 1
                        requests.append({
                            'range': gspread.utils.rowcol_to_a1(row_num, col),
                            'values': [[value]],
                        })
                if requests:
                    ws.batch_update(requests, value_input_option='RAW')
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
        rows = self._get_all_rows(TAB_XP_RESPONSES)
        return [self._row_to_claim(i, r) for i, r in enumerate(rows)
                if r.get('character_name')]

    def get_pending_claims(self) -> list[XPClaim]:
        return [c for c in self.get_all_claims()
                if c.status.strip().lower() == 'pending']

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
        end_col = status_col + 4
        ws.update(
            f'{gspread.utils.rowcol_to_a1(row_num, status_col)}:'
            f'{gspread.utils.rowcol_to_a1(row_num, end_col)}',
            [['Approved', approved_xp, reviewer, _now_str(), notes]],
            value_input_option='RAW',
        )
        self._cache.invalidate(TAB_XP_RESPONSES)

    def deny_claim(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        ws = self._ws(TAB_XP_RESPONSES)
        row_num = row_index + 2

        status_col = XP_RESPONSES_HEADERS.index('status') + 1
        end_col = status_col + 4
        ws.update(
            f'{gspread.utils.rowcol_to_a1(row_num, status_col)}:'
            f'{gspread.utils.rowcol_to_a1(row_num, end_col)}',
            [['Denied', 0, reviewer, _now_str(), notes]],
            value_input_option='RAW',
        )
        self._cache.invalidate(TAB_XP_RESPONSES)

    def submit_xp_claim(self, character_name: str, play_period: str,
                         categories: dict[str, str]) -> None:
        """Submit a new XP claim from the player portal.

        Args:
            character_name: Exact character name.
            play_period: Period label (e.g., "Night 53 - 1/27 - 2/8").
            categories: Dict mapping category key to link URL.
                Keys: posted_once, hunting_awakening, scene_with_another,
                      conflict, combat, unmitigated_stain.
                Empty string for link means claimed but no link provided.

        Raises:
            ValueError: If a non-denied claim already exists for this
                        character + period.
        """
        # Duplicate check
        existing = self.get_claims_for_character(character_name)
        for c in existing:
            if (c.play_period == play_period
                    and c.status.lower() not in ('denied',)):
                raise ValueError(
                    f'An XP claim for {character_name} in "{play_period}" '
                    f'already exists (status: {c.status}).'
                )

        cat_keys = [
            'posted_once', 'hunting_awakening', 'scene_with_another',
            'conflict', 'combat', 'unmitigated_stain', 'wildcard',
        ]
        wildcard_amount = _parse_int(categories.get('wildcard_amount', 1))
        # Standard categories count as 1 each; wildcard uses its amount
        xp_claimed = sum(1 for k in cat_keys if k in categories and k != 'wildcard')
        if 'wildcard' in categories:
            xp_claimed += wildcard_amount

        row = [
            _now_str(),                                      # timestamp
            character_name,                                  # character_name
            play_period,                                     # play_period
        ]
        for key in cat_keys:
            claimed = key in categories
            link = categories.get(key, '')
            row.append('TRUE' if claimed else 'FALSE')      # category bool
            row.append(link)                                 # category link
            if key == 'wildcard':
                row.append(categories.get('wildcard_reason', ''))
                row.append(wildcard_amount if claimed else 0)
        row.extend([
            xp_claimed,                                      # xp_claimed
            'Pending',                                       # status
            '',                                              # approved_xp
            '',                                              # reviewed_by
            '',                                              # review_date
            '',                                              # st_notes
        ])

        self._safe_append_row(TAB_XP_RESPONSES, row)

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
            wildcard=_parse_bool(row.get('wildcard', False)),
            wildcard_link=str(row.get('wildcard_link', '')),
            wildcard_reason=str(row.get('wildcard_reason', '')),
            wildcard_amount=_parse_int(row.get('wildcard_amount', 0)),
            xp_claimed=_parse_int(row.get('xp_claimed', 0)),
            status=_normalize_status(row.get('status', 'Pending')),
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
                if s.status.strip().lower() == 'pending']

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
        end_col = status_col + 4
        ws.update(
            f'{gspread.utils.rowcol_to_a1(row_num, status_col)}:'
            f'{gspread.utils.rowcol_to_a1(row_num, end_col)}',
            [['Approved', verified_cost, reviewer, _now_str(), notes]],
            value_input_option='RAW',
        )
        self._cache.invalidate(TAB_SPEND_REQUESTS)

    def deny_spend(self, row_index: int, reviewer: str,
                   notes: str = '') -> None:
        ws = self._ws(TAB_SPEND_REQUESTS)
        row_num = row_index + 2

        status_col = SPEND_REQUESTS_HEADERS.index('status') + 1
        end_col = status_col + 4
        ws.update(
            f'{gspread.utils.rowcol_to_a1(row_num, status_col)}:'
            f'{gspread.utils.rowcol_to_a1(row_num, end_col)}',
            [['Denied', 0, reviewer, _now_str(), notes]],
            value_input_option='RAW',
        )
        self._cache.invalidate(TAB_SPEND_REQUESTS)

    def submit_spend_request(self, character_name: str, spend_category: str,
                              trait_name: str, current_dots: int,
                              new_dots: int, is_in_clan: bool,
                              justification: str) -> int:
        """Submit a new spend request from the player portal.

        Auto-calculates XP cost using V5 rules.

        Returns:
            The calculated XP cost.

        Raises:
            ValueError: If the cost calculation fails (invalid category/dots).
        """
        from .xp_rules import calculate_xp_cost

        xp_cost = calculate_xp_cost(spend_category, current_dots, new_dots)

        row = [
            _now_str(),                                      # timestamp
            character_name,                                  # character_name
            spend_category,                                  # spend_category
            trait_name,                                      # trait_name
            current_dots,                                    # current_dots
            new_dots,                                        # new_dots
            xp_cost,                                         # xp_cost
            'TRUE' if is_in_clan else 'FALSE',               # is_in_clan
            justification,                                   # justification
            'Pending',                                       # status
            '',                                              # verified_cost
            '',                                              # reviewed_by
            '',                                              # review_date
            '',                                              # st_notes
        ]

        self._safe_append_row(TAB_SPEND_REQUESTS, row)
        return xp_cost

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
            status=_normalize_status(row.get('status', 'Pending')),
            verified_cost=_parse_int(row.get('verified_cost', 0)),
            reviewed_by=str(row.get('reviewed_by', '')),
            review_date=str(row.get('review_date', '')),
            st_notes=str(row.get('st_notes', '')),
        )

    # ── XP Totals (computed) ─────────────────────────────────────────────────

    def get_xp_totals(self, name: str) -> dict:
        """Compute XP totals for a character from spends and ledger.

        Approved claims are written to the ledger on approval, so the
        ledger is the single source of truth for all awarded XP.

        Returns dict with: earned_xp, total_spends, ledger_awarded,
        ledger_spent, total_xp, available_xp
        """
        char = self.get_character(name)
        creation_xp = char.creation_xp if char else 0

        spends = self.get_spends_for_character(name)
        ledger = self.get_ledger_for_character(name)

        total_spends = sum(
            s.verified_cost for s in spends if s.status.lower() == 'approved'
        )

        ledger_awarded = sum(e.awarded for e in ledger)
        ledger_spent = sum(e.spent for e in ledger)

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
        """Compute per-character XP summary by joining roster, spends, and ledger.

        The ledger is the single source of truth for all awarded XP
        (including approved claims, which are written to the ledger on
        approval).
        """
        characters = self.get_all_characters()
        all_claims = self.get_all_claims()
        all_spends = self.get_all_spends()
        all_ledger = self._get_all_rows(TAB_XP_LEDGER)

        approved_claim_last_ts: dict[str, str] = {}
        for claim in all_claims:
            if claim.status.lower() != 'approved':
                continue
            key = claim.character_name.lower()
            last_ts = approved_claim_last_ts.get(key)
            if last_ts is None or claim.timestamp > last_ts:
                approved_claim_last_ts[key] = claim.timestamp

        approved_spend_totals: dict[str, int] = defaultdict(int)
        for spend in all_spends:
            if spend.status.lower() == 'approved':
                approved_spend_totals[spend.character_name.lower()] += spend.verified_cost

        ledger_totals: dict[str, dict[str, int]] = defaultdict(
            lambda: {'awarded': 0, 'spent': 0}
        )
        for row in all_ledger:
            key = str(row.get('character_name', '')).lower()
            if not key:
                continue
            ledger_totals[key]['awarded'] += _parse_int(row.get('awarded', 0))
            ledger_totals[key]['spent'] += _parse_int(row.get('spent', 0))

        result = []
        for char in characters:
            name_lower = char.character_name.lower()
            total_spends = approved_spend_totals[name_lower]
            ledger_awarded = ledger_totals[name_lower]['awarded']
            ledger_spent = ledger_totals[name_lower]['spent']

            total_xp = char.creation_xp + ledger_awarded
            available_xp = total_xp - total_spends - ledger_spent

            # Find last approved claim submission date
            last_sub = approved_claim_last_ts.get(name_lower, '')

            result.append({
                'character_name': char.character_name,
                'player_discord': char.player_discord,
                'clan': char.clan,
                'active': char.active,
                'creation_xp': char.creation_xp,
                'earned_xp': ledger_awarded,
                'total_xp': total_xp,
                'approved_spends': total_spends + ledger_spent,
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
            '', '', '', '', '', '',       # posted_once thru scene_with_another (bool+link)
            '', '', '', '', '', '',       # conflict thru unmitigated_stain (bool+link)
            '', '', '', '',                # wildcard (bool+link+reason+amount)
            xp_amount,                    # xp_claimed
            'Approved',                   # status (auto-approved)
            xp_amount,                    # approved_xp
            staff_user,                   # reviewed_by
            now,                          # review_date
            f'STAFF ADJUSTMENT: {reason}',  # st_notes
        ]
        self._safe_append_row(TAB_XP_RESPONSES, row)

    def add_spend_adjustment(self, character_name: str, xp_amount: int,
                             reason: str, staff_user: str) -> None:
        """Add a manual spend adjustment as a synthetic spend row.

        Positive amounts add to spends (reduce available XP);
        negative amounts refund spends (increase available XP).
        The row is auto-approved so it takes effect immediately.
        """
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
        self._safe_append_row(TAB_SPEND_REQUESTS, row)

    # ── XP Ledger ──────────────────────────────────────────────────────────

    def get_ledger_for_character(self, name: str) -> list[LedgerEntry]:
        """Get all ledger entries for a character, sorted by date desc."""
        rows = self._get_all_rows(TAB_XP_LEDGER)
        entries = []
        for i, r in enumerate(rows):
            if str(r.get('character_name', '')).lower() == name.lower():
                entries.append(LedgerEntry(
                    row_index=i,
                    character_name=str(r.get('character_name', '')),
                    date=str(r.get('date', '')),
                    awarded=_parse_int(r.get('awarded', 0)),
                    spent=_parse_int(r.get('spent', 0)),
                    reason=str(r.get('reason', '')),
                    entered_by=str(r.get('entered_by', '')),
                    timestamp=str(r.get('timestamp', '')),
                ))
        # Sort by date descending (newest first)
        entries.sort(key=lambda e: e.date, reverse=True)
        return entries

    def get_all_ledger_entries(self) -> list[LedgerEntry]:
        """Get every row in the XP Ledger tab, regardless of character."""
        rows = self._get_all_rows(TAB_XP_LEDGER)
        entries = []
        for i, r in enumerate(rows):
            entries.append(LedgerEntry(
                row_index=i,
                character_name=str(r.get('character_name', '')),
                date=str(r.get('date', '')),
                awarded=_parse_int(r.get('awarded', 0)),
                spent=_parse_int(r.get('spent', 0)),
                reason=str(r.get('reason', '')),
                entered_by=str(r.get('entered_by', '')),
                timestamp=str(r.get('timestamp', '')),
            ))
        return entries

    def add_ledger_entry(self, character_name: str, date: str,
                         awarded: int, spent: int, reason: str,
                         staff_user: str) -> None:
        """Add a new entry to the XP Ledger tab."""
        self._safe_append_row(TAB_XP_LEDGER, [
            character_name, date, awarded, spent, reason,
            staff_user, _now_str(),
        ])

    def delete_ledger_entry(self, row_index: int) -> None:
        """Delete a ledger entry by row index."""
        ws = self._ws(TAB_XP_LEDGER)
        ws.delete_rows(row_index + 2)  # +1 header, +1 for 1-indexed
        self._cache.invalidate(TAB_XP_LEDGER)
        self._next_row_cache.pop(TAB_XP_LEDGER, None)

    # ── Ledger Import ─────────────────────────────────────────────────────

    def preview_ledger_import(self, spreadsheet_url: str) -> list[dict]:
        """Read an external XP ledger spreadsheet and return parseable rows.

        Looks for columns containing Date / Awarded / Spent / Reason
        by scanning the first 5 rows for a header-like row.  Accepts
        both full URLs and bare spreadsheet IDs.

        Returns a list of dicts:
            [{'date': '...', 'awarded': int, 'spent': int, 'reason': '...'}, ...]
        """
        import re as _re

        # Extract spreadsheet ID from URL
        m = _re.search(r'/d/([a-zA-Z0-9_-]+)', spreadsheet_url)
        sheet_id = m.group(1) if m else spreadsheet_url.strip()

        # Extract gid if present (for specific worksheet)
        gid_match = _re.search(r'[?&]gid=(\d+)', spreadsheet_url)
        gid = int(gid_match.group(1)) if gid_match else None

        try:
            ss = self.gc.open_by_key(sheet_id)
        except Exception as e:
            if '400' in str(e) or 'not supported' in str(e).lower():
                raise ValueError(
                    'This spreadsheet appears to be an uploaded Excel '
                    '(.xlsx) file rather than a native Google Sheet. '
                    'Please open the file in Google Sheets, go to '
                    'File → Save as Google Sheets, then use the new '
                    'URL for import.'
                ) from e
            raise

        if gid is not None:
            ws = ss.get_worksheet_by_id(gid)
        else:
            ws = ss.sheet1

        try:
            all_vals = ws.get_all_values()
        except Exception as e:
            if '400' in str(e) or 'not supported' in str(e).lower():
                raise ValueError(
                    'This spreadsheet appears to be an uploaded Excel '
                    '(.xlsx) file rather than a native Google Sheet. '
                    'Please open the file in Google Sheets, go to '
                    'File → Save as Google Sheets, then use the new '
                    'URL for import.'
                ) from e
            raise
        if not all_vals:
            return []

        # ── Locate header row ────────────────────────────────────────
        # Scan first 10 rows for one that contains "date" and
        # ("awarded" or "earned") and ("spent" or "cost").
        header_idx = None
        col_map = {}  # maps canonical name -> column index

        for row_i, row in enumerate(all_vals[:10]):
            lower_cells = [c.strip().lower() for c in row]
            found_date = None
            found_awarded = None
            found_spent = None
            found_reason = None

            for col_i, cell in enumerate(lower_cells):
                if found_date is None and cell in (
                        'date', 'dates'):
                    found_date = col_i
                elif found_awarded is None and cell in (
                        'awarded', 'earned', 'award', 'xp awarded',
                        'xp earned', 'xp'):
                    found_awarded = col_i
                elif found_spent is None and cell in (
                        'spent', 'spend', 'cost', 'xp spent',
                        'xp cost'):
                    found_spent = col_i
                elif found_reason is None and cell in (
                        'reason', 'reasons', 'notes', 'description',
                        'note', 'what'):
                    found_reason = col_i

            if found_date is not None and (found_awarded is not None
                                           or found_spent is not None):
                header_idx = row_i
                col_map['date'] = found_date
                if found_awarded is not None:
                    col_map['awarded'] = found_awarded
                if found_spent is not None:
                    col_map['spent'] = found_spent
                if found_reason is not None:
                    col_map['reason'] = found_reason
                break

        if header_idx is None:
            raise ValueError(
                'Could not find a header row with Date + Awarded/Spent '
                'columns. Make sure the spreadsheet has column headers.'
            )

        # ── Parse data rows ──────────────────────────────────────────
        entries = []
        for row in all_vals[header_idx + 1:]:
            date_val = row[col_map['date']].strip() if col_map.get('date') is not None and col_map['date'] < len(row) else ''
            if not date_val:
                continue  # skip blank rows

            awarded = 0
            spent = 0
            reason = ''

            if 'awarded' in col_map and col_map['awarded'] < len(row):
                raw = row[col_map['awarded']].strip()
                try:
                    awarded = int(float(raw)) if raw else 0
                except (ValueError, TypeError):
                    awarded = 0

            if 'spent' in col_map and col_map['spent'] < len(row):
                raw = row[col_map['spent']].strip()
                try:
                    spent = int(float(raw)) if raw else 0
                except (ValueError, TypeError):
                    spent = 0

            if 'reason' in col_map and col_map['reason'] < len(row):
                reason = row[col_map['reason']].strip()

            # Skip rows that are clearly totals / summary
            if date_val.lower() in ('total', 'totals', 'sum', 'net',
                                    'balance', 'grand total'):
                continue

            if awarded == 0 and spent == 0:
                continue  # skip rows with no XP movement

            entries.append({
                'date': date_val,
                'awarded': awarded,
                'spent': spent,
                'reason': reason,
            })

        return entries

    def bulk_add_ledger_entries(self, character_name: str,
                                entries: list[dict],
                                staff_user: str) -> int:
        """Bulk-import ledger entries for a character.

        entries: list of dicts with keys: date, awarded, spent, reason
        Returns the number of rows added.
        """
        ws = self._ws(TAB_XP_LEDGER)
        now = _now_str()
        rows = []
        for e in entries:
            rows.append([
                character_name,
                e['date'],
                e.get('awarded', 0),
                e.get('spent', 0),
                e.get('reason', ''),
                staff_user,
                now,
            ])
        if rows:
            next_row = self._get_next_row(TAB_XP_LEDGER)
            ws.update(f'A{next_row}', rows, value_input_option='RAW')
            self._next_row_cache[TAB_XP_LEDGER] = next_row + len(rows)
            self._cache.invalidate(TAB_XP_LEDGER)
        return len(rows)

    # ── Play-Period Import ─────────────────────────────────────────────────

    def preview_period_import(self, spreadsheet_url: str) -> list[dict]:
        """Read tab names from a master XP spreadsheet, extract play periods.

        Parses 'Night NN - M/D - M/D' tab names, resolves years, and
        extrapolates any gaps using the bi-weekly cadence.

        Returns a list of dicts sorted by night number:
            [{'night': int, 'start': 'YYYY-MM-DD', 'end': 'YYYY-MM-DD',
              'label': str, 'source': 'parsed'|'extrapolated'}, ...]
        """
        import re as _re
        from datetime import datetime as _dt, timedelta as _td

        # ── open spreadsheet ─────────────────────────────────────────
        m = _re.search(r'/d/([a-zA-Z0-9_-]+)', spreadsheet_url)
        sheet_id = m.group(1) if m else spreadsheet_url.strip()
        ss = self.gc.open_by_key(sheet_id)

        # ── parse tab names ──────────────────────────────────────────
        raw: dict[int, tuple[str, str]] = {}   # night -> (start_str, end_str)
        max_night = 0

        for ws in ss.worksheets():
            title = ws.title
            if 'Copy of' in title:
                continue
            nm = _re.search(r'Night\s+(\d+)', title)
            if not nm:
                continue
            night = int(nm.group(1))
            max_night = max(max_night, night)
            dates = _re.findall(r'(\d{1,2}/\d{1,2}(?:/\d{2,4})?)', title)
            if len(dates) == 2:
                raw[night] = (dates[0], dates[1])

        if not raw:
            raise ValueError('No play period tabs found in this spreadsheet.')

        # ── resolve years ────────────────────────────────────────────
        # Tabs with /YY or /YYYY already have years.  For the rest we
        # determine the year from context: the chronicle started in
        # early 2024 with Night 4 = 03/12/24.

        def _parse_date(s: str, ref_year: int, after: _dt = None) -> _dt:
            """Parse M/D or M/D/YY into a datetime."""
            parts = s.split('/')
            month = int(parts[0])
            day = int(parts[1])
            if len(parts) == 3:
                yr = int(parts[2])
                if yr < 100:
                    yr += 2000
                return _dt(yr, month, day)
            # No year given — infer
            candidate = _dt(ref_year, month, day)
            if after and candidate < after - _td(days=60):
                candidate = _dt(ref_year + 1, month, day)
            return candidate

        # Find the earliest tab that HAS a year to anchor from
        anchor_start = None
        for n in sorted(raw.keys()):
            s, e = raw[n]
            if '/' in s and s.count('/') == 2:
                anchor_start = _parse_date(s, 2024)
                break

        if anchor_start is None:
            raise ValueError('Cannot determine year — no tab has dates with years.')

        # Resolve all dated tabs to proper datetimes
        resolved: dict[int, tuple[_dt, _dt]] = {}

        # First, resolve the ones with explicit years
        for n in sorted(raw.keys()):
            s, e = raw[n]
            if s.count('/') == 2:
                sd = _parse_date(s, 2024)
                ed = _parse_date(e, sd.year, after=sd)
                resolved[n] = (sd, ed)

        # Now resolve yearless tabs using the anchor and bi-weekly cadence.
        # Night 17+ have no years.  We know Night 6 ends 04/23/2024 and
        # Night 7 starts there, running bi-weekly through Night 16 to
        # 09/10/2024 where Night 17 picks up.
        # Work forward from the last explicitly-dated night.
        last_known = max(resolved.keys())
        last_end = resolved[last_known][1]

        for n in sorted(raw.keys()):
            if n in resolved:
                continue
            s, e = raw[n]
            # Infer year: start from the previous night's end year
            ref_year = last_end.year if n > last_known else anchor_start.year
            sd = _parse_date(s, ref_year, after=last_end - _td(days=30))
            ed = _parse_date(e, sd.year, after=sd)
            # If start wrapped around a year boundary
            if ed < sd:
                ed = _dt(sd.year + 1, ed.month, ed.day)
            resolved[n] = (sd, ed)
            last_end = ed
            last_known = n

        # ── extrapolate gaps ─────────────────────────────────────────
        # Standard cadence is ~14 days.
        all_nights = set(range(1, max_night + 1))
        missing = all_nights - set(resolved.keys())

        if missing:
            # For gaps BEFORE the first known night, work backwards
            first_known = min(resolved.keys())
            first_start = resolved[first_known][0]
            for n in sorted(missing, reverse=True):
                if n < first_known:
                    offset = first_known - n
                    start = first_start - _td(days=14 * offset)
                    end = start + _td(days=14)
                    resolved[n] = (start, end)

            # For gaps BETWEEN known nights (e.g., 7-16), interpolate
            for n in sorted(missing):
                if n in resolved:
                    continue
                # Find nearest known before and after
                before = max((k for k in resolved if k < n), default=None)
                if before is not None:
                    ref_end = resolved[before][1]
                    offset = n - before
                    start = ref_end + _td(days=14 * (offset - 1))
                    end = start + _td(days=14)
                    resolved[n] = (start, end)

        # ── build result ─────────────────────────────────────────────
        existing_nights = {
            p.night_number for p in self.get_all_periods()
        }

        result = []
        for n in sorted(resolved.keys()):
            sd, ed = resolved[n]
            already = n in existing_nights
            result.append({
                'night': n,
                'start': sd.strftime('%Y%m%d'),
                'end': ed.strftime('%Y%m%d'),
                'label': f'Night {n}',
                'source': 'parsed' if n in raw else 'extrapolated',
                'already_exists': already,
            })

        return result

    def bulk_add_periods(self, periods: list[dict], staff_user: str) -> int:
        """Bulk-import play periods, skipping any that already exist.

        periods: list from preview_period_import()
        Returns count of newly added periods.
        """
        existing = {p.night_number for p in self.get_all_periods()}
        ws = self._ws(TAB_PERIODS)
        rows = []
        for p in periods:
            if p['night'] in existing:
                continue
            rows.append([
                p['label'],       # period_label
                p['night'],       # night_number
                p['start'],       # start_date
                p['end'],         # end_date
                p['night'],       # session_number (same as night for now)
                'FALSE',          # submissions_open
                'TRUE',           # active
            ])
        if rows:
            next_row = self._get_next_row(TAB_PERIODS)
            ws.update(f'A{next_row}', rows, value_input_option='RAW')
            self._next_row_cache[TAB_PERIODS] = next_row + len(rows)
            self._cache.invalidate(TAB_PERIODS)
        return len(rows)

    # ── Audit Log ────────────────────────────────────────────────────────────

    def log_action(self, staff_user: str, action_type: str,
                   target: str, details: str) -> None:
        self._safe_append_row(TAB_AUDIT_LOG,
                              [_now_str(), staff_user, action_type,
                               target, details])

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
