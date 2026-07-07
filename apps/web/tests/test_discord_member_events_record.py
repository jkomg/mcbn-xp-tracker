import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import DiscordMemberEvent, db
from app.db_service import DBService


@pytest.fixture()
def app_ctx():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = True
    app.config['BOT_API_REPLAY_WINDOW_SECONDS'] = 300
    app.config['BOT_API_NONCE_TTL_SECONDS'] = 600
    app.config['BOT_API_NONCE_CACHE_SIZE'] = 1000
    app.config['ALLOWED_DISCORD_IDS'] = {'999999999999999999'}
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
        app_module.db_service = DBService()
        api_module.db_service = app_module.db_service
        yield app


def _write_headers(nonce='n1'):
    return {
        'Authorization': 'Bearer write-token',
        'X-Request-Timestamp': str(int(time.time())),
        'X-Request-Nonce': nonce,
    }


def _post(client, events, nonce='n1'):
    return client.post('/api/discord-member-events/record', headers=_write_headers(nonce=nonce), json={'events': events})


def _join(discord_id='u1', date='2026-06-01'):
    return {'discord_id': discord_id, 'event_type': 'join', 'role': '', 'date': date}


def _role_gain(discord_id='u1', role='kindred', date='2026-06-01'):
    return {'discord_id': discord_id, 'event_type': 'role_gain', 'role': role, 'date': date}


def _all_rows(app):
    with app.app_context():
        return DiscordMemberEvent.query.all()


def test_join_event_inserted(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_join()], nonce='a1')
    assert resp.status_code == 200
    assert resp.get_json()['inserted'] == 1
    rows = _all_rows(app_ctx)
    assert len(rows) == 1
    assert rows[0].event_type == 'join'
    assert rows[0].role == ''


def test_role_gain_event_inserted(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_role_gain(role='ghoul')], nonce='b1')
    assert resp.status_code == 200
    rows = _all_rows(app_ctx)
    assert len(rows) == 1
    assert rows[0].event_type == 'role_gain'
    assert rows[0].role == 'ghoul'


def test_duplicate_event_is_idempotent_no_op(app_ctx):
    """Regression guard for the corruption-class bug: posting the exact same
    event twice (e.g. a full member sweep re-run on every bot restart) must
    not create a duplicate row."""
    client = app_ctx.test_client()
    _post(client, [_join(date='2026-06-01')], nonce='c1')
    _post(client, [_join(date='2026-06-01')], nonce='c2')
    rows = _all_rows(app_ctx)
    assert len(rows) == 1


def test_same_person_different_dates_are_distinct_events(app_ctx):
    """A genuine rejoin on a different day is real, distinct signal — not a
    duplicate to be collapsed."""
    client = app_ctx.test_client()
    _post(client, [_join(date='2026-06-01')], nonce='d1')
    _post(client, [_join(date='2026-06-15')], nonce='d2')
    rows = _all_rows(app_ctx)
    assert len(rows) == 2


def test_same_person_different_roles_are_distinct_events(app_ctx):
    client = app_ctx.test_client()
    _post(client, [_role_gain(role='mortal', date='2026-06-01')], nonce='e1')
    _post(client, [_role_gain(role='kindred', date='2026-06-01')], nonce='e2')
    rows = _all_rows(app_ctx)
    assert len(rows) == 2


def test_role_gain_without_role_rejected(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [{'discord_id': 'u1', 'event_type': 'role_gain', 'role': '', 'date': '2026-06-01'}], nonce='f1')
    assert resp.get_json()['inserted'] == 0
    assert _all_rows(app_ctx) == []


def test_join_with_role_rejected(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [{'discord_id': 'u1', 'event_type': 'join', 'role': 'kindred', 'date': '2026-06-01'}], nonce='g1')
    assert resp.get_json()['inserted'] == 0
    assert _all_rows(app_ctx) == []


def test_invalid_event_type_rejected(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [{'discord_id': 'u1', 'event_type': 'bogus', 'role': '', 'date': '2026-06-01'}], nonce='h1')
    assert resp.get_json()['inserted'] == 0


def test_invalid_role_rejected(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_role_gain(role='bogus')], nonce='i1')
    assert resp.get_json()['inserted'] == 0


def test_batch_cap_enforced(app_ctx):
    client = app_ctx.test_client()
    events = [_join(discord_id=f'u{i}') for i in range(501)]
    resp = _post(client, events, nonce='j1')
    assert resp.status_code == 400


def test_mixed_batch_valid_and_invalid(app_ctx):
    client = app_ctx.test_client()
    events = [_join(discord_id='u1'), {'discord_id': '', 'event_type': 'join', 'role': '', 'date': '2026-06-01'}]
    resp = _post(client, events, nonce='k1')
    assert resp.get_json()['inserted'] == 1
    assert len(_all_rows(app_ctx)) == 1


def test_names_dict_upserted(app_ctx):
    from app.db import DiscordDisplayName
    client = app_ctx.test_client()
    client.post(
        '/api/discord-member-events/record',
        headers=_write_headers(nonce='l1'),
        json={'events': [_join()], 'names': {'u1': 'Alice'}},
    )
    with app_ctx.app_context():
        row = DiscordDisplayName.query.filter_by(discord_id='u1').first()
        assert row.display_name == 'Alice'
