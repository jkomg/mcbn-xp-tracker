"""Retired/deceased characters are hidden from a player's /player dashboard
by default; ?show=all reveals them again. Nothing is ever deleted."""

import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

from app.blueprints import player as player_module
from app.db import DbCharacter, db
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


def _seed(app, discord_id='111'):
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Alice Active',
            player_discord=discord_id,
            active=True,
            status='active',
        ))
        db.session.add(DbCharacter(
            character_name='Rusty Retired',
            player_discord=discord_id,
            active=False,
            status='retired',
        ))
        db.session.commit()


def test_retired_character_hidden_by_default():
    app = _app()
    _seed(app)
    client = _player_client(app)

    resp = client.get('/player/')

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Alice Active' in body
    assert 'Rusty Retired' not in body
    assert 'Show 1 retired/deceased' in body


def test_show_all_reveals_retired_character():
    app = _app()
    _seed(app)
    client = _player_client(app)

    resp = client.get('/player/?show=all')

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Alice Active' in body
    assert 'Rusty Retired' in body
    assert 'Retired' in body  # status badge
    assert 'Hide retired' in body


def test_player_with_only_retired_characters_sees_reveal_link_not_link_flow():
    app = _app()
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Only Retired',
            player_discord='222',
            active=False,
            status='retired',
        ))
        db.session.commit()
    client = _player_client(app, discord_id='222')

    resp = client.get('/player/')

    # Must NOT redirect to the "link a character" flow — the player does
    # have a linked character, it's just hidden by default.
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Only Retired' not in body
    assert 'Show 1 retired/deceased' in body
