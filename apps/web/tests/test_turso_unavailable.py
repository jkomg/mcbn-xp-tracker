"""Turso outages: classify transient failures, retry safe reads once, answer 503."""

import http.client
import importlib
import io
import json
import sqlite3
import urllib.error
from unittest.mock import patch

import pytest
from sqlalchemy.exc import OperationalError

from app import turso_http
from app.turso_http import TursoUnavailableError


def _ok_body(rows=(('1',),)):
    return json.dumps({
        'baton': None,
        'results': [
            {'type': 'ok', 'response': {'type': 'execute', 'result': {
                'cols': [{'name': 'x'}],
                'rows': [[{'type': 'integer', 'value': r[0]} for _ in [0]] for r in rows],
                'affected_row_count': 0,
                'last_insert_rowid': None,
            }}},
            {'type': 'ok', 'response': {'type': 'close'}},
        ],
    }).encode()


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _scripted_urlopen(monkeypatch, outcomes):
    """Each outcome is an exception to raise or bytes to return, in order."""
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append(json.loads(req.data))
        outcome = outcomes[len(calls) - 1]
        if isinstance(outcome, BaseException):
            raise outcome
        return _Resp(outcome)

    monkeypatch.setattr(turso_http.urllib.request, 'urlopen', fake_urlopen)
    return calls


def _http_error(code):
    return urllib.error.HTTPError('https://db', code, 'x', {}, io.BytesIO(b'upstream'))


# ── Classification ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('exc', [
    urllib.error.URLError(TimeoutError('timed out')),
    TimeoutError('The read operation timed out'),
    http.client.RemoteDisconnected('Remote end closed connection without response'),
    _http_error(502),
    _http_error(503),
    _http_error(504),
])
def test_transient_failures_raise_turso_unavailable(monkeypatch, exc):
    _scripted_urlopen(monkeypatch, [exc, exc])
    conn = turso_http.connect('https://db', auth_token='t')
    with pytest.raises(TursoUnavailableError):
        conn.cursor().execute('INSERT INTO t VALUES (1)')


def test_turso_unavailable_is_still_an_operational_error():
    # Existing `except sqlite3.OperationalError` handlers must keep catching it.
    assert issubclass(TursoUnavailableError, sqlite3.OperationalError)


def test_client_errors_are_not_classed_as_unavailable(monkeypatch):
    _scripted_urlopen(monkeypatch, [_http_error(400)])
    conn = turso_http.connect('https://db', auth_token='t')
    with pytest.raises(sqlite3.OperationalError) as info:
        conn.cursor().execute('SELECT 1')
    assert not isinstance(info.value, TursoUnavailableError)


# ── Retry ─────────────────────────────────────────────────────────────────────

def test_autocommit_select_retries_once_after_dropped_connection(monkeypatch):
    calls = _scripted_urlopen(monkeypatch, [
        http.client.RemoteDisconnected('Remote end closed connection without response'),
        _ok_body(),
    ])
    conn = turso_http.connect('https://db', auth_token='t')
    cur = conn.cursor().execute('SELECT 1')
    assert cur.fetchall() == [(1,)]
    assert len(calls) == 2


def test_select_gives_up_after_one_retry(monkeypatch):
    dropped = http.client.RemoteDisconnected('Remote end closed connection without response')
    calls = _scripted_urlopen(monkeypatch, [dropped, dropped, _ok_body()])
    conn = turso_http.connect('https://db', auth_token='t')
    with pytest.raises(TursoUnavailableError):
        conn.cursor().execute('SELECT 1')
    assert len(calls) == 2


def test_writes_are_not_retried(monkeypatch):
    # Turso may have applied the write before the connection dropped.
    calls = _scripted_urlopen(monkeypatch, [
        http.client.RemoteDisconnected('Remote end closed connection without response'),
        _ok_body(),
    ])
    conn = turso_http.connect('https://db', auth_token='t')
    with pytest.raises(TursoUnavailableError):
        conn.cursor().execute('UPDATE t SET x = 1')
    assert len(calls) == 1


def test_select_inside_a_transaction_is_not_retried(monkeypatch):
    calls = _scripted_urlopen(monkeypatch, [
        http.client.RemoteDisconnected('Remote end closed connection without response'),
        _ok_body(),
    ])
    conn = turso_http.connect('https://db', auth_token='t')
    conn._baton = 'open-tx'
    with pytest.raises(TursoUnavailableError):
        conn.cursor().execute('SELECT 1')
    assert len(calls) == 1


def test_timeouts_are_not_retried(monkeypatch):
    # A timed-out request already cost 30s; a retry would double the wait.
    calls = _scripted_urlopen(monkeypatch, [
        TimeoutError('The read operation timed out'),
        _ok_body(),
    ])
    conn = turso_http.connect('https://db', auth_token='t')
    with pytest.raises(TursoUnavailableError):
        conn.cursor().execute('SELECT 1')
    assert len(calls) == 1


# ── 503 handler ───────────────────────────────────────────────────────────────

def _wrapped(orig):
    return OperationalError('SELECT 1', {}, orig)


@pytest.fixture
def real_app(monkeypatch):
    """create_app() with startup schema work stubbed, as in test_startup_migration_gate."""
    monkeypatch.setenv('FLASK_SECRET_KEY', 'test-key-for-create-app')
    monkeypatch.setenv('RUN_DB_MIGRATIONS_ON_STARTUP', 'false')
    monkeypatch.setenv('DATABASE_URL', 'sqlite://')
    import config

    importlib.reload(config)
    import app as app_pkg

    importlib.reload(app_pkg)
    with patch.object(app_pkg.db, 'create_all'), \
         patch('flask_migrate.upgrade'), patch('flask_migrate.stamp'):
        application = app_pkg.create_app()
    application.config['PROPAGATE_EXCEPTIONS'] = False
    application.testing = False
    with application.app_context():
        app_pkg.db.create_all()
    yield application
    importlib.reload(config)


def _add_raising_routes(application, exc):
    application.add_url_rule('/api/_test_raise', '_test_api_raise', lambda: (_ for _ in ()).throw(exc))
    application.add_url_rule('/_test_raise', '_test_page_raise', lambda: (_ for _ in ()).throw(exc))


def test_api_route_answers_503_json_when_turso_unavailable(real_app):
    _add_raising_routes(real_app, _wrapped(TursoUnavailableError('Turso connection error: x')))
    with patch('app.discord_alert.check_escalation') as escalation:
        res = real_app.test_client().get('/api/_test_raise')
    assert res.status_code == 503
    assert res.get_json() == {'ok': False, 'error': 'db_unavailable'}
    assert res.headers['Retry-After'] == '30'
    escalation.assert_not_called()
    with real_app.app_context():
        from app.db import AppLogEntry
        assert AppLogEntry.query.filter_by(event='unhandled_exception').count() == 0


def test_page_answers_503_when_turso_unavailable(real_app):
    _add_raising_routes(real_app, _wrapped(TursoUnavailableError('Turso connection error: x')))
    res = real_app.test_client().get('/_test_raise')
    assert res.status_code == 503
    assert b'database' in res.data.lower()


def test_other_operational_errors_are_still_unhandled_500s(real_app):
    _add_raising_routes(real_app, _wrapped(sqlite3.OperationalError('Turso: no such table: t')))
    res = real_app.test_client().get('/api/_test_raise')
    assert res.status_code == 500
    with real_app.app_context():
        from app.db import AppLogEntry
        assert AppLogEntry.query.filter_by(event='unhandled_exception').count() == 1
