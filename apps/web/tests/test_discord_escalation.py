"""Tests for occurrence-count escalation alerts (a recurring issue that
crosses ESCALATION_THRESHOLD within ESCALATION_WINDOW_HOURS gets a distinct
'may not be self-correcting' message, on top of the normal per-occurrence one).
"""

from datetime import datetime, timedelta
from unittest.mock import patch

from flask import Flask

from app import discord_alert
from app.db import AppLogEntry, db


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()
    return app


def _seed(dedupe_key: str, count: int, created_at=None):
    created_at = created_at or datetime.utcnow()
    for _ in range(count):
        db.session.add(AppLogEntry(
            ts=created_at.isoformat(), source='bot', level='error', event='x',
            message='x', details='', created_at=created_at, dedupe_key=dedupe_key,
        ))
    db.session.commit()


def test_check_escalation_returns_none_below_threshold():
    app = _app()
    with app.app_context():
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD - 1)
        assert discord_alert.check_escalation('bot:x:emmet-brown') is None


def test_check_escalation_returns_count_at_threshold():
    app = _app()
    with app.app_context():
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD)
        assert discord_alert.check_escalation('bot:x:emmet-brown') == discord_alert.ESCALATION_THRESHOLD


def test_check_escalation_none_between_thresholds():
    app = _app()
    with app.app_context():
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD + 1)
        assert discord_alert.check_escalation('bot:x:emmet-brown') is None


def test_check_escalation_fires_again_at_next_multiple():
    app = _app()
    with app.app_context():
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD * 2)
        assert discord_alert.check_escalation('bot:x:emmet-brown') == discord_alert.ESCALATION_THRESHOLD * 2


def test_check_escalation_ignores_entries_outside_window():
    app = _app()
    with app.app_context():
        old = datetime.utcnow() - timedelta(hours=discord_alert.ESCALATION_WINDOW_HOURS + 1)
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD, created_at=old)
        assert discord_alert.check_escalation('bot:x:emmet-brown') is None


def test_check_escalation_empty_dedupe_key_returns_none():
    app = _app()
    with app.app_context():
        assert discord_alert.check_escalation('') is None


def test_check_escalation_distinct_keys_counted_separately():
    app = _app()
    with app.app_context():
        _seed('bot:x:emmet-brown', discord_alert.ESCALATION_THRESHOLD)
        _seed('bot:x:aliyah', discord_alert.ESCALATION_THRESHOLD - 1)
        assert discord_alert.check_escalation('bot:x:emmet-brown') == discord_alert.ESCALATION_THRESHOLD
        assert discord_alert.check_escalation('bot:x:aliyah') is None


def test_send_escalation_alert_posts_and_mentions_count():
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_escalation_alert('https://x', 'bot:x:emmet-brown', 5, 'no channel found')
    mock_post.assert_called_once()
    content = mock_post.call_args.kwargs['json']['content']
    assert '5 times' in content
    assert 'bot:x:emmet-brown' in content


def test_send_escalation_alert_skips_when_no_webhook_url():
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_escalation_alert('', 'bot:x:emmet-brown', 5, 'no channel found')
    mock_post.assert_not_called()


def test_send_escalation_alert_never_raises_on_request_failure():
    with patch('app.discord_alert.requests.post', side_effect=RuntimeError('down')):
        discord_alert.send_escalation_alert('https://x', 'bot:x:emmet-brown', 5, 'no channel found')
