"""Migration 8a3e5c7d9b21: per-blank rows, backfilled from the legacy columns.

The databases that matter already exist, so most of these build one "at the
previous revision": the current schema from create_all (which is what boot runs
before Alembic, so the blanks table is already there), plus the three legacy
columns and their index exactly as 6d2a4f0be9c1 created them, stamped at
3f81c22ad5e7 and holding blank state only in those columns.
"""

from pathlib import Path

import pytest
from flask import Flask
from flask_migrate import Migrate, downgrade, stamp, upgrade
from sqlalchemy import text

from app.db import db

_MIGRATIONS = str(Path(__file__).resolve().parents[1] / 'migrations')
_PREVIOUS = '3f81c22ad5e7'
_THIS = '8a3e5c7d9b21'
_HEAD = 'c4e1a9f27b58'


def _make_app(db_path):
    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=f'sqlite:///{db_path}',
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    Migrate(app, db, directory=_MIGRATIONS)
    return app


def _sql(statement, **params):
    with db.engine.begin() as conn:
        return conn.execute(text(statement), params)


def _rows(statement, **params):
    with db.engine.connect() as conn:
        return [tuple(r) for r in conn.execute(text(statement), params)]


def _legacy_database(app, drop_blanks_table=False):
    with app.app_context():
        db.create_all()
        _sql('ALTER TABLE character_backgrounds ADD COLUMN dots_blanked INTEGER NOT NULL DEFAULT 0')
        _sql('ALTER TABLE character_backgrounds ADD COLUMN blanked_at_night_number INTEGER')
        _sql('ALTER TABLE character_backgrounds ADD COLUMN release_night_number INTEGER')
        _sql('CREATE INDEX ix_character_backgrounds_release_night '
             'ON character_backgrounds (release_night_number)')
        if drop_blanks_table:
            _sql('DROP TABLE character_background_blanks')
        stamp(revision=_PREVIOUS)


def _background(name, key, total, blanked=0, blanked_at=None, release=None, donated=None):
    _sql(
        'INSERT INTO character_backgrounds '
        '(character_name, background_key, background_name, dots_total, updated_at, updated_by, '
        ' dots_blanked, blanked_at_night_number, release_night_number, donated_coterie_id) '
        "VALUES (:n, :k, :k, :t, '20260901 00:00:00', 'test', :b, :a, :r, :d)",
        n=name, k=key, t=total, b=blanked, a=blanked_at, r=release, d=donated,
    )
    return _rows('SELECT id FROM character_backgrounds WHERE character_name = :n AND background_key = :k',
                 n=name, k=key)[0][0]


def _lots(bg_id):
    return _rows(
        'SELECT dots, blanked_at_night_number, release_night_number, released_at '
        'FROM character_background_blanks WHERE character_background_id = :i ORDER BY id',
        i=bg_id,
    )


def _legacy(bg_id):
    return _rows(
        'SELECT dots_blanked, blanked_at_night_number, release_night_number '
        'FROM character_backgrounds WHERE id = :i', i=bg_id,
    )[0]


def _seed(app):
    """A timed blank, a donated background mid-blank, and an unblanked one."""
    with app.app_context():
        from app.db import Coterie
        coterie = Coterie(name='Accord', slug='accord', status='active', creation_state='active')
        db.session.add(coterie)
        db.session.commit()
        coterie_id = coterie.id
        return {
            'timed': _background('Aludra', 'mawla', 3, blanked=2, blanked_at=68, release=69),
            'donated': _background('Fiora', 'haven', 3, blanked=1, blanked_at=68, release=69,
                                   donated=coterie_id),
            'idle': _background('Bastet', 'allies', 2),
        }


@pytest.fixture()
def app(tmp_path):
    return _make_app(tmp_path / 'db.sqlite')


@pytest.mark.parametrize('drop_blanks_table', [False, True],
                         ids=['table-from-create_all', 'table-from-migration'])
def test_upgrade_backfills_one_lot_per_blanked_background(app, drop_blanks_table):
    _legacy_database(app, drop_blanks_table=drop_blanks_table)
    ids = _seed(app)

    with app.app_context():
        upgrade()

        assert _lots(ids['timed']) == [(2, 68, 69, None)]
        assert _lots(ids['donated']) == [(1, 68, 69, None)]
        assert _lots(ids['idle']) == []
        assert _rows('SELECT sql FROM sqlite_master WHERE name = '
                     "'ix_character_background_blanks_outstanding_release'")[0][0].endswith(
            'WHERE released_at IS NULL')
        # Additive: the legacy columns and their index are left for the follow-up.
        assert _legacy(ids['timed']) == (2, 68, 69)
        assert _rows("SELECT name FROM sqlite_master WHERE name = 'ix_character_backgrounds_release_night'")


