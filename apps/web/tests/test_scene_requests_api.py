import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import DbCharacter, db
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


def _seed_characters():
    db.session.add(DbCharacter(character_name='Alice', player_discord='111111111111111111', active=True))
    db.session.commit()


def _create_request(client, *, character='Alice', requester='111111111111111111', nonce='scene-create-1'):
    return client.post(
        '/api/scene-requests',
        headers=_write_headers(nonce=nonce),
        json={
            'characterName': character,
            'spcName': 'Prince Voss',
            'playPeriod': 'Night 14',
            'justification': 'Needs to answer for the elysium incident',
            'requesterDiscordId': requester,
            'requesterDiscordName': 'alice',
        },
    )


def test_create_scene_request_requires_fields(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/scene-requests',
            headers=_write_headers(nonce='scene-missing-1'),
            json={
                'characterName': 'Alice',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice',
            },
        )
        assert res.status_code == 400


def test_create_scene_request_requires_character_ownership(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_request(client, requester='222222222222222222', nonce='scene-owner-1')
        assert res.status_code == 403


def test_create_scene_request_happy_path(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_request(client, nonce='scene-create-2')
        assert res.status_code == 201
        body = res.get_json()
        assert body['ok'] is True
        assert body['request']['status'] == 'pending'
        assert body['request']['requester_character_name'] == 'Alice'
        assert body['request']['spc_name'] == 'Prince Voss'


def test_claim_action_happy_path_and_race(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_request(client, nonce='scene-claim-create')
        request_id = created.get_json()['request']['id']

        claimed = client.post(
            f'/api/scene-requests/{request_id}/claim-action',
            headers=_write_headers(nonce='scene-claim-1'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert claimed.status_code == 200
        claimed_body = claimed.get_json()
        assert claimed_body['request']['status'] == 'claimed'
        assert claimed_body['request']['claimed_by_name'] == 'firstST'

        # A second ST trying to claim the same (already-claimed) request gets a 409
        # with the current state so the bot can show who beat them to it.
        second_claim = client.post(
            f'/api/scene-requests/{request_id}/claim-action',
            headers=_write_headers(nonce='scene-claim-2'),
            json={'requesterDiscordId': '444444444444444444', 'requesterDiscordName': 'secondST'},
        )
        assert second_claim.status_code == 409
        assert second_claim.get_json()['request']['claimed_by_name'] == 'firstST'


def test_reject_action_happy_path_with_reason(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_request(client, nonce='scene-reject-create')
        request_id = created.get_json()['request']['id']

        rejected = client.post(
            f'/api/scene-requests/{request_id}/reject-action',
            headers=_write_headers(nonce='scene-reject-1'),
            json={
                'requesterDiscordId': '333333333333333333',
                'requesterDiscordName': 'firstST',
                'reason': 'SPC is unavailable that night',
            },
        )
        assert rejected.status_code == 200
        body = rejected.get_json()
        assert body['request']['status'] == 'rejected'
        assert body['request']['rejected_reason'] == 'SPC is unavailable that night'


def test_reject_action_already_resolved(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_request(client, nonce='scene-reject-resolved-create')
        request_id = created.get_json()['request']['id']

        client.post(
            f'/api/scene-requests/{request_id}/claim-action',
            headers=_write_headers(nonce='scene-reject-resolved-claim'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )

        already_resolved = client.post(
            f'/api/scene-requests/{request_id}/reject-action',
            headers=_write_headers(nonce='scene-reject-resolved-1'),
            json={'requesterDiscordId': '444444444444444444', 'requesterDiscordName': 'secondST'},
        )
        assert already_resolved.status_code == 409
        assert already_resolved.get_json()['request']['status'] == 'claimed'


def test_claim_action_request_not_found(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/scene-requests/999/claim-action',
            headers=_write_headers(nonce='scene-missing-claim'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert res.status_code == 404


def test_set_queue_message(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_request(client, nonce='scene-queue-create')
        request_id = created.get_json()['request']['id']

        res = client.post(
            f'/api/scene-requests/{request_id}/queue-message',
            headers=_write_headers(nonce='scene-queue-1'),
            json={'channelId': '999999999999999999', 'messageId': '888888888888888888'},
        )
        assert res.status_code == 200
        assert res.get_json()['ok'] is True
