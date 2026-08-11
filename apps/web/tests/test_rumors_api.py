import time

import pytest
from flask import Flask

import app as app_module
from app.blueprints.api import bp as api_bp
import app.blueprints.api as api_module
from app.db import db
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


def _read_headers(token='read-token'):
    return {'Authorization': f'Bearer {token}'}


def _create_rumor(client, *, kind='permanent', ic_night_key='', nonce='rumor-create-1', requester='111111111111111111'):
    return client.post(
        '/api/rumors',
        headers=_write_headers(nonce=nonce),
        json={
            'discovery': 'Kindred',
            'rumorText': 'The Prince was seen leaving the Elysium in a hurry.',
            'location': 'Elysium',
            'pointOfContact': 'DC 6',
            'roll': 'Intelligence + Streetwise DC 6',
            'kind': kind,
            'icNightKey': ic_night_key,
            'requesterCharacterName': 'Alice',
            'requesterDiscordId': requester,
            'requesterDiscordName': 'alice',
        },
    )


def test_create_rumor_requires_fields(app_ctx):
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/rumors',
            headers=_write_headers(nonce='rumor-missing-1'),
            json={
                'discovery': 'Kindred',
                'requesterCharacterName': 'Alice',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice',
            },
        )
        assert res.status_code == 400


def test_create_rumor_rejects_unknown_discovery(app_ctx):
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/rumors',
            headers=_write_headers(nonce='rumor-bad-discovery'),
            json={
                'discovery': 'Not A Real Category',
                'rumorText': 'x',
                'roll': 'x',
                'kind': 'permanent',
                'requesterCharacterName': 'Alice',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice',
            },
        )
        assert res.status_code == 400


def test_create_rumor_rejects_unknown_kind(app_ctx):
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/rumors',
            headers=_write_headers(nonce='rumor-bad-kind'),
            json={
                'discovery': 'Kindred',
                'rumorText': 'x',
                'roll': 'x',
                'kind': 'seasonal',
                'requesterCharacterName': 'Alice',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice',
            },
        )
        assert res.status_code == 400


def test_create_rumor_happy_path(app_ctx):
    with app_ctx.test_client() as client:
        res = _create_rumor(client)
        assert res.status_code == 201
        body = res.get_json()
        assert body['ok'] is True
        assert body['rumor']['status'] == 'pending'
        assert body['rumor']['kind'] == 'permanent'
        assert body['rumor']['requester_character_name'] == 'Alice'


def test_create_ephemeral_rumor_stores_ic_night_key(app_ctx):
    with app_ctx.test_client() as client:
        res = _create_rumor(client, kind='ephemeral', ic_night_key='2026-08-11', nonce='rumor-ephemeral-1')
        assert res.status_code == 201
        body = res.get_json()
        assert body['rumor']['kind'] == 'ephemeral'
        assert body['rumor']['ic_night_key'] == '2026-08-11'


def test_permanent_rumor_ignores_ic_night_key(app_ctx):
    with app_ctx.test_client() as client:
        res = _create_rumor(client, kind='permanent', ic_night_key='2026-08-11', nonce='rumor-permanent-key')
        body = res.get_json()
        assert body['rumor']['ic_night_key'] == ''