def test_backfilled_lots_are_what_the_model_reads(app):
    from app.db import DbCharacterBackground

    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        row = db.session.get(DbCharacterBackground, ids['timed'])
        assert (row.dots_blanked, row.dots_available, row.release_night_number,
                row.blanked_at_night_number) == (2, 1, 69, 68)


def test_rerunning_the_upgrade_is_a_no_op(app):
    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        stamp(revision=_PREVIOUS)
        upgrade()

        assert _lots(ids['timed']) == [(2, 68, 69, None)]
        assert _lots(ids['donated']) == [(1, 68, 69, None)]


def test_a_rerun_does_not_backfill_a_lot_already_released(app):
    """The legacy column goes stale once the new code is live. A released lot
    still counts as 'this background has rows', or a rerun would blank it again."""
    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        _sql("UPDATE character_background_blanks SET released_at = '20260908 00:00:00'")
        stamp(revision=_PREVIOUS)
        upgrade()

        assert _lots(ids['timed']) == [(2, 68, 69, '20260908 00:00:00')]


_BOOT = """
import os, sys, time
sys.path.insert(0, {root!r})
from flask import Flask
from flask_migrate import Migrate, upgrade
from app import _upgrade_with_race_retry
from app.db import db
app = Flask('boot')
app.config.update(SQLALCHEMY_DATABASE_URI={uri!r}, SQLALCHEMY_TRACK_MODIFICATIONS=False)
db.init_app(app)
Migrate(app, db, directory={migrations!r})
while not os.path.exists({go!r}):
    time.sleep(0.005)
with app.app_context():
    _upgrade_with_race_retry(upgrade)
"""


def test_two_instances_upgrading_together_backfill_once(tmp_path):
    """Separate processes, as two Cloud Run instances are. Alembic's `op` and
    `context` are process-global, so threads in one process are not a valid
    stand-in -- they interleave each other's migration state.

    What this proves is that the loser survives: it loses Alembic's
    alembic_version update, which flask_migrate turns into sys.exit(1), and
    _upgrade_with_race_retry has to catch that. It does not prove the backfill's
    NOT EXISTS -- on SQLite the loser's whole migration is one transaction and
    its insert rolls back anyway. Turso's HTTP adapter autocommits each
    statement, so there the loser's insert would stand; the rerun tests above
    are what show a second backfill adds nothing.
    """
    import subprocess
    import sys

    db_path = tmp_path / 'db.sqlite'
    seed_app = _make_app(db_path)
    _legacy_database(seed_app)
    ids = _seed(seed_app)

    go = tmp_path / 'go'
    script = _BOOT.format(
        root=str(Path(__file__).resolve().parents[1]),
        uri=f'sqlite:///{db_path}',
        migrations=_MIGRATIONS,
        go=str(go),
    )
    procs = [
        subprocess.Popen([sys.executable, '-c', script], stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True)
        for _ in range(2)
    ]
    go.touch()
    outputs = [p.communicate(timeout=60)[0] for p in procs]

    assert [p.returncode for p in procs] == [0, 0], outputs
    with seed_app.app_context():
        assert _lots(ids['timed']) == [(2, 68, 69, None)]
        assert _lots(ids['donated']) == [(1, 68, 69, None)]


def test_a_blank_with_no_releasing_night_is_cleared(app):
    """Unrepresentable -- every blank now returns. Only the donation bug fixed in
    #440 made one. Deliberately cleared, not preserved."""
    _legacy_database(app)
    with app.app_context():
        bg_id = _background('Fiora', 'haven', 3, blanked=3, blanked_at=None, release=None)
        upgrade()

        assert _lots(bg_id) == []
        assert _legacy(bg_id) == (0, None, None)


def test_a_rating_below_the_legacy_blank_is_clamped(app):
    _legacy_database(app)
    with app.app_context():
        bg_id = _background('Aludra', 'mawla', 1, blanked=3, blanked_at=68, release=69)
        upgrade()
        assert _lots(bg_id) == [(1, 68, 69, None)]


def test_upgrade_downgrade_upgrade_keeps_every_dot(app):
    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        downgrade(revision=_PREVIOUS)

        assert _legacy(ids['timed']) == (2, 68, 69)
        assert _legacy(ids['donated']) == (1, 68, 69)
        assert _legacy(ids['idle']) == (0, None, None)
        assert 'character_background_blanks' not in {
            r[0] for r in _rows("SELECT name FROM sqlite_master WHERE type = 'table'")}

        upgrade()
        assert _lots(ids['timed']) == [(2, 68, 69, None)]
        assert _lots(ids['donated']) == [(1, 68, 69, None)]


