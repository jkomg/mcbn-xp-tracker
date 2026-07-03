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


def _read_headers(token='read-token'):
    return {'Authorization': f'Bearer {token}'}


def _seed_characters():
    db.session.add(DbCharacter(character_name='Alice', player_discord='111111111111111111', active=True))
    db.session.add(DbCharacter(character_name='Marcus', player_discord='222222222222222222', active=True))
    db.session.commit()


def _create_boon(client, *, creditor='Alice', debtor='Marcus', tier='minor',
                  requester='111111111111111111', nonce='boon-create-1'):
    return client.post(
        '/api/boons',
        headers=_write_headers(nonce=nonce),
        json={
            'creditorCharacterName': creditor,
            'debtorCharacterName': debtor,
            'tier': tier,
            'reason': 'Covered for a missed appearance',
            'requesterDiscordId': requester,
            'requesterDiscordName': 'someone',
        },
    )


def test_create_boon_requires_valid_tier(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_boon(client, tier='enormous')
        assert res.status_code == 400


def test_create_boon_requires_creditor_ownership(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_boon(client, requester='222222222222222222', nonce='boon-owner-1')
        assert res.status_code == 403


def test_create_boon_rejects_self_boon(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_boon(client, creditor='Alice', debtor='Alice', nonce='boon-self-1')
        assert res.status_code == 400


def test_create_boon_happy_path_and_list_both_directions(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_boon(client, nonce='boon-create-2')
        assert created.status_code == 201
        body = created.get_json()
        assert body['ok'] is True
        assert body['boon']['status'] == 'owed'
        assert body['boon']['creditor_character_name'] == 'Alice'
        assert body['boon']['debtor_character_name'] == 'Marcus'

        creditor_view = client.get(
            '/api/boons/by-character/111111111111111111', headers=_read_headers()
        )
        assert creditor_view.status_code == 200
        creditor_boons = creditor_view.get_json()['boons']
        assert len(creditor_boons) == 1
        assert creditor_boons[0]['direction'] == 'owed_to_me'
        assert creditor_boons[0]['counterparty_name'] == 'Marcus'

        debtor_view = client.get(
            '/api/boons/by-character/222222222222222222', headers=_read_headers()
        )
        debtor_boons = debtor_view.get_json()['boons']
        assert len(debtor_boons) == 1
        assert debtor_boons[0]['direction'] == 'i_owe'
        assert debtor_boons[0]['counterparty_name'] == 'Alice'


def test_list_boons_status_filter(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        _create_boon(client, nonce='boon-filter-1')
        filtered_out = client.get(
            '/api/boons/by-character/111111111111111111?status=repaid', headers=_read_headers()
        )
        assert filtered_out.get_json()['boons'] == []

        filtered_in = client.get(
            '/api/boons/by-character/111111111111111111?status=owed', headers=_read_headers()
        )
        assert len(filtered_in.get_json()['boons']) == 1


def test_repay_action_full_state_machine(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_boon(client, nonce='boon-repay-create')
        boon_id = created.get_json()['boon']['id']

        # Creditor cannot propose repayment of an owed boon.
        creditor_tries_propose = client.post(
            f'/api/boons/{boon_id}/repay-action',
            headers=_write_headers(nonce='boon-repay-1'),
            json={'requesterDiscordId': '111111111111111111', 'requesterDiscordName': 'alice'},
        )
        assert creditor_tries_propose.status_code == 409

        # Debtor proposes repayment.
        debtor_proposes = client.post(
            f'/api/boons/{boon_id}/repay-action',
            headers=_write_headers(nonce='boon-repay-2'),
            json={'requesterDiscordId': '222222222222222222', 'requesterDiscordName': 'marcus'},
        )
        assert debtor_proposes.status_code == 200
        assert debtor_proposes.get_json()['boon']['status'] == 'repayment_offered'

        # Debtor cannot confirm their own proposal.
        debtor_tries_confirm = client.post(
            f'/api/boons/{boon_id}/repay-action',
            headers=_write_headers(nonce='boon-repay-3'),
            json={'requesterDiscordId': '222222222222222222', 'requesterDiscordName': 'marcus'},
        )
        assert debtor_tries_confirm.status_code == 409

        # Creditor confirms.
        creditor_confirms = client.post(
            f'/api/boons/{boon_id}/repay-action',
            headers=_write_headers(nonce='boon-repay-4'),
            json={'requesterDiscordId': '111111111111111111', 'requesterDiscordName': 'alice'},
        )
        assert creditor_confirms.status_code == 200
        assert creditor_confirms.get_json()['boon']['status'] == 'repaid'

        # Already repaid — any further action is a 409.
        already_repaid = client.post(
            f'/api/boons/{boon_id}/repay-action',
            headers=_write_headers(nonce='boon-repay-5'),
            json={'requesterDiscordId': '111111111111111111', 'requesterDiscordName': 'alice'},
        )
        assert already_repaid.status_code == 409


def test_repay_action_boon_not_found(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/boons/999/repay-action',
            headers=_write_headers(nonce='boon-missing-1'),
            json={'requesterDiscordId': '111111111111111111', 'requesterDiscordName': 'alice'},
        )
        assert res.status_code == 404
