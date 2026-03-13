"""Background worker that mirrors new DB records to Google Sheets.

Phase 1: Append-only sync for new inserts. Status updates (approve/deny)
are not mirrored in this phase.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.sheets import SheetsClient
    from app.models import Character, PlayPeriod

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='sheets-sync')


def _run(fn, *args, **kwargs):
    """Submit a Sheets write to the background executor. Failures are logged only."""
    def task():
        try:
            fn(*args, **kwargs)
        except Exception as exc:
            logger.warning('sheets_sync_failed: %s — %s', fn.__name__, exc)
    _executor.submit(task)


class SheetsSyncWorker:
    def __init__(self, sheets_client: 'SheetsClient'):
        self._sheets = sheets_client

    def sync_add_character(self, char: 'Character') -> None:
        _run(self._sheets.add_character, char)

    def sync_create_period(self, period: 'PlayPeriod') -> None:
        _run(self._sheets.create_period, period)

    def sync_add_claim(self, character_name: str, play_period: str, categories: dict) -> None:
        # Best-effort: if it already exists in Sheets, ignore ValueError
        def _safe():
            try:
                self._sheets.submit_xp_claim(character_name, play_period, categories)
            except ValueError:
                pass
            except Exception as exc:
                logger.warning('sheets_sync_failed: submit_xp_claim — %s', exc)
        _executor.submit(_safe)

    def sync_add_spend(self, character_name: str, spend_category: str, trait_name: str,
                       current_dots: int, new_dots: int, is_in_clan: bool, justification: str) -> None:
        _run(self._sheets.submit_spend_request,
             character_name=character_name, spend_category=spend_category,
             trait_name=trait_name, current_dots=current_dots, new_dots=new_dots,
             is_in_clan=is_in_clan, justification=justification)

    def sync_add_ledger_entry(self, character_name: str, date: str, awarded: int,
                               spent: int, reason: str, staff_user: str) -> None:
        _run(self._sheets.add_ledger_entry, character_name, date, awarded, spent, reason, staff_user)

    def sync_log_action(self, staff_user: str, action_type: str, target: str, details: str) -> None:
        _run(self._sheets.log_action, staff_user=staff_user, action_type=action_type,
             target=target, details=details)

    # ------------------------------------------------------------------
    # Phase 2: status update mirroring (approve / deny)
    # ------------------------------------------------------------------

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
