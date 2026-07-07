import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import DiscordPostCount, db
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


def _post(client, entries, mode=None, nonce='n1'):
    body = {'entries': entries}
    if mode is not None:
        body['mode'] = mode
    return client.post('/api/discord-activity/record', headers=_write_headers(nonce=nonce), json=body)


def _entry(count, discord_id='u1', date='2026-06-01', category='ic'):
    return {'discord_id': discord_id, 'date': date, 'category': category, 'count': count}


def _row_count(app):
    with app.app_context():
        row = DiscordPostCount.query.filter_by(discord_id='u1', date='2026-06-01', category='ic').first()
        return row.count if row else None


def test_default_mode_is_additive(app_ctx):
    client = app_ctx.test_client()
    resp1 = _post(client, [_entry(5)], nonce='a1')
    assert resp1.status_code == 200
    resp2 = _post(client, [_entry(3)], nonce='a2')
    assert resp2.status_code == 200
    assert _row_count(app_ctx) == 8


def test_explicit_increment_mode_is_additive(app_ctx):
    client = app_ctx.test_client()
    _post(client, [_entry(5)], mode='increment', nonce='b1')
    _post(client, [_entry(3)], mode='increment', nonce='b2')
    assert _row_count(app_ctx) == 8


def test_replace_mode_overwrites_instead_of_adding(app_ctx):
    """Regression test for the corruption incident: re-running a backfill
    scan over the same window must not compound counts on top of the prior
    run's numbers — each run recomputes the true total from scratch."""
    client = app_ctx.test_client()
    _post(client, [_entry(50)], mode='replace', nonce='c1')
    assert _row_count(app_ctx) == 50

    # Same scan re-run, same window, same recomputed total — must land back
    # at 50, not 100.
    _post(client, [_entry(50)], mode='replace', nonce='c2')
    assert _row_count(app_ctx) == 50


def test_replace_mode_reflects_a_lower_recount(app_ctx):
    client = app_ctx.test_client()
    _post(client, [_entry(50)], mode='replace', nonce='d1')
    _post(client, [_entry(12)], mode='replace', nonce='d2')
    assert _row_count(app_ctx) == 12


def test_invalid_mode_falls_back_to_increment(app_ctx):
    client = app_ctx.test_client()
    _post(client, [_entry(5)], mode='bogus', nonce='e1')
    _post(client, [_entry(3)], mode='bogus', nonce='e2')
    assert _row_count(app_ctx) == 8


def test_implausible_count_rejected_not_stored(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_entry(50000)], nonce='f1')
    assert resp.status_code == 200
    assert resp.get_json()['rejected'] == 1
    assert resp.get_json()['flushed'] == 0
    assert _row_count(app_ctx) is None


def test_implausible_count_does_not_block_other_valid_entries_in_same_batch(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_entry(50000), _entry(4, discord_id='u2')], nonce='g1')
    body = resp.get_json()
    assert body['flushed'] == 1
    assert body['rejected'] == 1

    with app_ctx.app_context():
        row = DiscordPostCount.query.filter_by(discord_id='u2', date='2026-06-01', category='ic').first()
        assert row.count == 4


def test_count_at_ceiling_is_accepted(app_ctx):
    client = app_ctx.test_client()
    resp = _post(client, [_entry(1000)], nonce='h1')
    assert resp.get_json()['rejected'] == 0
    assert _row_count(app_ctx) == 1000
