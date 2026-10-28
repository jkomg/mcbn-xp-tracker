"""Bot-to-web network failures page on duration, not on a 24h count.

2026-10-28: one 2-minute LAN outage on the bot host and a few Cloudflare 520s
produced four "recurring issue" pages, each for something that had already
recovered. These page only once a single unbroken stretch of them reaches
SUSTAINED_FAILURE_MINUTES.
"""

from datetime import datetime, timedelta, timezone
from itertools import count
from unittest.mock import patch

import pytest
from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import AppLogEntry, db
from app.discord_alert import (
    ESCALATION_THRESHOLD,
    FAILURE_EPISODE_GAP_MINUTES,
    SUSTAINED_FAILURE_MINUTES,
    is_network_failure,
)

_uids = count()
T0 = datetime(2026, 10, 28, 6, 21, tzinfo=timezone.utc)


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


def _entry(minute: float, error='fetch failed (getaddrinfo EAI_AGAIN mcbn.jkomg.us)',
           event='heartbeat_failed'):
    ts = (T0 + timedelta(minutes=minute)).isoformat().replace('+00:00', 'Z')
    return {'ts': ts, 'level': 'warn', 'event': event, 'error': error,
            'entryId': f'uid-{next(_uids)}'}


def _post(app, entries):
    with app.test_client() as client:
        res = client.post('/api/bot-log', json=entries,
                          headers={'Authorization': 'Bearer write-token'})
    assert res.status_code == 200


def _webhook_posts(app, batches):
    with patch('app.discord_alert.requests.post') as mock_post:
        for batch in batches:
            _post(app, batch)
    return [c.kwargs['json']['content'] for c in mock_post.call_args_list]


@pytest.mark.parametrize('message', [
    'fetch failed (getaddrinfo EAI_AGAIN mcbn.jkomg.us)',
    'This operation was aborted',
    'Unable to reach web app cc/pending-sheet-imports API. (fetch failed (AggregateError: '
    'connect ETIMEDOUT 172.67.166.167:443))',
    'heartbeat POST failed: 520',
    'Web app review-events API failed (525)',
    'TypeError: fetch failed',
    'bot-config fetch failed: 503',
    'fetch failed (other side closed)',
])
def test_network_failures_are_recognised(message):
    assert is_network_failure(message)


@pytest.mark.parametrize('message', [
    'heartbeat POST failed: 500',
    'bot-config fetch failed: 500',
    'Pins fetch failed for #lore',
    'Web app cc/pending-sheet-imports API failed (500)',
    'no channel',
    '',
])
def test_app_failures_are_not_network_failures(message):
    assert not is_network_failure(message)


def test_a_short_outage_does_not_page_however_many_times_it_fails():
    app = _app()
    # Every 20s for 3 minutes, from several pollers: far past the count threshold.
    batches = [[_entry(i / 3, event=e) for e in ('heartbeat_failed', 'config_sync_failed')]
               for i in range(10)]
    assert _webhook_posts(app, batches) == []


def test_separate_blips_through_the_day_do_not_page():
    app = _app()
    blips = [[_entry(h * 60 + m) for m in (0, 1, 2)] for h in range(ESCALATION_THRESHOLD + 2)]
    assert _webhook_posts(app, blips) == []


def test_a_sustained_outage_pages_once():
    app = _app()
    batches = [[_entry(m)] for m in range(0, SUSTAINED_FAILURE_MINUTES + 10)]
    posts = _webhook_posts(app, batches)
    assert len(posts) == 1
    assert 'Sustained failure' in posts[0]
    assert 'bot:heartbeat_failed:network' in posts[0]
    assert f'**{SUSTAINED_FAILURE_MINUTES} min**' in posts[0]


def test_a_gap_longer_than_the_episode_gap_starts_a_new_stretch():
    app = _app()
    half = SUSTAINED_FAILURE_MINUTES - 2
    first = [[_entry(m)] for m in range(half)]
    second_start = half + FAILURE_EPISODE_GAP_MINUTES + 1
    second = [[_entry(second_start + m)] for m in range(half)]
    assert _webhook_posts(app, first + second) == []


def test_a_backlog_sent_after_recovery_is_judged_on_the_bot_timestamps():
    """Rows the bot buffered while it couldn't reach the web all arrive together."""
    app = _app()
    backlog = [_entry(m) for m in range(SUSTAINED_FAILURE_MINUTES + 1)]
    posts = _webhook_posts(app, [backlog])
    assert len(posts) == 1


def test_a_second_sustained_stretch_later_pages_again():
    app = _app()
    first = [[_entry(m)] for m in range(SUSTAINED_FAILURE_MINUTES + 1)]
    later = 3 * 60
    second = [[_entry(later + m)] for m in range(SUSTAINED_FAILURE_MINUTES + 1)]
    assert len(_webhook_posts(app, first + second)) == 2


def test_network_rows_are_grouped_apart_and_do_not_feed_the_count_rule():
    app = _app()
    network = [_entry(m * 30) for m in range(ESCALATION_THRESHOLD - 1)]
    app_errors = [_entry(m * 30 + 1, error='heartbeat POST failed: 500')
                  for m in range(ESCALATION_THRESHOLD - 1)]
    assert _webhook_posts(app, [network + app_errors]) == []
    with app.app_context():
        keys = {row.dedupe_key for row in db.session.query(AppLogEntry).all()}
    assert keys == {'bot:heartbeat_failed:network', 'bot:heartbeat_failed'}


def test_app_errors_still_page_on_the_count_rule():
    app = _app()
    app_errors = [_entry(m, error='heartbeat POST failed: 500')
                  for m in range(ESCALATION_THRESHOLD)]
    posts = _webhook_posts(app, [app_errors])
    assert len(posts) == 1
    assert 'Recurring issue' in posts[0]


def test_a_late_batch_joining_two_short_stretches_pages():
    """Neither stretch alone reached the threshold, so nothing has paged yet."""
    app = _app()
    short = SUSTAINED_FAILURE_MINUTES - 3
    gap_start = short + 1
    second_start = gap_start + FAILURE_EPISODE_GAP_MINUTES + 5
    first = [[_entry(m)] for m in range(short)]
    second = [[_entry(second_start + m)] for m in range(short)]
    bridge = [[_entry(m) for m in range(gap_start, second_start, 5)]]
    assert _webhook_posts(app, first + second) == []
    assert len(_webhook_posts(app, bridge)) == 1
