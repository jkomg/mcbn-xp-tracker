"""The session-signing key must never fall back to a value anyone could know.

This repo is public. A literal default here -- the previous `dev-key-change-me` --
is a published signing key, so a missing FLASK_SECRET_KEY in production would let
anyone forge a session cookie for any Discord ID, staff included, with nothing in
the logs to show for it. A random per-process key fails closed: sessions stop
persisting across restarts, which someone notices.

Note on method: config.py calls load_dotenv(), and python-dotenv's `override`
defaults to False, so an env var that is *set but empty* wins over a value in
.env while an *unset* one does not. These tests set the variable explicitly for
that reason -- deleting it would let a developer's local .env supply a real key
and quietly pass regardless of what the fallback does.
"""

import importlib
import os

import pytest


def _load_config_with(env_value):
    """Import config.py fresh with FLASK_SECRET_KEY set to a given value."""
    previous = os.environ.get('FLASK_SECRET_KEY')
    os.environ['FLASK_SECRET_KEY'] = env_value
    try:
        import config

        return importlib.reload(config).Config
    finally:
        if previous is None:
            del os.environ['FLASK_SECRET_KEY']
        else:
            os.environ['FLASK_SECRET_KEY'] = previous


def test_configured_key_is_used_verbatim():
    assert _load_config_with('a-real-configured-key').SECRET_KEY == 'a-real-configured-key'


def test_missing_key_does_not_fall_back_to_a_literal():
    key = _load_config_with('').SECRET_KEY

    assert key, 'an empty signing key makes every session route raise'
    assert key != 'dev-key-change-me', 'the published literal must not return'
    assert len(key) >= 32, 'a fallback key must not be guessable by length alone'


def test_missing_key_differs_between_loads():
    """A generated key must be random, not a fixed string with a longer name."""
    first = _load_config_with('').SECRET_KEY
    second = _load_config_with('').SECRET_KEY

    assert first != second


def test_no_literal_fallback_remains_in_config_source():
    """Guards the shape, not just this one value.

    A future edit reintroducing `os.environ.get('FLASK_SECRET_KEY', '...')` would
    restore exactly the bug this file exists to prevent, and the tests above would
    still pass because a literal default is indistinguishable from a real value.
    """
    import config

    with open(config.__file__, encoding='utf-8') as handle:
        source = handle.read()

    assert "os.environ.get('FLASK_SECRET_KEY'," not in source
    assert 'dev-key-change-me' not in source


def test_create_app_refuses_to_start_without_a_configured_key():
    """A generated key is safe to hold, not safe to serve with.

    entrypoint.sh runs gunicorn with 2 workers and no --preload, and Cloud Run runs
    up to 2 instances, so a generated key differs per worker and per instance.
    Sessions would fail depending on which worker answered -- logins bouncing, and
    the OAuth callback failing its state check because the worker that stored
    oauth_state is not the one reading it. Refusing to boot keeps that off the
    internet: on Cloud Run a revision that will not start never takes traffic, so
    the previous healthy revision keeps serving.
    """
    import app as app_package
    import config

    previous = os.environ.get('FLASK_SECRET_KEY')
    os.environ['FLASK_SECRET_KEY'] = ''
    try:
        importlib.reload(config)
        with pytest.raises(RuntimeError, match='FLASK_SECRET_KEY'):
            app_package.create_app()
    finally:
        if previous is None:
            del os.environ['FLASK_SECRET_KEY']
        else:
            os.environ['FLASK_SECRET_KEY'] = previous
        importlib.reload(config)
