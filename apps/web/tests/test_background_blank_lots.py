"""Per-blank lots: each blank returns on its own night.

Lots are created through blank_character_background, the real write path.
"""

import importlib

import pytest
from flask import Flask
from sqlalchemy.exc import OperationalError

from app.db import DbCharacter, DbCharacterBackground, DbCharacterBackgroundBlank, DbPlayPeriod, db
from app.db_service import DBService

# app/__init__.py binds a DBService *instance* as app.db_service, shadowing the
# module, so reach the module itself this way.
db_service_module = importlib.import_module('app.db_service')


@pytest.fixture()
def svc():
    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI='sqlite:///:memory:', SQLALCHEMY_TRACK_MODIFICATIONS=False)
    db.init_app(app)
    with app.app_context():
        db.create_all()
        db.session.add(DbCharacter(character_name='Aludra', player_discord='111111111111111111',
                                   active=True, status='active'))
        db.session.add(DbPlayPeriod(period_label='Night 68', night_number=68,
                                    submissions_open=True, active=True))
        db.session.commit()
        yield DBService()


def _started(monkeypatch, started_nights):
    """night_has_started answers True only for the given nights."""
    monkeypatch.setattr(db_service_module, 'night_has_started',
                        lambda night, today=None: night in started_nights)


def _lots(svc, name='Aludra'):
    return [(lot['dots'], lot['release_night_number'])
            for lot in svc.get_character_backgrounds(name)[0]['blanks']]


def _bg():
    return DbCharacterBackground.query.one()


# ── Taking blanks ────────────────────────────────────────────────────────────

def test_two_blanks_in_different_nights_keep_separate_nights(svc):
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')   # back on 69
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')   # back on 73

    assert _lots(svc) == [(1, 69), (2, 73)]
    row = svc.get_character_backgrounds('Aludra')[0]
    assert (row['dots_blanked'], row['dots_available']) == (3, 1)
    assert (row['release_night_number'], row['blanked_at_night_number']) == (69, 68)


def test_blanking_early_and_late_in_a_night_does_not_bring_the_late_dots_forward(svc):
    """The interim rule's other failure: one dot blanked early carried three more
    blanked just before the release back with it."""
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    later = svc.blank_character_background('Aludra', 'Mawla', 3, 69, 'test')

    assert later['release_night_number'] == 73
    assert later['next_release_night_number'] == 69
    assert later['outstanding_lots'] == 2


def test_two_blanks_in_the_same_night_are_two_lots(svc):
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')

    assert _lots(svc) == [(1, 69), (1, 69)]


def test_over_blanking_counts_every_outstanding_lot(svc):
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 69, 'test')

    with pytest.raises(ValueError, match='only 1 available'):
        svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')
    assert _lots(svc) == [(1, 69), (1, 73)], 'nothing was recorded'


def test_released_lots_do_not_count_against_the_rating(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')
    _started(monkeypatch, {69})
    svc.release_due_background_blanks(69)

    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')
    assert _lots(svc) == [(2, 73)]


def test_two_reservations_for_the_last_dot_one_wins(svc):
    """Two coterie members blanking the last dot at once. The bound lives in the
    INSERT, so interleaving the two reservations -- both callers already past
    any check they might have made -- still lets exactly one through."""
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    bg_id = _bg().id

    first = svc._reserve_blank(bg_id, 1, 68, 69, 'member-a')
    second = svc._reserve_blank(bg_id, 1, 68, 69, 'member-b')
    db.session.commit()

    assert (first, second) == (True, False)
    assert _bg().dots_blanked == 2


def test_the_loser_of_the_race_is_told_how_many_remain(svc, monkeypatch):
    """The refusal comes from the bounded insert, not from a prior check."""
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    bg_id = _bg().id
    real_reserve = svc._reserve_blank

    def someone_else_first(*args, **kwargs):
        # Another member takes the last dot between this caller's load and insert.
        assert real_reserve(bg_id, 2, 68, 69, 'member-b')
        db.session.commit()
        return real_reserve(*args, **kwargs)

    monkeypatch.setattr(svc, '_reserve_blank', someone_else_first)
    with pytest.raises(ValueError, match='only 0 available'):
        svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'member-a')
    assert _lots(svc) == [(2, 69)]


def test_a_write_conflict_is_retried_not_reported_as_no_dots(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    real_execute = db.session.execute
    calls = {'n': 0}

    def conflict_once(statement, *args, **kwargs):
        if 'INSERT INTO character_background_blanks' in str(statement) and calls['n'] == 0:
            calls['n'] += 1
            raise OperationalError('INSERT', {}, Exception('SQLITE_BUSY: database is locked'))
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db.session, 'execute', conflict_once)
    result = svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')

    assert calls['n'] == 1
    assert result['dots_blanked_total'] == 1


