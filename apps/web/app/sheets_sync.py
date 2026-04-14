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
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.sheets import SheetsClient
    from app.models import Character, XPClaim, SpendRequest, LedgerEntry
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


def _claim_categories_dict(claim: XPClaim) -> dict:
    return {
        'posted_once': claim.posted_once_link if claim.posted_once else '',
        'hunting_awakening': claim.hunting_awakening_link if claim.hunting_awakening else '',
        'scene_with_another': claim.scene_with_another_link if claim.scene_with_another else '',
        'conflict': claim.conflict_link if claim.conflict else '',
        'combat': claim.combat_link if claim.combat else '',
        'unmitigated_stain': claim.unmitigated_stain_link if claim.unmitigated_stain else '',
        'wildcard': claim.wildcard_link if claim.wildcard else '',
        'wildcard_amount': str(claim.wildcard_amount) if claim.wildcard else '0',
        'wildcard_reason': claim.wildcard_reason if claim.wildcard else '',
    }


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

    def sync_approve_claim(self, character_name: str, play_period: str,
                           approved_xp: int, reviewer: str, notes: str = '') -> None:
        def _task():
            try:
                match = next(
                    (c for c in self._sheets.get_all_claims()
                     if c.character_name.lower() == character_name.lower()
                     and c.play_period == play_period),
                    None,
                )
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
                match = next(
                    (c for c in self._sheets.get_all_claims()
                     if c.character_name.lower() == character_name.lower()
                     and c.play_period == play_period),
                    None,
                )
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
                           verified_cost: int, reviewer: str, notes: str = '') -> None:
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
                    logger.warning('sheets_sync: approve_spend no match for %s / %s',
                                   character_name, trait_name)
                    return
                self._sheets.approve_spend(match.row_index, verified_cost, reviewer, notes)
            except Exception as exc:
                logger.warning('sheets_sync_failed: approve_spend — %s', exc)
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

    def reconcile(self, db_service: DBService) -> dict:  # pragma: no cover
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
            'errors': [],
        }

        # ── Claims ──
        try:
            db_claims = db_service.get_all_claims()
            sheets_claims = self._sheets.get_all_claims()
            sheets_map = {
                (c.character_name.lower(), c.play_period): c
                for c in sheets_claims
            }

            missing = [dc for dc in db_claims
                       if (dc.character_name.lower(), dc.play_period) not in sheets_map]

            for dc in missing:
                try:
                    self._sheets.submit_xp_claim(
                        dc.character_name, dc.play_period, _claim_categories_dict(dc)
                    )
                    summary['claims_appended'] += 1
                except ValueError:
                    pass  # Duplicate caught by Sheets — already there
                except Exception as exc:
                    summary['errors'].append(
                        f'append claim {dc.character_name}/{dc.play_period}: {exc}'
                    )

            # Re-read after appends to get current row indices
            if missing:
                sheets_claims = self._sheets.get_all_claims()
                sheets_map = {
                    (c.character_name.lower(), c.play_period): c
                    for c in sheets_claims
                }

            # Status updates for rows that exist but are stale
            for dc in db_claims:
                sc = sheets_map.get((dc.character_name.lower(), dc.play_period))
                if sc is None or sc.status.lower() == dc.status.lower():
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

        except Exception as exc:
            logger.warning('sheets_reconcile_claims_error: %s', exc)
            summary['errors'].append(f'claims phase failed: {exc}')

        # ── Spends ──
        try:
            db_spends = db_service.get_all_spends()
            sheets_spends = self._sheets.get_all_spends()

            def _spend_key(s: SpendRequest) -> tuple:
                return (
                    s.character_name.lower(),
                    s.trait_name.lower(),
                    s.spend_category.lower(),
                    s.current_dots,
                    s.new_dots,
                )

            sheets_spend_map = {_spend_key(s): s for s in sheets_spends}

            missing_spends = [ds for ds in db_spends if _spend_key(ds) not in sheets_spend_map]

            for ds in missing_spends:
                try:
                    self._sheets.submit_spend_request(
                        character_name=ds.character_name,
                        spend_category=ds.spend_category,
                        trait_name=ds.trait_name,
                        current_dots=ds.current_dots,
                        new_dots=ds.new_dots,
                        is_in_clan=ds.is_in_clan,
                        justification=ds.justification,
                    )
                    summary['spends_appended'] += 1
                except Exception as exc:
                    summary['errors'].append(
                        f'append spend {ds.character_name}/{ds.trait_name}: {exc}'
                    )

            if missing_spends:
                sheets_spends = self._sheets.get_all_spends()
                sheets_spend_map = {_spend_key(s): s for s in sheets_spends}

            for ds in db_spends:
                ss = sheets_spend_map.get(_spend_key(ds))
                if ss is None or ss.status.lower() == ds.status.lower():
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
                except Exception as exc:
                    summary['errors'].append(
                        f'update spend status {ds.character_name}/{ds.trait_name}: {exc}'
                    )

        except Exception as exc:
            logger.warning('sheets_reconcile_spends_error: %s', exc)
            summary['errors'].append(f'spends phase failed: {exc}')

        # ── Ledger entries ──
        try:
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

        except Exception as exc:
            logger.warning('sheets_reconcile_ledger_error: %s', exc)
            summary['errors'].append(f'ledger phase failed: {exc}')

        # ── Characters ──
        try:
            db_chars = db_service.get_all_characters()
            sheets_chars = self._sheets.get_all_characters()
            sheets_char_names = {c.character_name.lower() for c in sheets_chars}

            for dc in db_chars:
                if dc.character_name.lower() not in sheets_char_names:
                    try:
                        self._sheets.add_character(dc)
                        summary['characters_appended'] += 1
                    except Exception as exc:
                        summary['errors'].append(f'append character {dc.character_name}: {exc}')

        except Exception as exc:
            logger.warning('sheets_reconcile_characters_error: %s', exc)
            summary['errors'].append(f'characters phase failed: {exc}')

        summary['finished_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        self._log_reconcile_result(summary)
        logger.info('sheets_reconcile_complete: %s', json.dumps({
            k: v for k, v in summary.items() if k != 'errors'
        }))
        return summary
