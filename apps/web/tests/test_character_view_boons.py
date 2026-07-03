"""The player character sheet (/player/<name>) shows boons owed to and by
the character, sourced from db_service.get_boons_for_character."""

import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

from app.blueprints import player as player_module
from app.db import DbBoon, DbCharacter, db
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
    db.init_app(app)
    CSRFProtect().init_app(app)
    player_module.db_service = DBService(sheets_client=None)
    app.register_blueprint(player_module.bp, url_prefix='/player')
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _player_client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def test_character_sheet_shows_owed_and_owing_boons():
    app = _app()
    with app.app_context():
        alice = DbCharacter(character_name='Alice', player_discord='111', active=True, status='active')
        marcus = DbCharacter(character_name='Marcus', player_discord='222', active=True, status='active')
        db.session.add_all([alice, marcus])
        db.session.commit()

        # Marcus owes Alice a boon; Alice owes Marcus a different one.
        db.session.add(DbBoon(
            creditor_character_id=alice.id, debtor_character_id=marcus.id,
            tier='minor', reason='Covered a missed appearance', status='owed',
        ))
        db.session.add(DbBoon(
            creditor_character_id=marcus.id, debtor_character_id=alice.id,
            tier='major', reason='Blood debt', status='repayment_offered',
        ))
        db.session.commit()

    client = _player_client(app, discord_id='111')
    resp = client.get('/player/Alice')

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Owed to you' in body
    assert 'You owe' in body
    assert 'Marcus' in body
    assert 'minor' in body
    assert 'major' in body
    assert 'repayment offered' in body


def test_character_sheet_shows_empty_state_with_no_boons():
    app = _app()
    with app.app_context():
        db.session.add(DbCharacter(character_name='Alice', player_discord='111', active=True, status='active'))
        db.session.commit()

    client = _player_client(app, discord_id='111')
    resp = client.get('/player/Alice')

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'No boons tracked' in body
