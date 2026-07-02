"""Tests that the character-creator draft API (/api/cc/characters/*) can't
see or delete RoD sheet-import rows (Issue #292's approval-gate rows).

Regression (Codex on #317): these share the CharacterDraft table with actual
character-creation drafts. Without exclusion, a player could see a pending
sheet_review row in the creator's draft switcher and DELETE it there,
silently removing it from the staff review queue and bypassing the gate.
"""

from flask import Blueprint, Flask

from app.blueprints.character_creator import bp as cc_bp
from app.db import CharacterDraft, db

# require_login redirects to 'dashboard.login' when unauthenticated. See
# tests/test_sheet_import_approval.py for why a minimal stand-in is used
# instead of the real dashboard blueprint (module-level limiter.limit()).
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
    app.register_blueprint(cc_bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _player_client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def _seed(app, status, discord_id='111'):
    with app.app_context():
        draft = CharacterDraft(
            player_discord_id=discord_id,
            character_name='Emmet Brown',
            status=status,
            character_data='{}',
        )
        db.session.add(draft)
        db.session.commit()
        return draft.id


def test_list_excludes_sheet_review_denied_and_superseded():
    app = _app()
    _seed(app, 'draft')
    _seed(app, 'sheet_review')
    _seed(app, 'denied')
    _seed(app, 'superseded')
    client = _player_client(app)
    res = client.get('/api/cc/characters')
    assert res.status_code == 200
    # _draft_to_dict doesn't expose 'status' — assert on count instead, which
    # is what actually matters (only the real creation draft shows up).
    assert len(res.get_json()) == 1


def test_delete_rejects_sheet_review_status():
    app = _app()
    draft_id = _seed(app, 'sheet_review')
    client = _player_client(app)
    res = client.delete(f'/api/cc/characters/{draft_id}')
    assert res.status_code == 422
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id) is not None


def test_delete_rejects_denied_status():
    app = _app()
    draft_id = _seed(app, 'denied')
    client = _player_client(app)
    res = client.delete(f'/api/cc/characters/{draft_id}')
    assert res.status_code == 422


def test_delete_rejects_superseded_status():
    app = _app()
    draft_id = _seed(app, 'superseded')
    client = _player_client(app)
    res = client.delete(f'/api/cc/characters/{draft_id}')
    assert res.status_code == 422


def test_delete_still_allows_a_real_draft():
    app = _app()
    draft_id = _seed(app, 'draft')
    client = _player_client(app)
    res = client.delete(f'/api/cc/characters/{draft_id}')
    assert res.status_code == 204
    with app.app_context():
        assert db.session.get(CharacterDraft, draft_id) is None
