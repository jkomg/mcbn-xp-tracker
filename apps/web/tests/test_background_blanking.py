import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import DbCharacter, DbPlayPeriod, db
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


def _write_headers(token='write-token', nonce='n1'):
    return {
        'Authorization': f'Bearer {token}',
        'X-Request-Timestamp': str(int(time.time())),
        'X-Request-Nonce': nonce,
    }


def _seed_character_period():
    db.session.add(DbCharacter(character_name='Aludra', player_discord='111111111111111111', active=True, status='active'))
    db.session.add(DbPlayPeriod(period_label='Night 101 - 4/20 - 5/4', night_number=101, submissions_open=True, active=True))
    db.session.commit()


def test_blank_and_release_cycle(app_ctx):
    svc = DBService()
    _seed_character_period()

    svc.set_character_background('Aludra', 'Allies', 3, 'test')
    result = svc.blank_character_background('Aludra', 'Allies', 2, 101, 'test')
    assert result['dots_blanked_total'] == 2
    assert result['release_night_number'] == 102

    rows = svc.get_character_backgrounds('Aludra')
    assert rows[0]['dots_available'] == 1

    released_none = svc.release_due_background_blanks(101)
    assert released_none == []

    released = svc.release_due_background_blanks(102)
    assert len(released) == 1
    assert released[0]['background_name'] == 'Allies'
    assert released[0]['dots_released'] == 2

    rows_after = svc.get_character_backgrounds('Aludra')
    assert rows_after[0]['dots_blanked'] == 0
    assert rows_after[0]['dots_available'] == 3


def test_blank_background_api_enforces_owner(app_ctx):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Resources', 2, 'test')

    with app_ctx.test_client() as client:
        # non-owner requester
        res = client.post(
            '/api/backgrounds/blank',
            headers=_write_headers(nonce='owner-1'),
            json={
                'requesterDiscordId': '222222222222222222',
                'requesterDiscordName': 'player2',
                'characterName': 'Aludra',
                'backgroundName': 'Resources',
                'dots': 1,
            },
        )
        assert res.status_code == 403

        # owner requester
        ok = client.post(
            '/api/backgrounds/blank',
            headers=_write_headers(nonce='owner-2'),
            json={
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'player1',
                'characterName': 'Aludra',
                'backgroundName': 'Resources',
                'dots': 1,
            },
        )
        assert ok.status_code == 200
        data = ok.get_json()
        assert data['ok'] is True
        assert data['result']['dots_blanked_now'] == 1


def test_release_due_backgrounds_api_returns_released(app_ctx):
    svc = DBService()
    _seed_character_period()
    svc.set_character_background('Aludra', 'Contacts', 2, 'test')
    svc.blank_character_background('Aludra', 'Contacts', 1, 101, 'test')

    with app_ctx.test_client() as client:
        res = client.post('/api/backgrounds/release-due', headers=_write_headers(nonce='release-1'))
        assert res.status_code == 200
        payload = res.get_json()
        # current night is still 101 so nothing due yet
        assert payload['released'] == []

    # simulate next night opening
    with app_ctx.app_context():
        period = DbPlayPeriod.query.filter_by(period_label='Night 101 - 4/20 - 5/4').first()
        assert period is not None
        period.submissions_open = False
        db.session.add(DbPlayPeriod(period_label='Night 102 - 5/5 - 5/19', night_number=102, submissions_open=True, active=True))
        db.session.commit()

    with app_ctx.test_client() as client:
        res = client.post('/api/backgrounds/release-due', headers=_write_headers(nonce='release-2'))
        assert res.status_code == 200
        payload = res.get_json()
        assert len(payload['released']) == 1
        assert payload['released'][0]['background_name'] == 'Contacts'
        assert payload['released'][0]['dots_released'] == 1
