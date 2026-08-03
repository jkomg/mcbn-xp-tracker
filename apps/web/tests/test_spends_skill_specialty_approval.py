"""Approving a Skill Specialty spend re-checks live for a duplicate right
before charging XP, closing a race where two identical requests submitted
before either is approved would otherwise both get charged even though the
second patch is a no-op. See openspec change skill-specialties-web-editing /
GitHub issue #266 (Codex review finding on PR #397)."""

import json

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

import app as app_module
from app.blueprints import spends as spends_module
from app.db import CharacterDraft, DbCharacter, DbSpendRequest, db
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


def _seed(app, character_name='Specialized Sam', creation_xp=20):
    with app.app_context():
        char = DbCharacter(character_name=character_name, active=True, status='active', creation_xp=creation_xp)
        db.session.add(char)
        db.session.flush()
        db.session.add(CharacterDraft(
            player_discord_id='111111111111111111',
            character_name=character_name,
            status='approved',
            roster_character_id=char.id,
            character_data=json.dumps({'skills': {'firearms': 2}}),
        ))
        db.session.commit()


def _submit_duplicate_pair(app, character_name='Specialized Sam'):
    """Simulate two identical Skill Specialty requests submitted before either
    is approved (both pass submit_spend's duplicate check at submission time)."""
    with app.app_context():
        service = app_module.db_service
        for _ in range(2):
            service.submit_spend_request(
                character_name=character_name,
                spend_category='Skill Specialty',
                trait_name='Firearms',
                current_dots=0,
                new_dots=1,
                is_in_clan=False,
                justification='Practiced at the range',
                power_name='Quickdraw',
            )
        rows = DbSpendRequest.query.order_by(DbSpendRequest.id.asc()).all()
        return [r.id for r in rows]


def _staff_client(app):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['staff_user'] = 'Tester'
    return client


def test_second_identical_specialty_approval_is_rejected():
    app = _app()
    _seed(app)
    row_ids = _submit_duplicate_pair(app)
    client = _staff_client(app)

    resp1 = client.post(f'/spends/{row_ids[0]}/approve', data={'verified_cost': '3'})
    assert resp1.status_code == 302

    resp2 = client.post(f'/spends/{row_ids[1]}/approve', data={'verified_cost': '3'})
    assert resp2.status_code == 302

    with app.app_context():
        rows = {r.id: r for r in DbSpendRequest.query.all()}
        assert rows[row_ids[0]].status == 'Approved'
        assert rows[row_ids[1]].status == 'Pending'  # rejected, not silently approved


def test_second_identical_specialty_approval_does_not_charge_xp():
    app = _app()
    _seed(app)
    row_ids = _submit_duplicate_pair(app)
    client = _staff_client(app)

    client.post(f'/spends/{row_ids[0]}/approve', data={'verified_cost': '3'})
    client.post(f'/spends/{row_ids[1]}/approve', data={'verified_cost': '3'})

    with app.app_context():
        totals = app_module.db_service.get_xp_totals('Specialized Sam')
        assert totals['total_spends'] == 3  # only the first approval charged


def test_second_identical_specialty_approval_sheet_has_one_entry():
    app = _app()
    _seed(app)
    row_ids = _submit_duplicate_pair(app)
    client = _staff_client(app)

    client.post(f'/spends/{row_ids[0]}/approve', data={'verified_cost': '3'})
    client.post(f'/spends/{row_ids[1]}/approve', data={'verified_cost': '3'})

    with app.app_context():
        draft = CharacterDraft.query.filter_by(character_name='Specialized Sam', status='approved').first()
        data = json.loads(draft.character_data)
        assert data['skill_specialties']['firearms'] == ['Quickdraw']


def test_bulk_approve_skips_second_identical_specialty():
    app = _app()
    _seed(app)
    row_ids = _submit_duplicate_pair(app)
    client = _staff_client(app)

    resp = client.post('/spends/bulk-approve', data={'spend_ids': [str(row_ids[0]), str(row_ids[1])]})
    assert resp.status_code == 302

    with app.app_context():
        rows = {r.id: r for r in DbSpendRequest.query.all()}
        assert rows[row_ids[0]].status == 'Approved'
        assert rows[row_ids[1]].status == 'Pending'
        totals = app_module.db_service.get_xp_totals('Specialized Sam')
        assert totals['total_spends'] == 3


def test_non_duplicate_specialty_still_approves_normally():
    """Regression check: approving a Skill Specialty spend that ISN'T a
    duplicate of anything already on the sheet still works fine."""
    app = _app()
    _seed(app)
    with app.app_context():
        app_module.db_service.submit_spend_request(
            character_name='Specialized Sam',
            spend_category='Skill Specialty',
            trait_name='Firearms',
            current_dots=0,
            new_dots=1,
            is_in_clan=False,
            justification='Practiced at the range',
            power_name='Quickdraw',
        )
        row_id = DbSpendRequest.query.first().id
    client = _staff_client(app)

    resp = client.post(f'/spends/{row_id}/approve', data={'verified_cost': '3'})
    assert resp.status_code == 302

    with app.app_context():
        assert DbSpendRequest.query.get(row_id).status == 'Approved'
