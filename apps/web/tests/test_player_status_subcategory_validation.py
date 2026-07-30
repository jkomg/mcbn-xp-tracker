"""Status spends with a faction/sub-category (power_name) work fine, and a
bare "Status" submitted under the Advantage (Merit/Background) category
without a faction is now rejected.

This requirement was deliberately deferred out of PR #387 (which shipped only
the additive/optional folded-name matching logic) into PR #388 (this one,
which ships the player-facing form UI that lets players actually supply a
faction value) — see GitHub issue #386.

Codex flagged the version originally proposed in #387 as over-broad: it
matched on trait_name alone, which would have forced ANY trait literally
named "Status" — even a custom Loresheet or skill under a different spend
category — to supply a faction. The check here is correctly scoped: it only
fires when spend_category == 'Advantage (Merit/Background)' AND the
lowercased trait_name is a key in _SUBCATEGORY_ADVANTAGES. See the
non-Advantage-category regression test below."""

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


def test_submit_spend_rejects_status_without_faction():
    """A bare Status spend under Advantage (Merit/Background) with no
    power_name/faction is now rejected — this is the hard requirement
    deferred from PR #387 into #388."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 0


def test_wishlist_add_rejects_status_without_faction():
    """Same as above, for the wishlist-add route."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/wishlist/add', data=_base_form(), follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbWishListItem.query.all()
        assert len(rows) == 0


def test_submit_spend_rejects_status_without_faction_case_insensitive():
    """The trait-name match is case-insensitive, mirroring the backend fold."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend',
        data=_base_form(trait_name='StAtUs'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 0


def test_submit_spend_status_under_non_advantage_category_not_rejected():
    """Regression test proving the category gate works: Codex correctly
    flagged that a trait literally named "Status" under a DIFFERENT spend
    category (e.g. a custom Loresheet or skill someone named "Status") must
    NOT be forced to supply a faction — the folded-name matching this
    requirement protects only ever applies to
    'Advantage (Merit/Background)'."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/spend',
        data=_base_form(spend_category='Loresheet', trait_name='Status', new_dots='1'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbSpendRequest.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Status'
        assert not rows[0].power_name


def test_wishlist_add_status_under_non_advantage_category_not_rejected():
    """Same category-gate regression check, for the wishlist-add route."""
    app = _app()
    _seed(app)
    client = _client(app)

    resp = client.post(
        '/player/Faction Fred/wishlist/add',
        data=_base_form(spend_category='Loresheet', trait_name='Status', new_dots='1'),
        follow_redirects=True,
    )

    assert resp.status_code == 200
    with app.app_context():
        rows = DbWishListItem.query.all()
        assert len(rows) == 1
        assert rows[0].trait_name == 'Status'
        assert not rows[0].power_name
