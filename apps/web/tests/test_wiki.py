"""Tests for the Chronicle Wiki blueprint and /api/wiki/page endpoint."""

from pathlib import Path
from flask import Flask, Blueprint
from flask_wtf.csrf import CSRFProtect
from app.blueprints.wiki import bp as wiki_bp, _slugify, _render_md, _RESERVED_SLUGS, _excerpt
from app.blueprints.api import bp as api_bp
from app.db import db, WikiPage, DbCharacter, DbSpendRequest

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


def _set_staff_session(client, staff_user: str = 'Test Staff'):
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['staff_user'] = staff_user


# ── Unit tests ────────────────────────────────────────────────────────────────

def test_slugify_basic():
    assert _slugify('Nashville Overview') == 'nashville-overview'


def test_slugify_special_chars():
    assert _slugify("The Elysium — Hermitage Hotel!") == 'the-elysium-hermitage-hotel'


def test_render_md_basic():
    result = str(_render_md('## Hello\n\n**bold**'))
    assert '<h2' in result
    assert '<strong>bold</strong>' in result


def test_render_md_strikethrough():
    result = str(_render_md('~~deleted~~'))
    assert '<del>deleted</del>' in result


def test_render_md_strikethrough_skips_inline_code():
    result = str(_render_md('`~~token~~`'))
    assert '<del>' not in result
    assert '~~token~~' in result


def test_render_md_strikethrough_skips_fenced_code():
    result = str(_render_md('```\n~~example~~\n```'))
    assert '<del>' not in result


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
    assert 'search' in _RESERVED_SLUGS


def test_excerpt_match():
    body = 'The Camarilla controls the Elysium in downtown Nashville.'
    result = _excerpt(body, 'Elysium')
    assert 'Elysium' in result


def test_excerpt_no_match():
    body = 'Nothing relevant here.'
    result = _excerpt(body, 'vampire')
    assert result  # still returns something


def test_excerpt_ellipsis():
    body = 'x ' * 200 + 'TARGET' + ' x' * 200
    result = _excerpt(body, 'TARGET')
    assert 'TARGET' in result
    assert result.startswith('…')


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
        p = WikiPage(slug='test-page', title='Test', body_markdown='# Hello', status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/test-page')
        assert res.status_code == 200
        assert b'Test' in res.data


def test_wiki_draft_hidden_from_public():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='draft-page', title='Draft', body_markdown='secret', status="draft")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/draft-page')
        assert res.status_code == 404


def test_wiki_search_empty_query():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/search')
        assert res.status_code == 200


def test_wiki_search_finds_by_title():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='nashville-overview', title='Nashville Overview',
                     body_markdown='A city of music.', status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/search?q=Nashville')
        assert res.status_code == 200
        assert b'Nashville Overview' in res.data


def test_wiki_search_finds_by_body():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='elysium-page', title='The Elysium',
                     body_markdown='The kindred gather at the Elysium each full moon.',
                     status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/search?q=kindred')
        assert res.status_code == 200
        assert b'The Elysium' in res.data


def test_wiki_search_hides_drafts():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='secret-page', title='Secret Draft',
                     body_markdown='hidden content', status="draft")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/search?q=hidden')
        assert res.status_code == 200
        assert b'Secret Draft' not in res.data


def test_wiki_new_requires_staff():
    app = _app()
    with app.test_client() as client:
        res = client.get('/wiki/new')
        # redirects to login when not authenticated
        assert res.status_code in (302, 401)


def test_wiki_delete_requires_staff():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='del-test', title='Delete Me', status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.post('/wiki/delete/del-test')
        assert res.status_code in (302, 401)
    # Page must still exist — unauthenticated delete should not succeed
    with app.app_context():
        assert WikiPage.query.filter_by(slug='del-test').first() is not None


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
        p = WikiPage(slug='existing', title='Old Title', status="active")
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


