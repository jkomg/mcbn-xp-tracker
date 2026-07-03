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
    db.session.add(DbCharacter(character_name='Elena', player_discord='333333333333333333', active=True))
    db.session.commit()


def _create_thread(client, *, sender='Alice', recipients=None, requester='111111111111111111', nonce='ct-create-1'):
    return client.post(
        '/api/contact-threads',
        headers=_write_headers(nonce=nonce),
        json={
            'senderCharacterName': sender,
            'recipientCharacterNames': recipients if recipients is not None else ['Marcus'],
            'body': 'Meet me at the warehouse tonight.',
            'requesterDiscordId': requester,
            'requesterDiscordName': 'someone',
        },
    )


def test_create_thread_requires_sender_ownership(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_thread(client, requester='222222222222222222', nonce='ct-owner-1')
        assert res.status_code == 403


def test_create_thread_reports_unresolvable_recipient_by_name(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = _create_thread(client, recipients=['Marcus', 'Nobody'], nonce='ct-bad-recipient-1')
        assert res.status_code == 404
        assert 'Nobody' in res.get_json()['error']


def test_create_thread_group_and_list_by_character(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_thread(client, recipients=['Marcus', 'Elena'], nonce='ct-group-1')
        assert created.status_code == 201
        body = created.get_json()
        assert body['thread_id']
        names = {p['character_name'] for p in body['participants']}
        assert names == {'Alice', 'Marcus', 'Elena'}

        # All three participants can see the thread in their list.
        for discord_id in ('111111111111111111', '222222222222222222', '333333333333333333'):
            listing = client.get(f'/api/contact-threads/by-character/{discord_id}', headers=_read_headers())
            assert listing.status_code == 200
            threads = listing.get_json()['threads']
            assert len(threads) == 1
            assert set(threads[0]['participant_names']) == {'Alice', 'Marcus', 'Elena'}
            assert threads[0]['message_count'] == 1


def test_reply_requires_participant(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_thread(client, recipients=['Marcus'], nonce='ct-reply-create')
        thread_id = created.get_json()['thread_id']

        # Elena isn't part of this conversation.
        blocked = client.post(
            f'/api/contact-threads/{thread_id}/messages',
            headers=_write_headers(nonce='ct-reply-1'),
            json={
                'senderCharacterName': 'Elena',
                'body': 'Can I help?',
                'requesterDiscordId': '333333333333333333',
                'requesterDiscordName': 'elena-player',
            },
        )
        assert blocked.status_code == 403


def test_reply_happy_path_notifies_other_participants(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        created = _create_thread(client, recipients=['Marcus', 'Elena'], nonce='ct-reply-create-2')
        thread_id = created.get_json()['thread_id']

        reply = client.post(
            f'/api/contact-threads/{thread_id}/messages',
            headers=_write_headers(nonce='ct-reply-2'),
            json={
                'senderCharacterName': 'Marcus',
                'body': 'On my way.',
                'requesterDiscordId': '222222222222222222',
                'requesterDiscordName': 'marcus-player',
            },
        )
        assert reply.status_code == 201
        body = reply.get_json()
        assert body['ok'] is True
        other_names = {p['character_name'] for p in body['other_participants']}
        assert other_names == {'Alice', 'Elena'}
        assert 'Marcus' not in other_names

        listing = client.get('/api/contact-threads/by-character/111111111111111111', headers=_read_headers())
        assert listing.get_json()['threads'][0]['message_count'] == 2


def test_reply_thread_not_found(app_ctx):
    _seed_characters()
    with app_ctx.test_client() as client:
        res = client.post(
            '/api/contact-threads/999/messages',
            headers=_write_headers(nonce='ct-missing-1'),
            json={
                'senderCharacterName': 'Alice',
                'body': 'hello?',
                'requesterDiscordId': '111111111111111111',
                'requesterDiscordName': 'alice-player',
            },
        )
        assert res.status_code == 404
