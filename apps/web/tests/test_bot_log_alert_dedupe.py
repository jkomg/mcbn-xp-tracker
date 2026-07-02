"""POST /api/bot-log must count occurrences per-subject, not per-event.

Regression: escalation counts by dedupe_key. Bot events that recur
per-character (e.g. a review notifier that can't resolve a cubby channel)
need a key that includes the subject, or one character's occurrences would
count toward — and could trigger escalation on behalf of — a different,
unrelated character hitting the same event name.
"""

from unittest.mock import patch

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import db
from app.discord_alert import ESCALATION_THRESHOLD


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


def _entry(character_name: str, i: int) -> dict:
    return {
        'level': 'error', 'event': 'review_notifier_channel_missing',
        'error': 'no channel', 'characterName': character_name,
        'eventKey': f'claim:{i}:approved:{i}',
    }


def test_stays_quiet_below_threshold_for_each_character():
    app = _app()
    payload = [_entry('Emmet Brown', i) for i in range(ESCALATION_THRESHOLD - 1)]
    payload += [_entry('Aliyah', i) for i in range(ESCALATION_THRESHOLD - 1)]
    with app.test_client() as client, patch('app.discord_alert.requests.post') as mock_post:
        res = client.post('/api/bot-log', json=payload,
                           headers={'Authorization': 'Bearer write-token'})
    assert res.status_code == 200
    mock_post.assert_not_called()


def test_one_characters_occurrences_dont_trigger_escalation_for_another():
    app = _app()
    # Emmet Brown crosses the threshold; Aliyah only has one occurrence.
    payload = [_entry('Emmet Brown', i) for i in range(ESCALATION_THRESHOLD)]
    payload += [_entry('Aliyah', 0)]
    with app.test_client() as client, patch('app.discord_alert.requests.post') as mock_post:
        res = client.post('/api/bot-log', json=payload,
                           headers={'Authorization': 'Bearer write-token'})
    assert res.status_code == 200
    mock_post.assert_called_once()
    content = mock_post.call_args.kwargs['json']['content']
    assert 'Emmet Brown' in content  # the dedupe_key that crossed the threshold
    assert 'Aliyah' not in content
