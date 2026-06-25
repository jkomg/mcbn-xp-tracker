"""Tests for retirement automation queue endpoints and sync completion."""

from datetime import datetime, timedelta, timezone

from flask import Flask

from app.blueprints.api import bp as api_bp
from app.db import AppSetting, DbCharacter, RetirementAutomationJob, WikiSyncEvent, db
from app.retirement_automation import enqueue_retirement_job


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WEB_APP_API_TOKEN'] = 'legacy-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
        db.session.add(DbCharacter(
            character_name='Alice Voss',
            status='retired',
            active=False,
            ticket_channel_id='cubby-1',
        ))
        db.session.commit()
    return app


def test_enqueue_reuses_existing_unsynced_job():
    app = _app()
    with app.app_context():
        first = enqueue_retirement_job('Alice Voss', 'staff-1')
        db.session.commit()
        second = enqueue_retirement_job('Alice Voss', 'staff-2')
        db.session.commit()

        assert first is not None
        assert second is not None
        assert first.id == second.id
        rows = RetirementAutomationJob.query.all()
        assert len(rows) == 1
        assert rows[0].requested_by == 'staff-2'
        assert rows[0].cubby_channel_id == 'cubby-1'


def test_pending_and_complete_endpoints_round_trip():
    app = _app()
    with app.app_context():
        enqueue_retirement_job('Alice Voss', 'staff-1')
        db.session.commit()

    with app.test_client() as client:
        pending = client.get(
            '/api/retirement-automation/pending',
            headers={'Authorization': 'Bearer read-token'},
        )
        assert pending.status_code == 200
        body = pending.get_json()
        assert len(body['jobs']) == 1
        job_id = body['jobs'][0]['id']
        assert body['jobs'][0]['characterName'] == 'Alice Voss'

        complete = client.post(
            f'/api/retirement-automation/{job_id}/discord-complete',
            headers={'Authorization': 'Bearer write-token'},
            json={
                'cubbyChannelId': 'cubby-1',
                'childrenSourceThreadId': 'thread-src',
                'childrenRetiredThreadId': 'thread-dst',
            },
        )
        assert complete.status_code == 200

    with app.app_context():
        row = db.session.get(RetirementAutomationJob, job_id)
        assert row is not None
        assert row.discord_completed_at is not None
        assert row.children_source_thread_id == 'thread-src'
        assert row.children_retired_thread_id == 'thread-dst'


def test_failure_endpoint_records_error_and_keeps_job_pending():
    app = _app()
    with app.app_context():
        enqueue_retirement_job('Alice Voss', 'staff-1')
        db.session.commit()

    with app.test_client() as client:
        pending = client.get(
            '/api/retirement-automation/pending',
            headers={'Authorization': 'Bearer read-token'},
        )
        job_id = pending.get_json()['jobs'][0]['id']

        failed = client.post(
            f'/api/retirement-automation/{job_id}/discord-failed',
            headers={'Authorization': 'Bearer write-token'},
            json={'error': 'completion endpoint failed'},
        )
        assert failed.status_code == 200

    with app.app_context():
        row = db.session.get(RetirementAutomationJob, job_id)
        assert row is not None
        assert row.discord_completed_at is None
        assert row.last_attempt_at is not None
        assert row.attempt_count == 1
        assert row.last_error == 'completion endpoint failed'


def test_pending_endpoint_honors_retry_backoff():
    app = _app()
    with app.app_context():
        job = enqueue_retirement_job('Alice Voss', 'staff-1')
        db.session.commit()
        assert job is not None
        job.last_error = 'temporary discord error'
        job.attempt_count = 1
        job.last_attempt_at = datetime.now(timezone.utc)
        db.session.commit()

    with app.test_client() as client:
        pending = client.get(
            '/api/retirement-automation/pending',
            headers={'Authorization': 'Bearer read-token'},
        )
        assert pending.status_code == 200
        assert pending.get_json()['jobs'] == []

    with app.app_context():
        row = RetirementAutomationJob.query.one()
        row.last_attempt_at = datetime.now(timezone.utc) - timedelta(minutes=6)
        db.session.commit()

    with app.test_client() as client:
        pending = client.get(
            '/api/retirement-automation/pending',
            headers={'Authorization': 'Bearer read-token'},
        )
        assert pending.status_code == 200
        jobs = pending.get_json()['jobs']
        assert len(jobs) == 1
        assert jobs[0]['characterName'] == 'Alice Voss'


def test_wiki_batch_request_and_success_ack_clear_pending_jobs():
    app = _app()
    with app.app_context():
        job = enqueue_retirement_job('Alice Voss', 'staff-1')
        db.session.commit()
        job.discord_completed_at = job.requested_at
        db.session.commit()

    with app.test_client() as client:
        request_res = client.post(
            '/api/retirement-automation/wiki-batch-request',
            headers={'Authorization': 'Bearer write-token'},
        )
        assert request_res.status_code == 200
        assert request_res.get_json()['requested'] is True

        ack_res = client.post(
            '/api/wiki-sync-ack',
            headers={'Authorization': 'Bearer write-token'},
            json={'status': 'success', 'source': 'scheduled', 'runId': 'run-1'},
        )
        assert ack_res.status_code == 200
        assert ack_res.get_json()['retirementJobsSynced'] == 1

    with app.app_context():
        row = RetirementAutomationJob.query.one()
        assert row.wiki_synced_at is not None
        assert db.session.get(AppSetting, 'BOT_WIKI_SYNC_REQUESTED') is not None
        event = WikiSyncEvent.query.order_by(WikiSyncEvent.id.desc()).first()
        assert event is not None
        assert event.status == 'success'