def test_api_wiki_page_update_blocked_when_sync_locked():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='existing', title='Old Title', status="active", sync_locked=True)
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.post(
            '/api/wiki/page',
            json={'slug': 'existing', 'title': 'New Title'},
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 423
        assert res.get_json()['status'] == 'locked'
    with app.app_context():
        assert WikiPage.query.filter_by(slug='existing').first().title == 'Old Title'


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


def test_api_wiki_page_delete():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='to-delete', title='Bye', status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.delete(
            '/api/wiki/page/to-delete',
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 200
        assert res.get_json()['status'] == 'deleted'
    with app.app_context():
        assert WikiPage.query.filter_by(slug='to-delete').first() is None


def test_api_wiki_page_delete_blocked_when_sync_locked():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='to-delete', title='Bye', status="active", sync_locked=True)
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        res = client.delete(
            '/api/wiki/page/to-delete',
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 423
        assert res.get_json()['status'] == 'locked'
    with app.app_context():
        assert WikiPage.query.filter_by(slug='to-delete').first() is not None


def test_api_wiki_page_delete_not_found():
    app = _app()
    with app.test_client() as client:
        res = client.delete(
            '/api/wiki/page/ghost-page',
            headers={'Authorization': 'Bearer write-token'},
        )
        assert res.status_code == 404


def test_api_wiki_page_delete_requires_auth():
    app = _app()
    with app.test_client() as client:
        res = client.delete('/api/wiki/page/any-page')
        assert res.status_code == 401


def test_wiki_staff_can_lock_and_unlock_page():
    app = _app()
    with app.app_context():
        p = WikiPage(slug='lock-me', title='Lock Me', status="active")
        db.session.add(p)
        db.session.commit()
    with app.test_client() as client:
        _set_staff_session(client, 'Lock Tester')
        lock_res = client.post('/wiki/lock/lock-me')
        assert lock_res.status_code == 302
    with app.app_context():
        row = WikiPage.query.filter_by(slug='lock-me').first()
        assert row.sync_locked is True
        assert row.sync_locked_by == 'Lock Tester'
        assert row.sync_locked_at is not None
    with app.test_client() as client:
        _set_staff_session(client, 'Unlock Tester')
        unlock_res = client.post('/wiki/unlock/lock-me')
        assert unlock_res.status_code == 302
    with app.app_context():
        row = WikiPage.query.filter_by(slug='lock-me').first()
        assert row.sync_locked is False
        assert row.sync_locked_by == ''
        assert row.sync_locked_at is None


# ── XP snapshot tests ─────────────────────────────────────────────────────────

def test_character_page_shows_xp_snapshot():
    """Character wiki page renders XP stats when a matching DbCharacter exists."""
    app = _app()
    with app.app_context():
        char = DbCharacter(character_name='Evander Cole', clan='Ventrue',
                           creation_xp=10, active=True)
        db.session.add(char)
        page = WikiPage(slug='char-evander-cole', title='Evander Cole',
                        category='characters', status="active")
        db.session.add(page)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/char-evander-cole')
        assert res.status_code == 200
        assert b'Earned' in res.data
        assert b'Spent' in res.data
        assert b'Balance' in res.data


def test_character_page_xp_snapshot_reflects_spends():
    """Approved spend history appears in the collapsible Purchases list."""
    app = _app()
    with app.app_context():
        char = DbCharacter(character_name='Evander Cole', clan='Ventrue',
                           creation_xp=20, active=True)
        db.session.add(char)
        spend = DbSpendRequest(
            character_name='Evander Cole',
            spend_category='Discipline',
            trait_name='Dominate',
            current_dots=2, new_dots=3,
            xp_cost=9, verified_cost=9,
            status='Approved',
        )
        db.session.add(spend)
        page = WikiPage(slug='char-evander-cole', title='Evander Cole',
                        category='characters', status="active")
        db.session.add(page)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/char-evander-cole')
        assert res.status_code == 200
        assert b'Dominate' in res.data
        assert b'9 XP' in res.data


def test_non_character_page_no_xp_snapshot():
    """Non-character wiki pages do not render the XP card."""
    app = _app()
    with app.app_context():
        page = WikiPage(slug='loc-elysium', title='The Elysium',
                        category='locations', status="active",
                        body_markdown='A place.')
        db.session.add(page)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/loc-elysium')
        assert res.status_code == 200
        assert b'wiki-xp-stats' not in res.data


def test_character_page_no_xp_when_unmatched():
    """Character page with no matching DbCharacter renders without XP card."""
    app = _app()
    with app.app_context():
        page = WikiPage(slug='char-ghost', title='Ghost Character',
                        category='characters', status="active",
                        body_markdown='No DB record.')
        db.session.add(page)
        db.session.commit()
    with app.test_client() as client:
        res = client.get('/wiki/char-ghost')
        assert res.status_code == 200
        assert b'wiki-xp-stats' not in res.data
