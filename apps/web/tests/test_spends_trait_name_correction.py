"""Staff can correct a spend's trait_name at approval time, resolving a
"close match" warning (e.g. submitted as "Retainer" when the character's
sheet already has "Retainer (Mortal Steve)") without hand-editing the
character's JSON afterward. See spends.approve's trait_name form field and
db_service.approve_spend's trait_name kwarg."""

import json

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

import app as app_module
from app.blueprints import spends as spends_module
from app.db import CharacterDraft, DbAuditLog, DbCharacter, DbSpendRequest, db
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
    spends_module.db_service = service
    spends_module.sheets_sync = None
    app.register_blueprint(spends_module.bp, url_prefix='/spends')
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _seed(app, character_data, character_name='Steve Player', creation_xp=20):
    with app.app_context():
        char = DbCharacter(character_name=character_name, active=True, status='active', creation_xp=creation_xp)
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


def _submit(app, character_name='Steve Player', trait_name='Retainer', current_dots=0, new_dots=1):
    with app.app_context():
        app_module.db_service.submit_spend_request(
            character_name=character_name,
            spend_category='Advantage (Merit/Background)',
            trait_name=trait_name,
            current_dots=current_dots,
            new_dots=new_dots,
            is_in_clan=False,
            justification='Retainer raise',
        )
        return DbSpendRequest.query.first().id


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['staff_user'] = 'Tester'
    return client


def _sheet_data(app, character_name='Steve Player'):
    with app.app_context():
        draft = CharacterDraft.query.filter_by(character_name=character_name, status='approved').first()
        return json.loads(draft.character_data)


def test_approve_with_corrected_trait_name_raises_existing_entry_not_a_duplicate():
    app = _app()
    _seed(app, {
        'merits': [{'name': 'Retainer (Mortal Steve)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })
    row_id = _submit(app, trait_name='Retainer', current_dots=1, new_dots=2)
    client = _staff_client(app)

    resp = client.post(
        f'/spends/{row_id}/approve',
        data={'verified_cost': '3', 'trait_name': 'Retainer (Mortal Steve)'},
    )
    assert resp.status_code == 302

    data = _sheet_data(app)
    assert data['merits'] == [
        {'name': 'Retainer (Mortal Steve)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]


def test_approve_with_corrected_trait_name_updates_the_stored_spend_row():
    app = _app()
    _seed(app, {
        'merits': [{'name': 'Retainer (Mortal Steve)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })
    row_id = _submit(app, trait_name='Retainer', current_dots=1, new_dots=2)
    client = _staff_client(app)

    client.post(
        f'/spends/{row_id}/approve',
        data={'verified_cost': '3', 'trait_name': 'Retainer (Mortal Steve)'},
    )

    with app.app_context():
        row = DbSpendRequest.query.get(row_id)
        assert row.trait_name == 'Retainer (Mortal Steve)'
        assert row.status == 'Approved'


def test_approve_with_corrected_trait_name_logs_the_rename():
    app = _app()
    _seed(app, {
        'merits': [{'name': 'Retainer (Mortal Steve)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })
    row_id = _submit(app, trait_name='Retainer', current_dots=1, new_dots=2)
    client = _staff_client(app)

    client.post(
        f'/spends/{row_id}/approve',
        data={'verified_cost': '3', 'trait_name': 'Retainer (Mortal Steve)'},
    )

    with app.app_context():
        entry = DbAuditLog.query.filter_by(action_type='approve_spend').first()
        assert 'renamed from "Retainer"' in entry.details
        assert 'Retainer (Mortal Steve)' in entry.details


def test_approve_without_trait_name_field_keeps_original_name():
    """Regression check: omitting trait_name (the normal case, no warning
    present) must not touch the stored name."""
    app = _app()
    _seed(app, {'merits': []})
    row_id = _submit(app, trait_name='Iron Will', current_dots=0, new_dots=1)
    client = _staff_client(app)

    resp = client.post(f'/spends/{row_id}/approve', data={'verified_cost': '3'})
    assert resp.status_code == 302

    with app.app_context():
        row = DbSpendRequest.query.get(row_id)
        assert row.trait_name == 'Iron Will'

    data = _sheet_data(app)
    assert data['merits'] == [
        {'name': 'Iron Will', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]


def test_approve_with_blank_trait_name_field_keeps_original_name():
    """A submitted-but-empty trait_name field (e.g. the form input existed
    but staff left it untouched and it happened to be cleared) must not
    wipe out the trait name."""
    app = _app()
    _seed(app, {'merits': []})
    row_id = _submit(app, trait_name='Iron Will', current_dots=0, new_dots=1)
    client = _staff_client(app)

    client.post(f'/spends/{row_id}/approve', data={'verified_cost': '3', 'trait_name': '   '})

    with app.app_context():
        row = DbSpendRequest.query.get(row_id)
        assert row.trait_name == 'Iron Will'


def test_approve_with_same_trait_name_is_a_no_op_rename():
    """Submitting trait_name identical to the current value shouldn't log a
    spurious rename note."""
    app = _app()
    _seed(app, {'merits': []})
    row_id = _submit(app, trait_name='Iron Will', current_dots=0, new_dots=1)
    client = _staff_client(app)

    client.post(f'/spends/{row_id}/approve', data={'verified_cost': '3', 'trait_name': 'Iron Will'})

    with app.app_context():
        entry = DbAuditLog.query.filter_by(action_type='approve_spend').first()
        assert 'renamed from' not in entry.details
