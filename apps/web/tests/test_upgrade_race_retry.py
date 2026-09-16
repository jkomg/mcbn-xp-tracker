"""Tests for _upgrade_with_race_retry (Codex P1 on #318).

DDL-level idempotency alone doesn't stop two concurrent workers racing
Alembic's own alembic_version bookkeeping UPDATE — the loser raises
CommandError even though the schema ended up correct. This retries once,
tolerating exactly that race while still surfacing genuine failures.
"""

from unittest.mock import MagicMock

import pytest

from app import _upgrade_with_race_retry


def test_succeeds_immediately_when_no_race():
    upgrade_fn = MagicMock()
    _upgrade_with_race_retry(upgrade_fn)
    upgrade_fn.assert_called_once()


def test_retries_once_after_a_failure_and_succeeds():
    upgrade_fn = MagicMock(side_effect=[RuntimeError('expected to match one row... 0 found'), None])
    _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2


def test_genuine_failure_still_raises_after_retry():
    upgrade_fn = MagicMock(side_effect=RuntimeError('column does not exist'))
    with pytest.raises(RuntimeError):
        _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2


def test_retries_after_flask_migrate_exits_on_the_race():
    """flask_migrate.upgrade reports Alembic's CommandError by logging it and
    calling sys.exit(1). That is the form the real race arrives in, and
    SystemExit is not an Exception."""
    upgrade_fn = MagicMock(side_effect=[SystemExit(1), None])
    _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2


def test_a_genuine_exit_still_exits_after_retry():
    upgrade_fn = MagicMock(side_effect=SystemExit(1))
    with pytest.raises(SystemExit):
        _upgrade_with_race_retry(upgrade_fn)
    assert upgrade_fn.call_count == 2


# ── db.create_all() ──────────────────────────────────────────────────────────

def test_create_all_is_retried_rather_than_left_half_built(tmp_path):
    """Losing the create_all race aborts its walk over the tables. Swallowing
    that would leave every later table missing; a second walk finishes them."""
    from flask import Flask
    from sqlalchemy import inspect
    from sqlalchemy.exc import OperationalError

    from app import _create_all_with_race_retry
    from app.db import db

    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI=f'sqlite:///{tmp_path / "db.sqlite"}',
                      SQLALCHEMY_TRACK_MODIFICATIONS=False)
    db.init_app(app)
    with app.app_context():
        tables = list(db.metadata.sorted_tables)
        calls = {'n': 0}

        def create_all():
            calls['n'] += 1
            if calls['n'] == 1:
                # The other instance created the first table; ours fails on it
                # and never reaches the rest.
                tables[0].create(db.engine)
                raise OperationalError('CREATE TABLE', {}, Exception(f'table {tables[0].name} already exists'))
            db.create_all()

        _create_all_with_race_retry(create_all)

        assert calls['n'] == 2
        assert set(inspect(db.engine).get_table_names()) >= {t.name for t in tables}


def test_create_all_failing_twice_raises():
    from app import _create_all_with_race_retry

    create_all = MagicMock(side_effect=RuntimeError('disk I/O error'))
    with pytest.raises(RuntimeError):
        _create_all_with_race_retry(create_all)
    assert create_all.call_count == 2
