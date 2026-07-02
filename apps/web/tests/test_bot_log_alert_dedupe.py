"""POST /api/bot-log must not let one character's alert suppress another's.

Regression: the Discord alert rate limiter dedupes per key. Bot events that
recur per-character (e.g. a review notifier that can't resolve a cubby
channel) need a key that includes the subject, or the first character's
alert silently swallows every other distinct character's alert for 15
minutes.
"""

from unittest.mock import patch

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import db
from app import discord_alert


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'test-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    app.config['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/test'
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
    return app


def test_distinct_characters_both_alert_within_rate_limit_window():
    app = _app()
    discord_alert._last_sent.clear()
    payload = [
        {'level': 'error', 'event': 'review_notifier_channel_missing',
         'error': 'no channel', 'characterName': 'Emmet Brown', 'eventKey': 'claim:1:approved:1'},
        {'level': 'error', 'event': 'review_notifier_channel_missing',
         'error': 'no channel', 'characterName': 'Aliyah', 'eventKey': 'claim:2:approved:2'},
    ]
    with app.test_client() as client, patch('app.discord_alert.requests.post') as mock_post:
        res = client.post('/api/bot-log', json=payload,
                           headers={'Authorization': 'Bearer write-token'})
    assert res.status_code == 200
    assert mock_post.call_count == 2


def test_same_character_repeated_event_is_still_rate_limited():
    app = _app()
    discord_alert._last_sent.clear()
    payload = [
        {'level': 'error', 'event': 'review_notifier_channel_missing',
         'error': 'no channel', 'characterName': 'Emmet Brown', 'eventKey': 'claim:1:approved:1'},
        {'level': 'error', 'event': 'review_notifier_channel_missing',
         'error': 'no channel', 'characterName': 'Emmet Brown', 'eventKey': 'claim:3:approved:3'},
    ]
    with app.test_client() as client, patch('app.discord_alert.requests.post') as mock_post:
        res = client.post('/api/bot-log', json=payload,
                           headers={'Authorization': 'Bearer write-token'})
    assert res.status_code == 200
    assert mock_post.call_count == 1
