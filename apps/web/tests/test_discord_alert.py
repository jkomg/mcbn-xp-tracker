"""Tests for the Discord webhook error-alert helper."""

from unittest.mock import patch

from app import discord_alert


def _reset_rate_limit():
    discord_alert._last_sent.clear()


def test_send_alert_skips_when_no_webhook_url():
    _reset_rate_limit()
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_alert('', source='web', level='error', event='boom', message='x')
    mock_post.assert_not_called()


def test_send_alert_posts_when_configured():
    _reset_rate_limit()
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_alert(
            'https://discord.com/api/webhooks/test',
            source='web', level='error', event='unhandled_exception', message='ValueError: bad',
        )
    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    assert 'unhandled_exception' in kwargs['json']['content']
    assert 'ValueError: bad' in kwargs['json']['content']


def test_send_alert_is_rate_limited_per_event():
    _reset_rate_limit()
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_alert('https://x', source='web', level='error', event='same', message='first')
        discord_alert.send_alert('https://x', source='web', level='error', event='same', message='second')
    mock_post.assert_called_once()


def test_send_alert_never_raises_on_request_failure():
    _reset_rate_limit()
    with patch('app.discord_alert.requests.post', side_effect=RuntimeError('network down')):
        discord_alert.send_alert('https://x', source='web', level='error', event='boom', message='x')


def test_send_alert_includes_details_and_link():
    _reset_rate_limit()
    with patch('app.discord_alert.requests.post') as mock_post:
        discord_alert.send_alert(
            'https://x', source='web', level='error', event='unhandled_exception',
            message='ValueError: bad',
            details='/wiki/characters\nTraceback (most recent call last):\n  raise ValueError',
            link='https://mcbn.jkomg.us/audit/errors?source=web&level=error&event=unhandled_exception',
        )
    content = mock_post.call_args.kwargs['json']['content']
    assert 'Traceback' in content
    assert 'https://mcbn.jkomg.us/audit/errors' in content


def test_dashboard_link_builds_filtered_url_from_redirect_uri():
    link = discord_alert.dashboard_link(
        'https://mcbn.jkomg.us/auth/callback', source='bot', level='warn', event='wiki_sync_stale',
    )
    assert link == 'https://mcbn.jkomg.us/audit/errors?source=bot&level=warn&event=wiki_sync_stale'


def test_dashboard_link_empty_when_redirect_uri_unset():
    assert discord_alert.dashboard_link('', source='web', level='error', event='x') == ''
