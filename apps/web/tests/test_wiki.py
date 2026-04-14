"""Tests for the Chronicle Wiki blueprint and /api/wiki/page endpoint."""

from pathlib import Path
from flask import Flask, Blueprint
from flask_wtf.csrf import CSRFProtect
from app.blueprints.wiki import bp as wiki_bp, _slugify, _render_md, _unique_slug, _RESERVED_SLUGS
from app.blueprints.api import bp as api_bp
from app.db import db, WikiPage

_TEMPLATE_DIR = str(Path(__file__).resolve().parents[1] / 'app' / 'templates')
_STATIC_DIR   = str(Path(__file__).resolve().parents[1] / 'app' / 'static')


def _stub_bp(name: str, prefix: str, routes: dict) -> Blueprint:
    """Build a minimal stub blueprint so templates can call url_for()."""
    bp = Blueprint(name, __name__)
    for rule, fn_name in routes.items():
        bp.add_url_rule(rule, fn_name, lambda **_: ('', 200))
    return bp


def _app():
    app = Flask(__name__, template_folder=_TEMPLATE_DIR, static_folder=_STATIC_DIR)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test-secret'
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['WEB_APP_API_TOKEN'] = 'test-token'
    app.config['WEB_APP_API_READ_TOKEN'] = 'read-token'
    app.config['WEB_APP_API_WRITE_TOKEN'] = 'write-token'
    app.config['BOT_API_REPLAY_PROTECTION_ENABLED'] = False
    app.config['ALLOWED_DISCORD_IDS'] = set()
    db.init_app(app)
    CSRFProtect(app)
    # Stub blueprints referenced by wiki templates
    dash = _stub_bp('dashboard', '/', {'/': 'index', '/login': 'login', '/logout': 'logout'})
    player = _stub_bp('player', '/player', {'/player/': 'my_characters'})
    app.register_blueprint(dash)
    app.register_blueprint(player)
    app.register_blueprint(wiki_bp, url_prefix='/wiki')
    app.register_blueprint(api_bp, url_prefix='/api')
    with app.app_context():
        db.create_all()
    return app


# ── Unit tests ────────────────────────────────────────────────────────────────

def test_slugify_basic():
    assert _slugify('Nashville Overview') == 'nashville-overview'


def test_slugify_special_chars():
    assert _slugify("The Elysium — Hermitage Hotel!") == 'the-elysium-hermitage-hotel'


def test_render_md_basic():
    result = str(_render_md('## Hello\n\n**bold**'))
    assert '<h2' in result
    assert '<strong>bold</strong>' in result


def test_render_md_strips_script():
    result = str(_render_md('<script>alert(1)</script>\n\nSafe'))
    assert '<script>' not in result
    assert 'alert' not in result


def test_render_md_strips_event_handlers():
    result = str(_render_md('<a href="x" onclick="evil()">click</a>'))
    assert 'onclick' not in result


def test_render_md_blocks_javascript_href():
    result = str(_render_md('[click](javascript:alert(1))'))
    assert 'javascript:' not in result


def test_reserved_slugs():
    assert 'new' in _RESERVED_SLUGS
    assert 'edit' in _RESERVED_SLUGS
    assert 'category' in _RESERVED_SLUGS


# ── Route tests ───────────────────────────────────────────────────────────────

def test_wiki_index_empty():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/')
        assert res.status_code == 200
        assert b'Chronicle Wiki' in res.data


def test_wiki_category_valid():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/category/locations')
        assert res.status_code == 200


def test_wiki_category_invalid():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/category/nonexistent')
        assert res.status_code == 404


def test_wiki_page_not_found():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/no-such-page')
        assert res.status_code == 404


def test_wiki_page_published():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='test-page', title='Test', body_markdown='# Hello', published=True)
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/test-page')
        assert res.status_code == 200
        assert b'Test' in res.data


def test_wiki_draft_hidden_from_public():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='draft-page', title='Draft', body_markdown='secret', published=False)
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/draft-page')
        assert res.status_code == 404


def test_wiki_new_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/new')
        # redirects to login when not authenticated
        assert res.status_code in (302, 401)


# ── API upsert tests ──────────────────────────────────────────────────────────

def test_api_wiki_page_create():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/wiki/page',
            json={'slug': 'nashville', 'title': 'Nashville', 'body_markdown': '# City', 'category': 'locations'},
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 201
        assert res.get_json()['status'] == 'created'


def test_api_wiki_page_update():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='existing', title='Old Title', published=True)
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.post(
            '/api/wiki/page',
            json={'slug': 'existing', 'title': 'New Title'},
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 200
        assert res.get_json()['status'] == 'updated'
    with app.app_context():
        assert WikiPage.query.filter_by(slug='existing').first().title == 'New Title'


def test_api_wiki_page_requires_auth():
    app = _app()
    with app.test_client() as client:
        res = client.post('/api/wiki/page', json={'slug': 'x', 'title': 'X'})
        assert res.status_code == 401


def test_api_wiki_page_missing_fields():
    app = _app()
    with app.test_client() as client:
        res = client.post(
            '/api/wiki/page',
            json={'slug': 'only-slug'},
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 400
