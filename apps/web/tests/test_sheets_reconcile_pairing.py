"""Tests for SheetsSyncWorker.reconcile()'s DB↔Sheets record pairing.

Regression cover for the non-converging reconciliation found on 2026-08-18:
claims were keyed by (character, play_period), so a denial followed by a
resubmission collapsed two DB records onto one mirror row.  Each nightly run
flipped that row's status between the two records and never appended the
second one — 11 claims and 4 spends rewritten every night, indefinitely.
"""

from app.models import AuditEntry, Character, LedgerEntry, SpendRequest, XPClaim
from app.sheets_sync import SheetsSyncWorker


class FakeSheets:
    """Records writes instead of performing them; reads from in-memory lists."""

    def __init__(self, claims=None, spends=None, ledger=None, characters=None, audit=None):
        self.claims = list(claims or [])
        self.spends = list(spends or [])
        self.ledger = list(ledger or [])
        self.characters = list(characters or [])
        self.audit = list(audit or [])
        self.appended_audit = []
        self.appended_claims = []
        self.appended_spends = []
        self.approved_claims = []
        self.denied_claims = []
        self.approved_spends = []
        self.denied_spends = []
        self.reversed_spends = []
        self.appended_ledger = []
        self.appended_characters = []

    def get_all_claims(self):
        return list(self.claims)

    def get_all_spends(self):
        return list(self.spends)

    def get_all_ledger_entries(self):
        return list(self.ledger)

    def get_all_characters(self):
        return list(self.characters)

    def get_all_audit_entries(self):
        return list(self.audit)

    def append_audit_rows(self, entries):
        self.appended_audit.extend(entries)
        self.audit.extend(entries)

    def append_claim_row(self, claim):
        self.appended_claims.append(claim)
        # Mirror the real client: the row lands at the bottom of the tab.
        self.claims.append(
            XPClaim(
                row_index=len(self.claims),
                timestamp=claim.timestamp,
                character_name=claim.character_name,
                play_period=claim.play_period,
                status=claim.status,
                approved_xp=claim.approved_xp,
            )
        )

    def append_spend_row(self, spend):
        self.appended_spends.append(spend)
        self.spends.append(
            SpendRequest(
                row_index=len(self.spends),
                timestamp=spend.timestamp,
                character_name=spend.character_name,
                spend_category=spend.spend_category,
                trait_name=spend.trait_name,
                current_dots=spend.current_dots,
                new_dots=spend.new_dots,
                status=spend.status,
            )
        )

    def approve_claim(self, row_index, approved_xp, reviewer, notes=''):
        self.approved_claims.append(row_index)
        self.claims[row_index].status = 'Approved'

    def deny_claim(self, row_index, reviewer, notes=''):
        self.denied_claims.append(row_index)
        self.claims[row_index].status = 'Denied'

    def approve_spend(self, row_index, verified_cost, reviewer, notes=''):
        self.approved_spends.append(row_index)
        self.spends[row_index].status = 'Approved'

    def deny_spend(self, row_index, reviewer, notes=''):
        self.denied_spends.append(row_index)
        self.spends[row_index].status = 'Denied'

    def reverse_spend(self, row_index, notes=''):
        self.reversed_spends.append(row_index)
        self.spends[row_index].status = 'Pending'

    def add_ledger_entry(self, *args, **kwargs):
        self.appended_ledger.append(args)

    def add_character(self, char):
        self.appended_characters.append(char)


class FakeDB:
    def __init__(self, claims=None, spends=None, ledger=None, characters=None, audit=None):
        self._claims = list(claims or [])
        self._spends = list(spends or [])
        self._ledger = list(ledger or [])
        self._characters = list(characters or [])
        self._audit = list(audit or [])

    def get_all_claims(self):
        return list(self._claims)

    def get_all_spends(self):
        return list(self._spends)

    def get_all_ledger_entries(self):
        return list(self._ledger)

    def get_all_characters(self):
        return list(self._characters)

    def get_all_audit_entries(self):
        return list(self._audit)


def _claim(row_id, name, period, timestamp, status, approved_xp=0):
    return XPClaim(
        row_index=row_id,
        timestamp=timestamp,
        character_name=name,
        play_period=period,
        status=status,
        approved_xp=approved_xp,
    )


def _spend(row_id, name, trait, timestamp, status, category='Skill', current=0, new=1):
    return SpendRequest(
        row_index=row_id,
        timestamp=timestamp,
        character_name=name,
        spend_category=category,
        trait_name=trait,
        current_dots=current,
        new_dots=new,
        status=status,
    )


