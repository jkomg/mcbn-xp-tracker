"""create_app() must not repeat schema work in every gunicorn worker.

entrypoint.sh runs `flask db upgrade` and only then starts gunicorn, which
forks 2 workers with no --preload, so each worker imports the app and used to
run db.create_all() plus the Alembic upgrade again -- three full passes over the
same remote database per cold start, two of them pure waste.

That waste is on the startup path, and Cloud Run gives a container 150s to
answer a health check (failureThreshold 30 x periodSeconds 5). On 2026-09-01 a
network degradation in us-central1-b stretched startup from ~14s to 135s+ and
prod stopped starting at all for an hour. Trimming the redundant passes is what
buys back the margin.

The flag defaults to on so `flask run`, the test suite, and fresh installs are
unchanged -- a new database is still built by db.create_all() in the
entrypoint's own create_app() call, before the flag is set for the workers.
"""

import importlib
import os
from unittest.mock import patch

import pytest


def _load_config_with(env_value):
    """Import config.py fresh with RUN_DB_MIGRATIONS_ON_STARTUP set to a value."""
    previous = os.environ.get('RUN_DB_MIGRATIONS_ON_STARTUP')
    if env_value is None:
        os.environ.pop('RUN_DB_MIGRATIONS_ON_STARTUP', None)
    else:
        os.environ['RUN_DB_MIGRATIONS_ON_STARTUP'] = env_value
    try:
        import config

        return importlib.reload(config).Config
    finally:
        if previous is None:
            os.environ.pop('RUN_DB_MIGRATIONS_ON_STARTUP', None)
        else:
            os.environ['RUN_DB_MIGRATIONS_ON_STARTUP'] = previous
        import config

        importlib.reload(config)


def test_defaults_to_running_migrations():
    assert _load_config_with(None).RUN_DB_MIGRATIONS_ON_STARTUP is True


@pytest.mark.parametrize('value', ['false', 'False', 'FALSE', '0', 'no', ' false '])
def test_recognised_off_values(value):
    assert _load_config_with(value).RUN_DB_MIGRATIONS_ON_STARTUP is False


@pytest.mark.parametrize('value', ['true', 'True', '1', 'yes', ''])
def test_anything_else_leaves_migrations_on(value):
    """Only an explicit off value disables it.

    A typo or an empty binding must fail towards doing the schema work, not
    towards a worker quietly serving against an un-migrated database.
    """
    assert _load_config_with(value).RUN_DB_MIGRATIONS_ON_STARTUP is True


def _create_app_with_flag(flag):
    previous = os.environ.get('RUN_DB_MIGRATIONS_ON_STARTUP')
    os.environ['RUN_DB_MIGRATIONS_ON_STARTUP'] = flag
    try:
        import config

        importlib.reload(config)
        import app as app_pkg

        importlib.reload(app_pkg)
        with patch.object(app_pkg.db, 'create_all') as mock_create_all, \
             patch('flask_migrate.upgrade') as mock_upgrade, \
             patch('flask_migrate.stamp') as mock_stamp:
            app_pkg.create_app()
        return mock_create_all, mock_upgrade, mock_stamp
    finally:
        if previous is None:
            os.environ.pop('RUN_DB_MIGRATIONS_ON_STARTUP', None)
        else:
            os.environ['RUN_DB_MIGRATIONS_ON_STARTUP'] = previous
        import config

        importlib.reload(config)


def test_worker_startup_does_no_schema_work_when_disabled():
    mock_create_all, mock_upgrade, mock_stamp = _create_app_with_flag('false')
    mock_create_all.assert_not_called()
    mock_upgrade.assert_not_called()
    mock_stamp.assert_not_called()


def test_schema_work_still_runs_by_default():
    mock_create_all, _, _ = _create_app_with_flag('true')
    mock_create_all.assert_called_once()
