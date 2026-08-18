"""Background worker that mirrors new DB records to Google Sheets.

Real-time path: fire-and-forget appends / status updates after each write.
  Failures are logged to the DB and to the in-memory buffer for the current
  session but are NOT retried — the nightly reconciliation is the guarantee.

Nightly reconciliation: full diff of DB vs Sheets.  Appends missing rows,
  updates stale status rows, and logs a summary to sheets_sync_errors.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import Counter, defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.sheets import SheetsClient
    from app.models import AuditEntry, Character, XPClaim, SpendRequest, LedgerEntry
    from app.db_service import DBService

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='sheets-sync')

# In-memory buffer — last 50 real-time failures for the current process lifetime
_sync_errors: deque = deque(maxlen=50)
_sync_errors_lock = threading.Lock()


def get_recent_sync_errors() -> list[dict]:
    """Return recent real-time sync failures from the in-memory buffer (current session only)."""
    with _sync_errors_lock:
        return list(reversed(_sync_errors))


# A mirrored row's timestamp is written by a separate call from the DB record's,
# so the two drift by a second or two — occasionally more when Sheets is slow.
_PAIR_TIMESTAMP_TOLERANCE_SECONDS = 120


def _parse_row_timestamp(value: str):
    """Parse a 'YYYYMMDD HH:MM:SS' cell, or None if it isn't one."""
    try:
        return datetime.strptime(str(value).strip(), '%Y%m%d %H:%M:%S')
    except (TypeError, ValueError):
        return None


def _pair_within_groups(db_records: list, sheet_records: list, group_key) -> tuple[list, list]:
    """Pair DB records with their mirror rows, one identity group at a time.

    The group key alone is not an identity.  A character denied for a period who
    then resubmits has two DB records that a (character, period) key collapses
    onto one row — which is what made reconciliation rewrite the same rows every
    night: each record in turn flipped the shared row to its own status, and the
    second record was never appended because its key already "existed".

    Sheet rows carry no stable id, so records are paired on their timestamps:
    first the pairs whose timestamps agree within tolerance, closest first, then
    whatever is left over in chronological order.  Timestamp-first matters when a
    group's rows are incomplete — a lone row belongs to whichever record it was
    written for, not automatically to the earliest one.

    Extra sheet rows beyond the DB's count for a group are left alone; the mirror
    is append-only, so leftovers are historical rows the DB no longer carries.

    Returns (pairs, unmatched) where pairs is a list of (db_record, sheet_row)
    and unmatched is the DB records that have no row of their own yet.
    """
    grouped_rows: dict = defaultdict(list)
    for sr in sheet_records:
        grouped_rows[group_key(sr)].append(sr)
    for rows in grouped_rows.values():
        rows.sort(key=lambda r: (r.timestamp, r.row_index))

    grouped_records: dict = defaultdict(list)
    for dr in db_records:
        grouped_records[group_key(dr)].append(dr)

    pairs: list = []
    unmatched: list = []

    for key, records in grouped_records.items():
        records.sort(key=lambda r: (r.timestamp, r.row_index))
        rows = grouped_rows.get(key, [])
        matched: dict = {}
        taken: set = set()

        candidates = []
        for record_i, dr in enumerate(records):
            record_time = _parse_row_timestamp(dr.timestamp)
            if record_time is None:
                continue
            for row_i, sr in enumerate(rows):
                row_time = _parse_row_timestamp(sr.timestamp)
                if row_time is None:
                    continue
                drift = abs((row_time - record_time).total_seconds())
                if drift <= _PAIR_TIMESTAMP_TOLERANCE_SECONDS:
                    candidates.append((drift, record_i, row_i))

        for _, record_i, row_i in sorted(candidates):
            if record_i in matched or row_i in taken:
                continue
            matched[record_i] = row_i
            taken.add(row_i)

        spare = [row_i for row_i in range(len(rows)) if row_i not in taken]
        for record_i in range(len(records)):
            if record_i not in matched and spare:
                matched[record_i] = spare.pop(0)

        for record_i, dr in enumerate(records):
            row_i = matched.get(record_i)
            if row_i is None:
                unmatched.append(dr)
            else:
                pairs.append((dr, rows[row_i]))

    pairs.sort(key=lambda p: (p[0].timestamp, p[0].row_index))
    unmatched.sort(key=lambda r: (r.timestamp, r.row_index))
    return pairs, unmatched