def test_downgrade_collapses_several_lots_onto_the_earliest(app):
    from app.db_service import DBService

    _legacy_database(app)
    with app.app_context():
        bg_id = _background('Aludra', 'mawla', 3)
        upgrade()
        svc = DBService()
        assert svc._reserve_blank(bg_id, 1, 69, 73, 'test')
        assert svc._reserve_blank(bg_id, 2, 68, 69, 'test')
        db.session.commit()

        downgrade(revision=_PREVIOUS)
        # Three dots out; the next release is the Night 69 lot, taken on 68.
        assert _legacy(bg_id) == (3, 68, 69)


def test_downgrade_zeroes_a_background_whose_lot_was_released(app):
    """Its legacy column is stale and non-zero, and it has no outstanding lot.
    A repopulate-only downgrade would leave it claiming dots already back."""
    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        _sql("UPDATE character_background_blanks SET released_at = '20260908 00:00:00' "
             'WHERE character_background_id = :i', i=ids['timed'])
        assert _legacy(ids['timed']) == (2, 68, 69), 'stale while the change is live'

        downgrade(revision=_PREVIOUS)

        assert _legacy(ids['timed']) == (0, None, None)
        assert _legacy(ids['donated']) == (1, 68, 69)


def test_downgrade_on_a_fresh_database_recreates_the_columns(app):
    """create_all builds the post-change table and boot stamps it at head, so
    the legacy columns never existed. The downgrade has to add them, with the
    original NOT NULL DEFAULT 0, before it can fill them -- and there are rows."""
    from app.db_service import DBService

    with app.app_context():
        db.create_all()
        stamp(revision='head')
        svc = DBService()
        svc.set_character_background('Aludra', 'Mawla', 3, 'test')
        svc.set_character_background('Bastet', 'Allies', 2, 'test')
        bg_id = _rows("SELECT id FROM character_backgrounds WHERE background_key = 'mawla'")[0][0]
        assert svc._reserve_blank(bg_id, 2, 68, 69, 'test')
        db.session.commit()

        downgrade(revision=_PREVIOUS)

        assert _legacy(bg_id) == (2, 68, 69)
        other = _rows("SELECT id FROM character_backgrounds WHERE background_key = 'allies'")[0][0]
        assert _legacy(other) == (0, None, None)

        upgrade()
        assert _lots(bg_id) == [(2, 68, 69, None)]


def test_upgrade_on_a_fresh_database_skips_the_backfill(app):
    """No legacy columns, so the backfill must not reference them."""
    with app.app_context():
        db.create_all()
        stamp(revision=_PREVIOUS)
        upgrade()
        assert _rows('SELECT COUNT(*) FROM character_background_blanks') == [(0,)]


def test_this_migration_is_the_head(app):
    from alembic.script import ScriptDirectory

    with app.app_context():
        config = app.extensions['migrate'].migrate.get_config(_MIGRATIONS)
        assert ScriptDirectory.from_config(config).get_heads() == [_HEAD]


# ── c4e1a9f27b58: request_key ────────────────────────────────────────────────

def _request_key_state():
    columns = {r[1] for r in _rows("PRAGMA table_info('character_background_blanks')")}
    index = _rows("SELECT sql FROM sqlite_master WHERE name = 'uq_character_background_blanks_request_key'")
    return 'request_key' in columns, index[0][0] if index else None


def test_request_key_is_added_to_a_table_the_earlier_migration_built(app):
    """Dev ran 8a3e5c7d9b21 before the key existed, so its table lacks it."""
    _legacy_database(app, drop_blanks_table=True)
    ids = _seed(app)
    with app.app_context():
        upgrade(revision=_THIS)
        assert _request_key_state() == (False, None)

        upgrade()

        has_column, index_sql = _request_key_state()
        assert has_column
        assert index_sql.startswith('CREATE UNIQUE INDEX')
        assert _rows('SELECT request_key FROM character_background_blanks '
                     'WHERE character_background_id = :i', i=ids['timed']) == [(None,)]


def test_request_key_migration_is_a_no_op_where_create_all_built_it(app):
    _legacy_database(app)
    with app.app_context():
        assert _request_key_state()[0], 'create_all already made the column'
        upgrade()
        upgrade(revision=_THIS)   # nothing to do: already past it
        assert _request_key_state()[0]


def test_request_key_downgrade_drops_index_then_column(app):
    _legacy_database(app)
    ids = _seed(app)
    with app.app_context():
        upgrade()
        downgrade(revision=_THIS)
        assert _request_key_state() == (False, None)
        assert _lots(ids['timed']) == [(2, 68, 69, None)], 'lots survive'
        upgrade()
        assert _request_key_state()[0]
