"""Tests for player.character()'s pending/denied sheet-import banner logic.

Regression (Codex on #317): a denied import's banner kept showing even after
a later resubmission was approved, because the query only checked "is there
any denied row at all" instead of "is the denial still the latest outcome".
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from flask import Flask

from app.blueprints.player import bp as player_bp
from app.db import CharacterDraft, DbCharacter, db
from app.db_service import DBService


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    db.init_app(app)
    app.register_blueprint(player_bp, url_prefix='/player')
    with app.app_context():
        db.create_all()
    return app


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_name'] = 'teststaff'
    return client


def _seed_character(app, name='Emmet Brown'):
    with app.app_context():
        char = DbCharacter(character_name=name, age_category='Neonate', active=True)
        db.session.add(char)
        db.session.commit()
        return char.id


def _seed_draft(app, roster_character_id, status, submitted_at, approved_at=None, revision_notes=''):
    with app.app_context():
        db.session.add(CharacterDraft(
            player_discord_id='111',
            character_name='Emmet Brown',
            status=status,
            roster_character_id=roster_character_id,
            character_data='{}',
            submitted_at=submitted_at,
            approved_at=approved_at,
            revision_notes=revision_notes,
        ))
        db.session.commit()


def _get_context(app, name):
    with patch('app.blueprints.player.render_template', return_value='') as mock_render:
        client = _staff_client(app)
        res = client.get(f'/player/{name}')
    assert res.status_code == 200
    return mock_render.call_args.kwargs


def _svc_patch(app):
    return patch('app.blueprints.player.db_service', DBService(sheets_client=None))


def test_no_denial_banner_when_never_denied():
    app = _app()
    char_id = _seed_character(app)
    _seed_draft(app, char_id, 'approved', datetime.now(timezone.utc), approved_at=datetime.now(timezone.utc))
    with _svc_patch(app):
        ctx = _get_context(app, 'Emmet Brown')
    assert ctx['pending_sheet_review'] is None
    assert ctx['denied_sheet_review'] is None


def test_shows_denial_when_it_is_the_latest_outcome():
    app = _app()
    char_id = _seed_character(app)
    now = datetime.now(timezone.utc)
    _seed_draft(app, char_id, 'approved', now - timedelta(days=2), approved_at=now - timedelta(days=2))
    _seed_draft(app, char_id, 'denied', now - timedelta(days=1), revision_notes='Stats did not match')
    with _svc_patch(app):
        ctx = _get_context(app, 'Emmet Brown')
    assert ctx['denied_sheet_review'] is not None
    assert ctx['denied_sheet_review'].revision_notes == 'Stats did not match'


def test_does_not_show_stale_denial_after_later_approval():
    app = _app()
    char_id = _seed_character(app)
    now = datetime.now(timezone.utc)
    # Denied first...
    _seed_draft(app, char_id, 'denied', now - timedelta(days=2), revision_notes='Stats did not match')
    # ...then a later resubmission was approved. Only one 'approved' row can
    # exist at a time per the supersede invariant, so this is the only one.
    _seed_draft(app, char_id, 'approved', now - timedelta(days=1), approved_at=now - timedelta(days=1))
    with _svc_patch(app):
        ctx = _get_context(app, 'Emmet Brown')
    assert ctx['denied_sheet_review'] is None


def test_pending_review_takes_priority_over_old_denial():
    app = _app()
    char_id = _seed_character(app)
    now = datetime.now(timezone.utc)
    _seed_draft(app, char_id, 'denied', now - timedelta(days=1), revision_notes='old denial')
    _seed_draft(app, char_id, 'sheet_review', now)
    with _svc_patch(app):
        ctx = _get_context(app, 'Emmet Brown')
    assert ctx['pending_sheet_review'] is not None
    assert ctx['denied_sheet_review'] is None