class SheetsSyncWorker:
    def __init__(self, sheets_client: SheetsClient, flask_app=None, db_service: DBService = None):
        self._sheets = sheets_client
        self._app = flask_app
        self._db = db_service

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _run(self, fn, *args, operation_name: str | None = None, **kwargs):
        """Submit a Sheets write to the background executor. Failures are logged only."""
        op = operation_name or fn.__name__

        def task():
            try:
                fn(*args, **kwargs)
            except Exception as exc:
                logger.warning('sheets_sync_failed: %s — %s', op, exc)
                entry = {
                    'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
                    'operation': op,
                    'error': str(exc),
                }
                with _sync_errors_lock:
                    _sync_errors.append(entry)
                # Persist to DB if app context is available
                if self._app and self._db:
                    try:
                        with self._app.app_context():
                            self._db.log_sheets_sync_error(op, str(exc))
                    except Exception:
                        pass

        _executor.submit(task)

    def _log_reconcile_result(self, summary: dict) -> None:
        """Persist a reconciliation summary to the DB error log table."""
        if not self._db:
            return
        status = 'completed with errors' if summary.get('errors') else 'ok'
        try:
            self._db.log_sheets_sync_error(
                operation='reconcile',
                error=status,
                details=json.dumps(summary),
            )
        except Exception as exc:
            logger.warning('sheets_sync: failed to log reconcile result — %s', exc)

    # ── Real-time fire-and-forget methods ─────────────────────────────────────

    def sync_add_character(self, char: Character) -> None:
        self._run(self._sheets.add_character, char)

    def sync_create_period(self, period) -> None:
        self._run(self._sheets.create_period, period)

    def sync_add_claim(self, character_name: str, play_period: str, categories: dict) -> None:
        def _safe():
            try:
                self._sheets.submit_xp_claim(character_name, play_period, categories)
            except ValueError:
                pass
            except Exception as exc:
                logger.warning('sheets_sync_failed: submit_xp_claim — %s', exc)
                with _sync_errors_lock:
                    _sync_errors.append({
                        'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
                        'operation': 'submit_xp_claim',
                        'error': str(exc),
                    })
                if self._app and self._db:
                    try:
                        with self._app.app_context():
                            self._db.log_sheets_sync_error('submit_xp_claim', str(exc))
                    except Exception:
                        pass
        _executor.submit(_safe)

    def sync_add_spend(self, character_name: str, spend_category: str, trait_name: str,
                       current_dots: int, new_dots: int, is_in_clan: bool, justification: str) -> None:
        self._run(self._sheets.submit_spend_request,
                  character_name=character_name, spend_category=spend_category,
                  trait_name=trait_name, current_dots=current_dots, new_dots=new_dots,
                  is_in_clan=is_in_clan, justification=justification)

    def sync_add_ledger_entry(self, character_name: str, date: str, awarded: int,
                               spent: int, reason: str, staff_user: str) -> None:
        self._run(self._sheets.add_ledger_entry, character_name, date, awarded, spent, reason, staff_user)

    def sync_log_action(self, staff_user: str, action_type: str, target: str, details: str) -> None:
        self._run(self._sheets.log_action, staff_user=staff_user, action_type=action_type,
                  target=target, details=details)

    def _find_claim_row(self, character_name: str, play_period: str):
        """Find the mirror row a claim review should write to.

        A character can have more than one row for a period — a denial followed
        by a resubmission — so taking the first match would write the review onto
        the older, already-decided row.  Prefer the row still awaiting a decision,
        and fall back to the most recent one (an amendment re-reviews a claim that
        is already Approved, so no pending row exists).  This mirrors the
        status == 'pending' guard the spend path already uses.
        """
        matches = [
            c for c in self._sheets.get_all_claims()
            if c.character_name.lower() == character_name.lower()
            and c.play_period == play_period
        ]
        if not matches:
            return None
        pending = [c for c in matches if c.status.strip().lower() == 'pending']
        return pending[0] if pending else matches[-1]

    def sync_approve_claim(self, character_name: str, play_period: str,
                           approved_xp: int, reviewer: str, notes: str = '') -> None:
        def _task():
            try:
                match = self._find_claim_row(character_name, play_period)
                if match is None:
                    logger.warning('sheets_sync: approve_claim no match for %s / %s',
                                   character_name, play_period)
                    return
                self._sheets.approve_claim(match.row_index, approved_xp, reviewer, notes)
            except Exception as exc:
                logger.warning('sheets_sync_failed: approve_claim — %s', exc)
        _executor.submit(_task)

    def sync_deny_claim(self, character_name: str, play_period: str,
                        reviewer: str, notes: str = '') -> None:
        def _task():
            try:
                match = self._find_claim_row(character_name, play_period)
                if match is None:
                    logger.warning('sheets_sync: deny_claim no match for %s / %s',
                                   character_name, play_period)
                    return
                self._sheets.deny_claim(match.row_index, reviewer, notes)
            except Exception as exc:
                logger.warning('sheets_sync_failed: deny_claim — %s', exc)
        _executor.submit(_task)

    def sync_approve_spend(self, character_name: str, trait_name: str,
                           spend_category: str, current_dots: int, new_dots: int,
                           verified_cost: int, reviewer: str, notes: str = '',
                           original_trait_name: str | None = None) -> None:
        # original_trait_name is the name the row was submitted/mirrored
        # under — needed when staff renamed the trait at approval time, since
        # the mirrored Sheets row still has the pre-correction name and won't
        # match on the corrected trait_name.
        match_trait_name = original_trait_name or trait_name
        rename = trait_name if original_trait_name and original_trait_name != trait_name else None

        def _task():
            try:
                match = next(
                    (s for s in self._sheets.get_all_spends()
                     if s.character_name.lower() == character_name.lower()
                     and s.trait_name == match_trait_name
                     and s.spend_category == spend_category
                     and s.current_dots == current_dots
                     and s.new_dots == new_dots
                     and s.status.lower() == 'pending'),
                    None,
                )
                if match is None:
                    logger.warning('sheets_sync: approve_spend no match for %s / %s',
                                   character_name, match_trait_name)
                    return
                self._sheets.approve_spend(
                    match.row_index, verified_cost, reviewer, notes, trait_name=rename
                )
            except Exception as exc:
                logger.warning('sheets_sync_failed: approve_spend — %s', exc)
        _executor.submit(_task)

    def sync_reverse_spend(self, character_name: str, trait_name: str,
                           spend_category: str, current_dots: int, new_dots: int,
                           notes: str = '') -> None:
        def _task():
            try:
                match = next(
                    (s for s in self._sheets.get_all_spends()
                     if s.character_name.lower() == character_name.lower()
                     and s.trait_name == trait_name
                     and s.spend_category == spend_category
                     and s.current_dots == current_dots
                     and s.new_dots == new_dots
                     and s.status.lower() == 'approved'),
                    None,
                )
                if match is None:
                    logger.warning('sheets_sync: reverse_spend no match for %s / %s',
                                   character_name, trait_name)
                    return
                self._sheets.reverse_spend(match.row_index, notes)
            except Exception as exc:
                logger.warning('sheets_sync_failed: reverse_spend — %s', exc)
        _executor.submit(_task)

    def sync_add_wish_list_item(self, character_name: str, spend_category: str,
                                trait_name: str, power_name: str, current_dots: int,
                                new_dots: int, is_in_clan: bool, xp_cost: int,
                                justification: str, created_at: str) -> None:
        def _task():
            try:
                self._sheets.add_wish_list_item(
                    character_name=character_name,
                    spend_category=spend_category,
                    trait_name=trait_name,
                    power_name=power_name,
                    current_dots=current_dots,
                    new_dots=new_dots,
                    is_in_clan=is_in_clan,
                    xp_cost=xp_cost,
                    justification=justification,
                    created_at=created_at,
                )
            except Exception as exc:
                logger.warning('sheets_sync_failed: add_wish_list_item — %s', exc)
        _executor.submit(_task)

    def sync_remove_wish_list_item(self, character_name: str, spend_category: str,
                                   trait_name: str, current_dots: int, new_dots: int) -> None:
        def _task():
            try:
                match = next(
                    (r for r in self._sheets.get_all_wish_list_items()
                     if r.get('character_name', '').lower() == character_name.lower()
                     and r.get('trait_name') == trait_name
                     and r.get('spend_category') == spend_category
                     and str(r.get('current_dots')) == str(current_dots)
                     and str(r.get('new_dots')) == str(new_dots)),
                    None,
                )
                if match is None:
                    logger.warning('sheets_sync: remove_wish_list_item no match for %s / %s',
                                   character_name, trait_name)
                    return
                self._sheets.remove_wish_list_item_row(match['row_index'])
            except Exception as exc:
                logger.warning('sheets_sync_failed: remove_wish_list_item — %s', exc)
        _executor.submit(_task)

    def sync_deny_spend(self, character_name: str, trait_name: str,
                        spend_category: str, current_dots: int, new_dots: int,
                        reviewer: str, notes: str = '') -> None:
        def _task():
            try:
                match = next(
                    (s for s in self._sheets.get_all_spends()
                     if s.character_name.lower() == character_name.lower()
                     and s.trait_name == trait_name
                     and s.spend_category == spend_category
                     and s.current_dots == current_dots
                     and s.new_dots == new_dots
                     and s.status.lower() == 'pending'),
                    None,
                )
                if match is None:
                    logger.warning('sheets_sync: deny_spend no match for %s / %s',
                                   character_name, trait_name)
                    return
                self._sheets.deny_spend(match.row_index, reviewer, notes)
            except Exception as exc:
                logger.warning('sheets_sync_failed: deny_spend — %s', exc)
        _executor.submit(_task)

    # ── Nightly reconciliation ────────────────────────────────────────────────

    def reconcile(self, db_service: DBService) -> dict:
        """Full diff reconciliation: compare DB state to Sheets and sync gaps.

        Appends missing rows, updates stale statuses, and returns a summary.
        Must be called within a Flask app/request context (DB access required).
        """
        summary: dict = {
            'started_at': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
            'claims_appended': 0,
            'claims_status_updated': 0,
            'spends_appended': 0,
            'spends_status_updated': 0,
            'ledger_appended': 0,
            'characters_appended': 0,
            'audit_appended': 0,
            'errors': [],
        }

        for phase, run in (
            ('claims', self._reconcile_claims),
            ('spends', self._reconcile_spends),
            ('ledger', self._reconcile_ledger),
            ('characters', self._reconcile_characters),
            ('audit', self._reconcile_audit),
        ):
            try:
                run(db_service, summary)
            except Exception as exc:
                logger.warning('sheets_reconcile_%s_error: %s', phase, exc)
                summary['errors'].append(f'{phase} phase failed: {exc}')

        summary['finished_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        self._log_reconcile_result(summary)
        logger.info('sheets_reconcile_complete: %s', json.dumps({
            k: v for k, v in summary.items() if k != 'errors'
        }))
        return summary

    # ── Reconciliation phases ─────────────────────────────────────────────────

    def _reconcile_claims(self, db_service: DBService, summary: dict) -> None:
        db_claims = db_service.get_all_claims()
        sheets_claims = self._sheets.get_all_claims()

        def _group(c: XPClaim) -> tuple:
            return (c.character_name.strip().lower(), c.play_period.strip())

        pairs, missing = _pair_within_groups(db_claims, sheets_claims, _group)

        for dc in missing:
            try:
                self._sheets.append_claim_row(dc)
                summary['claims_appended'] += 1
            except Exception as exc:
                summary['errors'].append(
                    f'append claim {dc.character_name}/{dc.play_period}: {exc}'
                )

        # Status updates for rows that exist but are stale.  Backfilled rows are
        # written with their final status already, so they never land here.
        for dc, sc in pairs:
            if sc.status.strip().lower() == dc.status.strip().lower():
                continue
            try:
                if dc.status.lower() == 'approved':
                    self._sheets.approve_claim(
                        sc.row_index, dc.approved_xp, dc.reviewed_by, dc.st_notes or ''
                    )
                    summary['claims_status_updated'] += 1
                elif dc.status.lower() == 'denied':
                    self._sheets.deny_claim(
                        sc.row_index, dc.reviewed_by, dc.st_notes or ''
                    )
                    summary['claims_status_updated'] += 1
            except Exception as exc:
                summary['errors'].append(
                    f'update claim status {dc.character_name}/{dc.play_period}: {exc}'
                )

    def _reconcile_spends(self, db_service: DBService, summary: dict) -> None:
        db_spends = db_service.get_all_spends()
        sheets_spends = self._sheets.get_all_spends()

        def _group(s: SpendRequest) -> tuple:
            return (
                s.character_name.strip().lower(),
                s.trait_name.strip().lower(),
                s.spend_category.strip().lower(),
                s.current_dots,
                s.new_dots,
            )

        pairs, missing = _pair_within_groups(db_spends, sheets_spends, _group)

        for ds in missing:
            try:
                self._sheets.append_spend_row(ds)
                summary['spends_appended'] += 1
            except Exception as exc:
                summary['errors'].append(
                    f'append spend {ds.character_name}/{ds.trait_name}: {exc}'
                )

        for ds, ss in pairs:
            if ss.status.strip().lower() == ds.status.strip().lower():
                continue
            try:
                if ds.status.lower() == 'approved':
                    self._sheets.approve_spend(
                        ss.row_index, ds.verified_cost, ds.reviewed_by, ds.st_notes or ''
                    )
                    summary['spends_status_updated'] += 1
                elif ds.status.lower() == 'denied':
                    self._sheets.deny_spend(
                        ss.row_index, ds.reviewed_by, ds.st_notes or ''
                    )
                    summary['spends_status_updated'] += 1
                elif ds.status.lower() == 'pending' and ss.status.lower() == 'approved':
                    # A reversed spend — DB is back to Pending after
                    # having been Approved. sync_reverse_spend() should
                    # have already caught this at reversal time; this is
                    # the self-heal path if that call was missed/failed.
                    self._sheets.reverse_spend(ss.row_index, ds.st_notes or '')
                    summary['spends_status_updated'] += 1
            except Exception as exc:
                summary['errors'].append(
                    f'update spend status {ds.character_name}/{ds.trait_name}: {exc}'
                )

    def _reconcile_ledger(self, db_service: DBService, summary: dict) -> None:
        db_ledger = db_service.get_all_ledger_entries()
        sheets_ledger = self._sheets.get_all_ledger_entries()

        def _ledger_key(e: LedgerEntry) -> tuple:
            return (e.character_name.lower(), e.date, e.awarded, e.spent, e.reason[:80].lower())

        sheets_ledger_keys = {_ledger_key(e) for e in sheets_ledger}

        for dl in db_ledger:
            if _ledger_key(dl) in sheets_ledger_keys:
                continue
            try:
                self._sheets.add_ledger_entry(
                    dl.character_name, dl.date, dl.awarded, dl.spent,
                    dl.reason, dl.entered_by,
                )
                summary['ledger_appended'] += 1
            except Exception as exc:
                summary['errors'].append(
                    f'append ledger {dl.character_name}/{dl.date}: {exc}'
                )

    def _reconcile_audit(self, db_service: DBService, summary: dict) -> None:
        """Backfill audit rows the real-time mirror dropped.

        The audit log had no reconciliation phase at all, so a failed
        sync_log_action was simply lost — 371 of 1933 entries were missing when
        this was added.  Entries carry no id and are not updatable, so this is
        an append-only diff.

        The timestamp is deliberately *not* part of the key.  log_action stamps
        the row with the moment of the Sheets write, not the moment of the DB
        write, so a mirrored row's timestamp trails its record's by a second or
        two and exact matching would declare nearly every entry missing.  (Rows
        appended here do carry the record's own timestamp, which is strictly
        more accurate.)

        Entries are compared as a multiset rather than a set: the same staff
        member can legitimately repeat an action, and deduping those away would
        leave the mirror permanently short.
        """
        db_entries = db_service.get_all_audit_entries()
        sheet_entries = self._sheets.get_all_audit_entries()

        def _key(entry: AuditEntry) -> tuple:
            return (
                entry.staff_user.strip(),
                entry.action_type.strip(),
                entry.target_character.strip(),
                entry.details.strip()[:80],
            )

        mirrored = Counter(_key(e) for e in sheet_entries)
        missing = []
        for entry in db_entries:
            key = _key(entry)
            if mirrored[key]:
                mirrored[key] -= 1
            else:
                missing.append(entry)

        if not missing:
            return
        try:
            self._sheets.append_audit_rows(missing)
            summary['audit_appended'] += len(missing)
        except Exception as exc:
            summary['errors'].append(f'append {len(missing)} audit rows: {exc}')

    def _reconcile_characters(self, db_service: DBService, summary: dict) -> None:
        db_chars = db_service.get_all_characters()
        sheets_chars = self._sheets.get_all_characters()
        sheets_char_names = {c.character_name.lower() for c in sheets_chars}

        for dc in db_chars:
            if dc.character_name.lower() in sheets_char_names:
                continue
            try:
                self._sheets.add_character(dc)
                summary['characters_appended'] += 1
            except Exception as exc:
                summary['errors'].append(f'append character {dc.character_name}: {exc}')