def test_a_conflict_that_persists_is_not_reported_as_no_dots(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    real_execute = db.session.execute

    def always_conflict(statement, *args, **kwargs):
        if 'INSERT INTO character_background_blanks' in str(statement):
            raise OperationalError('INSERT', {}, Exception('SQLITE_BUSY: database is locked'))
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db.session, 'execute', always_conflict)
    with pytest.raises(ValueError, match='please try again') as excinfo:
        svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    assert 'available' not in str(excinfo.value)


def _lands_then_loses_the_response(monkeypatch, times=1):
    """Turso commits the INSERT, then the HTTP response is lost."""
    real_execute = db.session.execute
    calls = {'n': 0}

    def execute(statement, *args, **kwargs):
        result = real_execute(statement, *args, **kwargs)
        if 'INSERT INTO character_background_blanks' in str(statement) and calls['n'] < times:
            calls['n'] += 1
            db.session.commit()   # autocommitted, as on Turso
            raise OperationalError('INSERT', {}, Exception('Turso connection error: timed out'))
        return result

    monkeypatch.setattr(db.session, 'execute', execute)
    return calls


def test_an_insert_that_landed_is_not_recorded_twice(svc, monkeypatch):
    """Codex P1 on #443. With dots to spare, a blind retry would add a second lot."""
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    calls = _lands_then_loses_the_response(monkeypatch)

    result = svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')

    assert calls['n'] == 1
    assert result['dots_blanked_total'] == 1
    assert _lots(svc) == [(1, 69)]


def test_an_insert_that_landed_is_not_reported_as_refused(svc, monkeypatch):
    """The other half: the retry no longer fits, but the first attempt did."""
    svc.set_character_background('Aludra', 'Mawla', 1, 'test')
    _lands_then_loses_the_response(monkeypatch)

    result = svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')

    assert result['dots_available'] == 0
    assert _lots(svc) == [(1, 69)]


def test_the_keyed_retry_skips_itself_if_the_first_insert_landed(svc):
    """If the landed check cannot run, the retry is still safe: the same keyed
    insert does nothing the second time."""
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    bg_id = _bg().id
    blanks = DbCharacterBackgroundBlank.__table__
    assert svc._reserve_blank(bg_id, 1, 68, 69, 'test')
    key = db.session.execute(db.select(blanks.c.request_key)).scalar()
    db.session.commit()

    again = db.insert(blanks).from_select(
        ['character_background_id', 'dots', 'release_night_number', 'created_at',
         'created_by', 'request_key'],
        db.select(db.literal(bg_id), db.literal(1), db.literal(69), db.literal(''),
                  db.literal('t'), db.literal(key)),
    )
    with pytest.raises(Exception):
        db.session.execute(again)   # the unique index refuses a duplicate key
    db.session.rollback()
    assert _lots(svc) == [(1, 69)]


def test_an_unconfirmable_failure_says_so(svc, monkeypatch):
    """Insert and landed-check both fail: whether the blank exists is unknown,
    so the player must not be told that nothing was blanked."""
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    real_execute = db.session.execute

    def insert_fails(statement, *args, **kwargs):
        if 'INSERT INTO character_background_blanks' in str(statement):
            raise OperationalError('INSERT', {}, Exception('Turso connection error'))
        return real_execute(statement, *args, **kwargs)

    def check_fails(_key):
        raise OperationalError('SELECT', {}, Exception('Turso connection error'))

    monkeypatch.setattr(db.session, 'execute', insert_fails)
    monkeypatch.setattr(svc, '_blank_recorded', check_fails)
    with pytest.raises(ValueError, match='Could not confirm whether the blank was recorded'):
        svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')


def test_every_blank_gets_its_own_key(svc):
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    keys = [lot.request_key for lot in DbCharacterBackgroundBlank.query]
    assert len(keys) == 2 and None not in keys and len(set(keys)) == 2


def test_the_derived_values_cannot_be_assigned(svc):
    """An assignment is the bug the lots table removes; it must fail loudly."""
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    row = _bg()
    for attr in ('dots_blanked', 'release_night_number', 'blanked_at_night_number'):
        with pytest.raises(AttributeError):
            setattr(row, attr, 0)
    with pytest.raises(AttributeError):
        DbCharacterBackground(character_name='X', background_key='x', background_name='X',
                              dots_total=1, dots_blanked=0)


# ── Release ──────────────────────────────────────────────────────────────────

