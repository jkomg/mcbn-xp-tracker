"""Tests for the staff sheet-import approval gate (Issue #292).

A RoD sheet import lands as CharacterDraft(status='sheet_review') and must
go through staff approve/deny before it can become the character's live
sheet — approving one must supersede any prior 'approved' row for the same
character so player.character()'s single-approved-row lookup stays correct.
"""

from datetime import datetime, timezone
from unittest.mock import patch

from flask import Blueprint, Flask

from app.blueprints.cc_admin import bp as cc_admin_bp
from app.db import CharacterDraft, DbCharacter, db

# require_staff redirects unauthenticated requests to 'dashboard.login'.
# The real dashboard blueprint applies limiter.limit(...) at import time
# (module-level, not lazily), which needs create_app() to have run — so a
# minimal stand-in registers just the endpoint name url_for needs.
_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    db.init_app(app)
    app.register_blueprint(cc_admin_bp)
    app.register_blueprint(_fake_dashboard_bp)
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
        char = DbCharacter(character_name=name, age_category='Neonate')
        db.session.add(char)
        db.session.commit()
        return char.id


def _seed_sheet_review(app, roster_character_id, character_data='{"clan": "Toreador"}', character_name='Emmet Brown'):
    with app.app_context():
        draft = CharacterDraft(
            player_discord_id='111',
            character_name=character_name,
            status='sheet_review',
            roster_character_id=roster_character_id,
            character_data=character_data,
            submitted_at=datetime.now(timezone.utc),
        )
        db.session.add(draft)
        db.session.commit()
        return draft.id


def _seed_approved(app, roster_character_id, character_data='{"clan": "Old Data"}', character_name='Emmet Brown'):
    with app.app_context():
        draft = CharacterDraft(
            player_discord_id='111',
            character_name=character_name,
            status='approved',
            roster_character_id=roster_character_id,
            character_data=character_data,
            approved_at=datetime.now(timezone.utc),
            approved_by='staff:someone',
        )
        db.session.add(draft)
        db.session.commit()
        return draft.id


def test_list_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.get('/cc-admin/sheet-imports')
    assert res.status_code == 302  # redirected to login


def test_list_only_shows_sheet_review_status():
    # Bypasses actually rendering sheet_imports.html (which extends base.html
    # and needs a dozen unrelated blueprints registered just to resolve nav
    # url_for calls) — asserts on the data the route hands to the template.
    app = _app()
    char_id = _seed_character(app)
    _seed_sheet_review(app, char_id, character_name='Pending One')
    _seed_approved(app, char_id, character_name='Already Approved')
    client = _staff_client(app)
    with patch('app.blueprints.cc_admin.render_template', return_value='') as mock_render:
        res = client.get('/cc-admin/sheet-imports')
    assert res.status_code == 200
    kwargs = mock_render.call_args.kwargs
    names = [r['draft'].character_name for r in kwargs['rows']]
    assert names == ['Pending One']


def test_review_404s_for_non_sheet_review_draft():
    app = _app()
    char_id = _seed_character(app)
    approved_id = _seed_approved(app, char_id)
    client = _staff_client(app)
    res = client.get(f'/cc-admin/sheet-imports/{approved_id}')
    assert res.status_code == 404


def test_review_shows_current_and_proposed():
    app = _app()
    char_id = _seed_character(app)
    _seed_approved(app, char_id, character_data='{"clan": "Old Data"}')
    review_id = _seed_sheet_review(app, char_id, character_data='{"clan": "New Data"}')
    client = _staff_client(app)
    with patch('app.blueprints.cc_admin.render_template', return_value='') as mock_render:
        res = client.get(f'/cc-admin/sheet-imports/{review_id}')
    assert res.status_code == 200
    kwargs = mock_render.call_args.kwargs
    assert kwargs['current']['clan'] == 'Old Data'
    assert kwargs['proposed']['clan'] == 'New Data'


def test_approve_supersedes_prior_approved_and_makes_new_one_live():
    app = _app()
    char_id = _seed_character(app)
    old_approved_id = _seed_approved(app, char_id)
    review_id = _seed_sheet_review(app, char_id)
    client = _staff_client(app)

    res = client.post(f'/cc-admin/sheet-imports/{review_id}/approve', follow_redirects=False)
    assert res.status_code == 302

    with app.app_context():
        old = db.session.get(CharacterDraft, old_approved_id)
        new = db.session.get(CharacterDraft, review_id)
        assert old.status == 'superseded'
        assert new.status == 'approved'
        assert new.approved_at is not None
        # Exactly one approved row remains for this character.
        approved_count = CharacterDraft.query.filter_by(
            roster_character_id=char_id, status='approved',
        ).count()
        assert approved_count == 1


def test_approve_first_import_with_no_prior_approved_row():
    app = _app()
    char_id = _seed_character(app)
    review_id = _seed_sheet_review(app, char_id)
    client = _staff_client(app)

    res = client.post(f'/cc-admin/sheet-imports/{review_id}/approve', follow_redirects=False)
    assert res.status_code == 302

    with app.app_context():
        new = db.session.get(CharacterDraft, review_id)
        assert new.status == 'approved'


def test_deny_leaves_current_approved_sheet_untouched():
    app = _app()
    char_id = _seed_character(app)
    approved_id = _seed_approved(app, char_id, character_data='{"clan": "Untouched"}')
    review_id = _seed_sheet_review(app, char_id)
    client = _staff_client(app)

    res = client.post(
        f'/cc-admin/sheet-imports/{review_id}/deny',
        data={'deny_notes': "Doesn't match approved spends"},
        follow_redirects=False,
    )
    assert res.status_code == 302

    with app.app_context():
        approved = db.session.get(CharacterDraft, approved_id)
        denied = db.session.get(CharacterDraft, review_id)
        assert approved.status == 'approved'
        assert approved.character_data == '{"clan": "Untouched"}'
        assert denied.status == 'denied'
        assert denied.revision_notes == "Doesn't match approved spends"


def test_approve_requires_staff():
    app = _app()
    char_id = _seed_character(app)
    review_id = _seed_sheet_review(app, char_id)
    with app.test_client() as client:
        res = client.post(f'/cc-admin/sheet-imports/{review_id}/approve')
    assert res.status_code == 302  # redirected to login, not applied
    with app.app_context():
        draft = db.session.get(CharacterDraft, review_id)
        assert draft.status == 'sheet_review'