def test_resubmitted_claim_is_appended_not_collapsed_onto_the_denied_row():
    """A denial plus a resubmission needs two mirror rows, not one flipped row."""
    db = FakeDB(claims=[
        _claim(73, 'Daphne Krayt', 'Night 54', '20260324 03:44:46', 'Denied'),
        _claim(321, 'Daphne Krayt', 'Night 54', '20260623 21:37:23', 'Approved', approved_xp=4),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Daphne Krayt', 'Night 54', '20260324 03:44:47', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['claims_appended'] == 1
    assert summary['claims_status_updated'] == 0
    assert [c.row_index for c in sheets.appended_claims] == [321]
    # The original denied row is left exactly as it was.
    assert sheets.claims[0].status == 'Denied'
    assert sheets.approved_claims == []
    assert sheets.denied_claims == []


def test_reconcile_is_idempotent_across_runs():
    """The bug's signature was an identical non-zero summary every night."""
    db = FakeDB(claims=[
        _claim(73, 'Daphne Krayt', 'Night 54', '20260324 03:44:46', 'Denied'),
        _claim(321, 'Daphne Krayt', 'Night 54', '20260623 21:37:23', 'Approved', approved_xp=4),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Daphne Krayt', 'Night 54', '20260324 03:44:47', 'Denied'),
    ])
    worker = SheetsSyncWorker(sheets)
    worker.reconcile(db)

    second = worker.reconcile(db)
    assert second['claims_appended'] == 0
    assert second['claims_status_updated'] == 0

    third = worker.reconcile(db)
    assert third['claims_appended'] == 0
    assert third['claims_status_updated'] == 0


def test_appended_claim_keeps_its_db_timestamp():
    """Idempotence depends on the appended row carrying the record's timestamp,
    not the wall clock — otherwise the next run cannot order it into its group."""
    db = FakeDB(claims=[_claim(428, 'Isadora', 'Night 65', '20260818 12:31:06', 'Approved', 2)])
    sheets = FakeSheets()
    SheetsSyncWorker(sheets).reconcile(db)

    assert sheets.appended_claims[0].timestamp == '20260818 12:31:06'
    assert sheets.claims[0].timestamp == '20260818 12:31:06'


def test_genuinely_stale_status_is_still_updated():
    db = FakeDB(claims=[_claim(10, 'Aliyah', 'Night 66', '20260818 04:04:50', 'Approved', 4)])
    sheets = FakeSheets(claims=[
        _claim(0, 'Aliyah', 'Night 66', '20260818 04:04:52', 'Pending'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['claims_status_updated'] == 1
    assert sheets.approved_claims == [0]
    assert summary['claims_appended'] == 0


def test_extra_sheet_rows_are_left_alone():
    """The mirror is append-only, so rows the DB no longer carries stay put."""
    db = FakeDB(claims=[_claim(10, 'Viper', 'Night 55', '20260224 01:00:00', 'Approved', 3)])
    sheets = FakeSheets(claims=[
        _claim(0, 'Viper', 'Night 55', '20260224 01:00:01', 'Approved'),
        _claim(1, 'Viper', 'Night 55', '20260224 01:00:02', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['claims_appended'] == 0
    assert summary['claims_status_updated'] == 0
    assert sheets.denied_claims == []
    assert sheets.approved_claims == []


def test_pairing_follows_chronological_order_within_a_group():
    """The older DB record pairs with the older row even when read out of order."""
    db = FakeDB(claims=[
        _claim(321, 'Cecelia', 'Night 61', '20260601 21:41:58', 'Approved', 4),
        _claim(241, 'Cecelia', 'Night 61', '20260601 07:29:03', 'Denied'),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Cecelia', 'Night 61', '20260601 21:41:59', 'Pending'),
        _claim(1, 'Cecelia', 'Night 61', '20260601 07:29:04', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    # Row 1 (07:29) is the older row and already matches the denied record;
    # row 0 (21:41) is the resubmission and is the one that needs approving.
    assert summary['claims_appended'] == 0
    assert sheets.approved_claims == [0]
    assert sheets.denied_claims == []


def test_resubmitted_spend_is_appended_not_collapsed():
    db = FakeDB(spends=[
        _spend(3, 'Cecelia', 'Politics', '20260225 11:33:59', 'Denied'),
        _spend(6, 'Cecelia', 'Politics', '20260301 12:42:52', 'Approved'),
    ])
    sheets = FakeSheets(spends=[
        _spend(0, 'Cecelia', 'Politics', '20260225 11:34:00', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['spends_appended'] == 1
    assert summary['spends_status_updated'] == 0
    assert sheets.spends[0].status == 'Denied'


def test_reversed_spend_still_self_heals():
    db = FakeDB(spends=[_spend(20, 'Viktor', 'Haven', '20260808 23:43:42', 'Pending')])
    sheets = FakeSheets(spends=[
        _spend(0, 'Viktor', 'Haven', '20260808 23:43:44', 'Approved'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert sheets.reversed_spends == [0]
    assert summary['spends_status_updated'] == 1


def test_ledger_and_character_phases_still_append_gaps():
    db = FakeDB(
        ledger=[LedgerEntry(character_name='Isadora', date='20260818', awarded=2,
                            spent=0, reason='Night 65 (claim approved)')],
        characters=[Character(character_name='New Fledgling')],
    )
    sheets = FakeSheets()
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['ledger_appended'] == 1
    assert summary['characters_appended'] == 1


def test_one_phase_failing_does_not_abort_the_others():
    class ExplodingClaims(FakeSheets):
        def get_all_claims(self):
            raise RuntimeError('Sheets 503')

    db = FakeDB(
        claims=[_claim(1, 'A', 'Night 1', '20260101 00:00:00', 'Approved', 1)],
        characters=[Character(character_name='Still Synced')],
    )
    sheets = ExplodingClaims()
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert any('claims phase failed' in e for e in summary['errors'])
    assert summary['characters_appended'] == 1


def test_realtime_review_targets_the_pending_row_not_the_denied_one():
    """Same collapse bug on the real-time path: approving a resubmission must
    not rewrite the older, already-denied row."""
    sheets = FakeSheets(claims=[
        _claim(0, 'Daphne Krayt', 'Night 54', '20260324 03:44:47', 'Denied'),
        _claim(1, 'Daphne Krayt', 'Night 54', '20260623 21:37:24', 'Pending'),
    ])
    match = SheetsSyncWorker(sheets)._find_claim_row('daphne krayt', 'Night 54')
    assert match.row_index == 1


def test_realtime_review_falls_back_to_the_most_recent_row():
    """An amendment re-reviews a claim that is already Approved — no pending row."""
    sheets = FakeSheets(claims=[
        _claim(0, 'Daphne Krayt', 'Night 54', '20260324 03:44:47', 'Denied'),
        _claim(1, 'Daphne Krayt', 'Night 54', '20260623 21:37:24', 'Approved'),
    ])
    match = SheetsSyncWorker(sheets)._find_claim_row('Daphne Krayt', 'Night 54')
    assert match.row_index == 1

    assert SheetsSyncWorker(FakeSheets())._find_claim_row('Nobody', 'Night 54') is None


def test_lone_row_pairs_with_the_record_it_was_written_for():
    """When a group's rows are incomplete, the surviving row belongs to whichever
    record its timestamp matches — not automatically to the earliest record.

    Melinda's mirror row carried the resubmission's timestamp because the
    original denial never made it to the sheet; pairing positionally would have
    stamped 'Denied' onto the approved claim's row.
    """
    db = FakeDB(claims=[
        _claim(242, 'Melinda', 'Night 61', '20260601 07:30:32', 'Denied'),
        _claim(246, 'Melinda', 'Night 61', '20260601 21:39:58', 'Approved', approved_xp=4),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Melinda', 'Night 61', '20260601 21:39:58', 'Approved'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    # The existing row already matches the approved record — leave it alone.
    assert summary['claims_status_updated'] == 0
    assert sheets.approved_claims == []
    assert sheets.denied_claims == []
    # The denial is the one missing a row, and it is appended with its own time.
    assert [c.row_index for c in sheets.appended_claims] == [242]
    assert sheets.appended_claims[0].timestamp == '20260601 07:30:32'
    assert sheets.appended_claims[0].status == 'Denied'


def test_timestamp_drift_within_tolerance_still_pairs():
    """The mirror row's timestamp is written by a separate call, so it trails."""
    db = FakeDB(claims=[
        _claim(288, 'Theophilus', 'Night 62', '20260615 11:15:35', 'Denied'),
        _claim(312, 'Theophilus', 'Night 62', '20260618 10:37:01', 'Approved', approved_xp=3),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Theophilus', 'Night 62', '20260615 11:15:51', 'Approved'),
        _claim(1, 'Theophilus', 'Night 62', '20260618 10:37:02', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    # Each row is flipped back to the status of the record it actually belongs to.
    assert summary['claims_appended'] == 0
    assert sheets.denied_claims == [0]
    assert sheets.approved_claims == [1]


def test_rows_out_of_chronological_order_pair_by_timestamp():
    """Nochtli's two rows sit in the sheet in the opposite order to their times."""
    db = FakeDB(claims=[
        _claim(14, 'Nochtli', 'Night 55', '20260305 22:50:17', 'Denied'),
        _claim(15, 'Nochtli', 'Night 55', '20260305 18:11:09', 'Approved', approved_xp=2),
    ])
    sheets = FakeSheets(claims=[
        _claim(0, 'Nochtli', 'Night 55', '20260305 22:50:17', 'Denied'),
        _claim(1, 'Nochtli', 'Night 55', '20260305 18:11:09', 'Denied'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['claims_appended'] == 0
    assert sheets.approved_claims == [1]
    assert sheets.denied_claims == []


def _audit(timestamp, staff, action, target, details=''):
    return AuditEntry(timestamp=timestamp, staff_user=staff, action_type=action,
                      target_character=target, details=details)


def test_audit_entries_missing_from_the_sheet_are_appended():
    """The audit tab had no reconcile phase at all, so dropped rows never healed."""
    db = FakeDB(audit=[
        _audit('20260818 12:31:06', 'player:Mirai-Miki', 'player_claim_submitted', 'Isadora'),
        _audit('20260818 14:56:47', 'Big Ounce', 'approve_claim', 'Aliyah', 'Approved 4 XP'),
    ])
    sheets = FakeSheets(audit=[
        _audit('20260818 12:31:06', 'player:Mirai-Miki', 'player_claim_submitted', 'Isadora'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['audit_appended'] == 1
    assert [e.target_character for e in sheets.appended_audit] == ['Aliyah']


def test_audit_reconcile_is_idempotent():
    db = FakeDB(audit=[_audit('20260818 14:56:47', 'Big Ounce', 'approve_claim', 'Aliyah')])
    sheets = FakeSheets()
    worker = SheetsSyncWorker(sheets)
    assert worker.reconcile(db)['audit_appended'] == 1
    assert worker.reconcile(db)['audit_appended'] == 0


def test_audit_matching_ignores_the_mirror_write_time():
    """log_action stamps the row when the Sheets write happens, not when the
    record was created, so a mirrored row's timestamp trails its record's."""
    db = FakeDB(audit=[_audit('20260818 14:56:47', 'Big Ounce', 'approve_claim', 'Aliyah', 'Approved 4 XP')])
    sheets = FakeSheets(audit=[
        _audit('20260818 14:56:49', 'Big Ounce', 'approve_claim', 'Aliyah', 'Approved 4 XP'),
    ])
    assert SheetsSyncWorker(sheets).reconcile(db)['audit_appended'] == 0


def test_repeated_identical_audit_entries_are_all_mirrored():
    """Two identical actions are two entries, not one — a set-based diff would
    leave the mirror permanently one row short."""
    db = FakeDB(audit=[
        _audit('20260818 14:56:47', 'Big Ounce', 'approve_claim', 'Aliyah'),
        _audit('20260819 11:02:13', 'Big Ounce', 'approve_claim', 'Aliyah'),
    ])
    sheets = FakeSheets(audit=[
        _audit('20260818 14:56:48', 'Big Ounce', 'approve_claim', 'Aliyah'),
    ])
    summary = SheetsSyncWorker(sheets).reconcile(db)

    assert summary['audit_appended'] == 1
    assert SheetsSyncWorker(sheets).reconcile(db)['audit_appended'] == 0


def test_audit_append_failure_is_reported_not_raised():
    class ExplodingAudit(FakeSheets):
        def append_audit_rows(self, entries):
            raise RuntimeError('Sheets 503')

    db = FakeDB(audit=[_audit('20260818 14:56:47', 'Big Ounce', 'approve_claim', 'Aliyah')])
    summary = SheetsSyncWorker(ExplodingAudit()).reconcile(db)

    assert summary['audit_appended'] == 0
    assert any('audit rows' in e for e in summary['errors'])
