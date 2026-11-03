"""The staff review page, rendered from the real template.

Other draft tests patch render_template, because base.html needs blueprints a
minimal app does not register. That hid a template bug: the budget/spent/banked
row sat inside the In-Memoriam era-spends card, so staff reviewing an ordinary
character never saw it. base.html is stubbed here so the page itself renders.
"""

import json
import os
from datetime import datetime, timezone

import pytest
from flask import Blueprint, Flask
from jinja2 import ChoiceLoader, DictLoader, FileSystemLoader

from app.blueprints.cc_admin import bp as cc_admin_bp
from app.blueprints.character_creator import bp as character_creator_bp
from app.db import CharacterDraft, db

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'templates')

_fake_dashboard_bp = Blueprint('dashboard', __name__)


@_fake_dashboard_bp.route('/login')
def login():
    return 'login', 200


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = 'test'
    app.jinja_loader = ChoiceLoader([
        DictLoader({'base.html': '{% block content %}{% endblock %}'}),
        FileSystemLoader(_TEMPLATES_DIR),
    ])
    app.jinja_env.globals['csrf_token'] = lambda: 'token'
    db.init_app(app)
    app.register_blueprint(cc_admin_bp)
    app.register_blueprint(character_creator_bp)
    app.register_blueprint(_fake_dashboard_bp)
    with app.app_context():
        db.create_all()
    return app


def _review_page(app, character_data):
    with app.app_context():
        draft = CharacterDraft(
            player_discord_id='111',
            character_name='Fiona Vale',
            status='submitted',
            character_data=json.dumps(character_data),
            submitted_at=datetime.now(timezone.utc),
        )
        db.session.add(draft)
        db.session.commit()
        draft_id = draft.id
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['authenticated'] = True
        sess['discord_name'] = 'teststaff'
    res = client.get(f'/cc-admin/drafts/{draft_id}')
    assert res.status_code == 200
    return res.get_data(as_text=True)


def test_figures_show_for_a_draft_without_era_spends(app):
    body = _review_page(app, {'clan': 'Toreador', 'age_category': 'neonate'})
    assert 'Creation XP budget:' in body
    assert 'Banks into play:' in body
    assert 'the rest is forfeit' in body
    assert 'Era XP Spends' not in body


def test_era_spends_still_render_for_in_memoriam(app):
    body = _review_page(app, {
        'clan': 'Toreador',
        'age_category': 'ancilla',
        'in_memoriam': {
            'use_standard': False,
            'total_xp': 20,
            'era_xp_spends': [{'pool': 'free', 'category': 'skill', 'name': 'Brawl', 'cost': 3}],
        },
    })
    assert 'Era XP Spends' in body
    assert 'Banks into play:' in body


def test_page_shows_the_servers_budget_not_the_drafts(app):
    """character_data is client-authored and approval ignores these fields, so
    showing them told staff a number approval never used."""
    body = _review_page(app, {
        'clan': 'Toreador',
        'age_category': 'neonate',
        'cc_xp_budget': 500,
        'inherited_xp': 20,
    })
    assert '500' not in body
    assert 'inherited' not in body
    assert '15 XP' in body