def test_only_the_due_lot_releases(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')   # 69
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')   # 73
    _started(monkeypatch, {69, 73})

    released = svc.release_due_background_blanks(69)

    assert [(r['background_name'], r['dots_released']) for r in released] == [('Mawla', 1)]
    assert _lots(svc) == [(2, 73)], 'the later lot keeps its night'


def test_lots_due_the_same_night_release_as_one_entry(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.set_character_background('Aludra', 'Allies', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')
    svc.blank_character_background('Aludra', 'Allies', 1, 68, 'test')
    _started(monkeypatch, {69})

    released = svc.release_due_background_blanks(69)

    assert sorted((r['background_name'], r['dots_released'], r['player_discord']) for r in released) == [
        ('Allies', 1, '111111111111111111'),
        ('Mawla', 3, '111111111111111111'),
    ]
    assert svc.get_character_backgrounds('Aludra')[1]['dots_available'] == 4


def test_one_lot_due_and_another_not_yet_started(svc, monkeypatch):
    """The calendar gate, per lot: both are at or before the open night, only one
    night has actually begun."""
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')   # 69
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')   # 73
    _started(monkeypatch, {69})

    released = svc.release_due_background_blanks(73)

    assert [r['dots_released'] for r in released] == [1]
    assert _lots(svc) == [(2, 73)]


def test_a_lot_on_a_night_the_calendar_lacks_is_held(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 77, 'test')   # no downtime after 77 → 78
    monkeypatch.setattr(db_service_module, 'night_has_started', lambda night, today=None: None)

    assert svc.release_due_background_blanks(78) == []
    assert _lots(svc) == [(2, 78)]
    assert [r['state'] for r in svc.get_outstanding_background_blanks()] == ['unknown']


def test_released_lots_are_kept_with_a_timestamp(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')
    _started(monkeypatch, {69})
    svc.release_due_background_blanks(69)

    lot = DbCharacterBackgroundBlank.query.one()
    assert lot.released_at
    assert lot.dots == 2
    assert svc.release_due_background_blanks(69) == [], 'a released lot never releases twice'


def test_an_overlapping_poll_does_not_report_a_lot_twice(svc, monkeypatch):
    """Two release polls can load the same outstanding lot. Only the one whose
    conditional update claims it may report it, or the player is told twice."""
    svc.set_character_background('Aludra', 'Mawla', 2, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')

    def other_poll_wins(night, today=None):
        # The other poll releases the lot after this one loaded it.
        DbCharacterBackgroundBlank.query.update({'released_at': '20260908 00:00:00'},
                                                synchronize_session=False)
        return True

    monkeypatch.setattr(db_service_module, 'night_has_started', other_poll_wins)

    assert svc.release_due_background_blanks(69) == []


def test_blanking_never_releases_a_due_lot_itself(svc, monkeypatch):
    """Release happens in one place. The old take path auto-released a due blank
    and needed its own calendar gate; there is no second path to gate now."""
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    _started(monkeypatch, {69})

    svc.blank_character_background('Aludra', 'Mawla', 1, 69, 'test')

    assert _lots(svc) == [(1, 69), (1, 73)]


def test_the_staff_view_lists_each_lot(svc):
    svc.set_character_background('Aludra', 'Mawla', 4, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')

    rows = svc.get_outstanding_background_blanks()

    assert [(r['dots_blanked'], r['dots_total'], r['blanked_at_night_number'], r['release_night_number'])
            for r in rows] == [(1, 4, 68, 69), (2, 4, 69, 73)]


# ── Rating reductions ────────────────────────────────────────────────────────

def test_lowering_below_what_is_blanked_trims_the_newest_lot_first(svc):
    svc.set_character_background('Aludra', 'Mawla', 5, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')   # 69
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')   # 73

    result = svc.set_character_background('Aludra', 'Mawla', 3, 'test')

    assert result['dots_unblanked'] == 1
    assert _lots(svc) == [(2, 69), (1, 73)], 'the earliest promised return survives'


def test_a_lot_trimmed_to_nothing_is_removed(svc):
    svc.set_character_background('Aludra', 'Mawla', 5, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')

    svc.set_character_background('Aludra', 'Mawla', 2, 'test')

    assert _lots(svc) == [(2, 69)]
    assert DbCharacterBackgroundBlank.query.count() == 1


def test_lowering_while_still_above_what_is_blanked_changes_no_lot(svc):
    svc.set_character_background('Aludra', 'Mawla', 5, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')

    result = svc.set_character_background('Aludra', 'Mawla', 2, 'test')

    assert result['dots_unblanked'] == 0
    assert _lots(svc) == [(2, 69)]


def test_reducing_to_zero_deletes_the_background_and_every_lot(svc, monkeypatch):
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 1, 68, 'test')
    _started(monkeypatch, {69})
    svc.release_due_background_blanks(69)
    svc.blank_character_background('Aludra', 'Mawla', 2, 69, 'test')

    result = svc.set_character_background('Aludra', 'Mawla', 0, 'test')

    assert result == {'deleted': True, 'background': 'Mawla', 'dots_unblanked': 2}
    assert DbCharacterBackground.query.count() == 0
    assert DbCharacterBackgroundBlank.query.count() == 0, 'released history goes too; no orphans'


# ── Rename ───────────────────────────────────────────────────────────────────

def test_renaming_the_character_keeps_its_lots(svc):
    """Lots hang off the background's id, so rename_character's list of
    name-keyed tables needs no new entry."""
    svc.set_character_background('Aludra', 'Mawla', 3, 'test')
    svc.blank_character_background('Aludra', 'Mawla', 2, 68, 'test')

    svc.rename_character('Aludra', 'Aludra Vey')

    assert _lots(svc, 'Aludra Vey') == [(2, 69)]