def test_approve_action_happy_path_and_race(app_ctx):
    with app_ctx.test_client() as client:
        created = _create_rumor(client, nonce='rumor-approve-create')
        rumor_id = created.get_json()['rumor']['id']

        approved = client.post(
            f'/api/rumors/{rumor_id}/approve-action',
            headers=_write_headers(nonce='rumor-approve-1'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert approved.status_code == 200
        approved_body = approved.get_json()
        assert approved_body['rumor']['status'] == 'approved'
        assert approved_body['rumor']['approved_by_name'] == 'firstST'

        # A second ST trying to approve/reject the same (already-resolved)
        # rumor gets a 409 with the current state, not a silent overwrite.
        second = client.post(
            f'/api/rumors/{rumor_id}/reject-action',
            headers=_write_headers(nonce='rumor-approve-2'),
            json={'requesterDiscordId': '444444444444444444', 'requesterDiscordName': 'secondST'},
        )
        assert second.status_code == 409
        assert second.get_json()['rumor']['status'] == 'approved'


def test_reject_action_happy_path_with_reason(app_ctx):
    with app_ctx.test_client() as client:
        created = _create_rumor(client, nonce='rumor-reject-create')
        rumor_id = created.get_json()['rumor']['id']

        rejected = client.post(
            f'/api/rumors/{rumor_id}/reject-action',
            headers=_write_headers(nonce='rumor-reject-1'),
            json={
                'requesterDiscordId': '333333333333333333',
                'requesterDiscordName': 'firstST',
                'reason': 'Too similar to an existing rumor',
            },
        )
        assert rejected.status_code == 200
        body = rejected.get_json()
        assert body['rumor']['status'] == 'rejected'
        assert body['rumor']['rejected_reason'] == 'Too similar to an existing rumor'
        assert body['rumor']['rejected_by_name'] == 'firstST'


def test_approve_action_rumor_not_found(app_ctx):
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/rumors/999/approve-action',
            headers=_write_headers(nonce='rumor-missing-approve'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert res.status_code == 404


def test_set_cubby_message_and_posted_message(app_ctx):
    with app_ctx.test_client() as client:
        created = _create_rumor(client, nonce='rumor-cubby-create')
        rumor_id = created.get_json()['rumor']['id']

        res = client.post(
            f'/api/rumors/{rumor_id}/cubby-message',
            headers=_write_headers(nonce='rumor-cubby-1'),
            json={'channelId': '555', 'messageId': '666'},
        )
        assert res.status_code == 200

        client.post(
            f'/api/rumors/{rumor_id}/approve-action',
            headers=_write_headers(nonce='rumor-cubby-approve'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        posted = client.post(
            f'/api/rumors/{rumor_id}/posted-message',
            headers=_write_headers(nonce='rumor-posted-1'),
            json={'channelId': '777', 'messageId': '888'},
        )
        assert posted.status_code == 200


def test_ephemeral_active_lists_only_approved_ephemeral_rumors(app_ctx):
    with app_ctx.test_client() as client:
        ephemeral = _create_rumor(client, kind='ephemeral', ic_night_key='2026-08-11', nonce='rumor-list-eph')
        eph_id = ephemeral.get_json()['rumor']['id']
        permanent = _create_rumor(client, kind='permanent', nonce='rumor-list-perm')
        perm_id = permanent.get_json()['rumor']['id']

        # Not yet approved — neither should show up.
        listed = client.get('/api/rumors/ephemeral-active', headers=_read_headers())
        assert listed.get_json()['rumors'] == []

        client.post(
            f'/api/rumors/{eph_id}/approve-action',
            headers=_write_headers(nonce='rumor-list-eph-approve'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        client.post(
            f'/api/rumors/{perm_id}/approve-action',
            headers=_write_headers(nonce='rumor-list-perm-approve'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )

        listed = client.get('/api/rumors/ephemeral-active', headers=_read_headers())
        rumor_ids = [r['id'] for r in listed.get_json()['rumors']]
        assert rumor_ids == [eph_id]


def test_expire_action_only_applies_to_approved_rumors(app_ctx):
    with app_ctx.test_client() as client:
        created = _create_rumor(client, kind='ephemeral', ic_night_key='2026-08-11', nonce='rumor-expire-create')
        rumor_id = created.get_json()['rumor']['id']

        # Still pending — can't expire what was never approved.
        premature = client.post(
            f'/api/rumors/{rumor_id}/expire-action',
            headers=_write_headers(nonce='rumor-expire-premature'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert premature.status_code == 409

        client.post(
            f'/api/rumors/{rumor_id}/approve-action',
            headers=_write_headers(nonce='rumor-expire-approve'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        expired = client.post(
            f'/api/rumors/{rumor_id}/expire-action',
            headers=_write_headers(nonce='rumor-expire-1'),
            json={'requesterDiscordId': '333333333333333333', 'requesterDiscordName': 'firstST'},
        )
        assert expired.status_code == 200
        assert expired.get_json()['rumor']['status'] == 'expired'
