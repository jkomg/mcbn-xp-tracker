"""POST /api/bot-log must not count a retried entry twice.

The endpoint commits its rows before it runs the Discord escalation checks and
its pruning pass, either of which can still fail, and a lost response has the
same shape: the rows are stored but the bot sees an error. The bot used to drop
those entries on the floor, which hid the ambiguity. Now that a failed flush is
requeued and resent (#426), the same occurrence would otherwise be inserted
again -- and the duplicates would inflate the very occurrence counts the
recurring-issue alerts key off, which is how this whole class of alert gets
noisy without anything actually recurring.

Entries carry a stable `entryId` assigned once at logEvent time, so a retry is
distinguishable from a genuine second occurrence.
"""

from unittest.mock import patch

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import AppLogEntry, db
from app.discord_alert import ESCALATION_THRESHOLD


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'test-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    app.config['DISCORD_WEBHOOK_URL'] = ''
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
    return app


def _entry(uid, event='config_sync_failed'):
    payload = {'level': 'warn', 'event': event, 'error': 'This operation was aborted'}
    if uid is not None:
        payload['entryId'] = uid
    return payload


def _post(app, payload):
    with app.test_client() as client:
        return client.post('/api/bot-log', json=payload,
                           headers={'Authorization': 'Bearer write-token'})


def _rows(app):
    with app.app_context():
        return db.session.query(AppLogEntry).all()


def test_resending_the_same_batch_stores_it_once():
    app = _app()
    batch = [_entry('uid-1'), _entry('uid-2')]

    assert _post(app, batch).status_code == 200
    assert _post(app, batch).status_code == 200  # the bot retried after a failure

    assert len(_rows(app)) == 2


def test_a_duplicate_within_one_batch_is_stored_once():
    app = _app()
    assert _post(app, [_entry('uid-1'), _entry('uid-1')]).status_code == 200
    assert len(_rows(app)) == 1


def test_distinct_occurrences_are_all_kept():
    """Dedupe must key on the id, not on the event -- these are real repeats."""
    app = _app()
    assert _post(app, [_entry('uid-1'), _entry('uid-2'), _entry('uid-3')]).status_code == 200
    assert len(_rows(app)) == 3


def test_entries_without_an_id_are_still_accepted():
    """A bot predating entryId must keep working, duplicates and all."""
    app = _app()
    assert _post(app, [_entry(None), _entry(None)]).status_code == 200
    assert len(_rows(app)) == 2


def test_the_id_is_stored_and_kept_out_of_details():
    app = _app()
    assert _post(app, [_entry('uid-1')]).status_code == 200
    row = _rows(app)[0]
    assert row.entry_uid == 'uid-1'
    assert 'entryId' not in (row.details or '')


def test_a_retry_does_not_push_a_key_over_the_escalation_threshold():
    """The failure this is really guarding.

    A batch one short of the threshold, resent after an ambiguous failure, must
    not be counted as twice the occurrences and fire a false alert.
    """
    app = _app()
    app.config['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/test'
    batch = [_entry(f'uid-{i}') for i in range(ESCALATION_THRESHOLD - 1)]

    with patch('app.discord_alert.send_escalation_alert') as mock_alert:
        assert _post(app, batch).status_code == 200
        assert _post(app, batch).status_code == 200

    mock_alert.assert_not_called()
    assert len(_rows(app)) == ESCALATION_THRESHOLD - 1
