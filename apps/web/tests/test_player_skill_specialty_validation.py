"""Skill Specialty spend requests: gated on the skill being rated >= 1 on the
character's approved sheet, require a specialty name (power_name), and reject
a duplicate specialty name for the same skill. See openspec change
skill-specialties-web-editing / GitHub issue #266."""

import json
import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

import app as app_module
from app.blueprints import player as player_module
from app.db import CharacterDraft, DbCharacter, DbSpendRequest, db
from app.db_service import DBService

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')
_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'static')

_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


def _app():
    app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    app.config['ALLOWED_DISCORD_IDS'] = set()
    app.config['WTF_CSRF_ENABLED'] = False
    db.init_app(app)
    CSRFProtect().init_app(app)
    service = DBService()
    app_module.db_service = service
    player_module.db_service = service
    player_module.sheets_sync = None
    app.register_blueprint(player_module.bp, url_prefix='/player')
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _seed(app, character_data, discord_id='111', character_name='Skilled Sasha'):
    with app.app_context():
        char = DbCharacter(
            character_name=character_name,
            player_discord=discord_id,
            active=True,
            status='active',
        )
        db.session.add(char)
        db.session.flush()
        db.session.add(CharacterDraft(
            player_discord_id=discord_id,
            character_name=character_name,
            status='approved',
            roster_character_id=char.id,
            character_data=json.dumps(character_data),
        ))
        db.session.commit()


def _client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def _base_form(**overrides):
    form = {
        'spend_category': 'Skill Specialty',
        'trait_name': 'Firearms',
        'power_name': 'Quickdraw',
        'justification': 'Practiced at the range',
        'current_dots': '0',
        'new_dots': '1',
    }
    form.update(overrides)
    return form


def test_submit_spend_accepts_specialty_on_rated_skill():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Firearms'
        assert rows[0].power_name == 'Quickdraw'
        assert rows[0].spend_category == 'Skill Specialty'


def test_submit_spend_rejects_specialty_on_unrated_skill():
    app = _app()
    _seed(app, {'skills': {'firearms': 0}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_submit_spend_rejects_specialty_on_skill_not_on_sheet():
    app = _app()
    _seed(app, {'skills': {}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_submit_spend_rejects_missing_specialty_name():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend', data=_base_form(power_name=''), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_submit_spend_rejects_duplicate_specialty():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_submit_spend_allows_different_specialty_on_same_skill():
    app = _app()
    _seed(app, {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}})
    client = _client(app)

    resp = client.post(
        '/player/Skilled Sasha/spend',
        data=_base_form(power_name='Trick Shots'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 1
        assert rows[0].power_name == 'Trick Shots'
