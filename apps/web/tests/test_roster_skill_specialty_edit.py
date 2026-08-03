"""Staff direct-edit of skill_specialties via roster.edit_skill_specialty:
add/remove without an XP charge, duplicate rejection on add, staff-only
gate. See openspec change skill-specialties-web-editing / GitHub issue #266.

Requests are asserted against the redirect response directly (not
follow_redirects=True) since the destination page (roster/edit_sheet.html)
extends the full site nav, which references many blueprints not registered
in this focused test app.
"""

import json

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

import app as app_module
from app.blueprints import roster as roster_module
from app.db import CharacterDraft, DbAuditLog, DbCharacter, db
from app.db_service import DBService

_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['WTF_CSRF_ENABLED'] = False
    app.secret_key = 'test-secret'
    db.init_app(app)
    CSRFProtect().init_app(app)
    service = DBService()
    app_module.db_service = service
    roster_module.db_service = service
    app.register_blueprint(roster_module.bp, url_prefix='/roster')
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _seed(app, character_data, character_name='Specialized Sam'):
    with app.app_context():
        char = DbCharacter(character_name=character_name, active=True, status='active')
        db.session.add(char)
        db.session.flush()
        db.session.add(CharacterDraft(
            player_discord_id='111111111111111111',
            character_name=character_name,
            status='approved',
            roster_character_id=char.id,
            character_data=json.dumps(character_data),
        ))
        db.session.commit()


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['staff_user'] = 'Tester'
    return client


def _current_specialties(app, character_name='Specialized Sam'):
    with app.app_context():
        draft = CharacterDraft.query.filter_by(character_name=character_name, status='approved').first()
        return json.loads(draft.character_data).get('skill_specialties', {})


def test_staff_can_add_specialty():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = _staff_client(app)

    resp = client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'add', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    assert resp.status_code == 302
    assert _current_specialties(app) == {'firearms': ['Quickdraw']}


def test_staff_add_creates_no_xp_ledger_entry():
    """No spend request is created — this is a direct correction, not a purchase."""
    from app.db import DbSpendRequest

    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = _staff_client(app)

    client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'add', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_staff_add_logs_audit_entry():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = _staff_client(app)

    client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'add', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    with app.app_context():
        entries = DbAuditLog.query.filter_by(action_type='staff_skill_specialty_edit').all()
        assert len(entries) == 1
        assert 'Quickdraw' in entries[0].details


def test_staff_can_remove_specialty():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw', 'Trick Shots']}})
    client = _staff_client(app)

    resp = client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'remove', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    assert resp.status_code == 302
    assert _current_specialties(app) == {'firearms': ['Trick Shots']}


def test_staff_add_rejects_duplicate():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}})
    client = _staff_client(app)

    resp = client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'add', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    assert resp.status_code == 302
    assert _current_specialties(app) == {'firearms': ['Quickdraw']}


def test_staff_remove_no_op_when_specialty_absent():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}})
    client = _staff_client(app)

    resp = client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'remove', 'skill': 'Firearms', 'specialty': 'Nonexistent'},
    )

    assert resp.status_code == 302
    assert _current_specialties(app) == {'firearms': ['Quickdraw']}


def test_non_staff_request_is_redirected_to_login():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = app.test_client()

    resp = client.post(
        '/roster/Specialized Sam/skill-specialty',
        data={'action': 'add', 'skill': 'Firearms', 'specialty': 'Quickdraw'},
    )

    assert resp.status_code == 302
    assert resp.headers['Location'] == '/login'
    assert _current_specialties(app) == {}
