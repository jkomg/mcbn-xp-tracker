"""Status spends require a faction/sub-category (power_name) — mirrors the
existing discipline power_name-required validation in the same routes."""

import os

from flask import Blueprint, Flask
from flask_wtf.csrf import CSRFProtect

import app as app_module
from app.blueprints import player as player_module
from app.db import DbCharacter, DbSpendRequest, DbWishListItem, db
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


def _seed(app, discord_id='111'):
    with app.app_context():
        db.session.add(DbCharacter(
            character_name='Faction Fred',
            player_discord=discord_id,
            active=True,
            status='active',
        ))
        db.session.commit()


def _client(app, discord_id='111'):
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['discord_id'] = discord_id
    return client


def _base_form(**overrides):
    form = {
        'spend_category': 'Advantage (Merit/Background)',
        'trait_name': 'Status',
        'power_name': '',
        'justification': 'Recognition from the Camarilla',
        'current_dots': '0',
        'new_dots': '1',
    }
    form.update(overrides)
    return form


def test_submit_spend_rejects_status_without_faction():
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Faction / Group is required for Status purchases.' in body
    with app.app_context():
        assert DbSpendRequest.query.count() == 0


def test_submit_spend_accepts_status_with_faction():
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend',
        data=_base_form(power_name='Tremere'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Status'
        assert rows[0].power_name == 'Tremere'


def test_wishlist_add_rejects_status_without_faction():
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/wishlist/add', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'Faction / Group is required for Status purchases.' in body
    with app.app_context():
        assert DbWishListItem.query.count() == 0


def test_wishlist_add_accepts_status_with_faction():
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/wishlist/add',
        data=_base_form(power_name='Anarch Movement'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbWishListItem.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Status'
        assert rows[0].power_name == 'Anarch Movement'


def test_submit_spend_unaffected_for_non_triggering_trait():
    """Regression check: a plain Contacts spend with no power_name still
    goes through fine — Contacts is deliberately out of scope."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend',
        data=_base_form(trait_name='Contacts'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Contacts'
