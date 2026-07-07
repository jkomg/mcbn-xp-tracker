import json

import pytest
from flask import Flask

import app as app_module
from app.character_sheet import _apply_patch, find_trait_sheet_match
from app.db import CharacterDraft, DbCharacter, db
from app.db_service import DBService


@pytest.fixture()
def app_ctx():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()
        app_module.db_service = DBService()
        yield app


def _seed_approved_character(character_name: str, character_data: dict):
    char = DbCharacter(character_name=character_name, active=True)
    db.session.add(char)
    db.session.flush()
    draft = CharacterDraft(
        player_discord_id='111111111111111111',
        character_name=character_name,
        status='approved',
        roster_character_id=char.id,
        character_data=json.dumps(character_data),
    )
    db.session.add(draft)
    db.session.commit()


def test_updates_existing_background_entry_not_merits():
    """Regression test: approving a raise on an existing Background (e.g. Status)
    must update the entry in data['backgrounds'], not create a stray duplicate
    in data['merits'] — schema v7+ keeps them as separate arrays."""
    data = {
        'backgrounds': [{'name': 'Status', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
        'merits': [{'name': 'Iron Will', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'}],
    }
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Status', '', 2)

    assert patched is True
    assert data['backgrounds'] == [{'name': 'Status', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'}]
    assert len(data['merits']) == 1
    assert data['merits'][0]['name'] == 'Iron Will'


def test_updates_existing_merit_entry_when_not_in_backgrounds():
    data = {
        'backgrounds': [],
        'merits': [{'name': 'Iron Will', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'}],
    }
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Iron Will', '', 3)

    assert patched is True
    assert data['merits'][0]['level'] == 3
    assert data['backgrounds'] == []


def test_new_background_appends_to_backgrounds_array_when_it_exists():
    data = {'backgrounds': [], 'merits': []}
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Contacts', '', 1)

    assert patched is True
    assert data['backgrounds'] == [{'name': 'Contacts', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}]
    assert data['merits'] == []


def test_new_entry_falls_back_to_merits_for_pre_v7_sheets_with_no_backgrounds_array():
    data = {'merits': []}
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Iron Will', '', 1)

    assert patched is True
    assert data['merits'] == [{'name': 'Iron Will', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}]
    assert 'backgrounds' not in data


def test_find_trait_sheet_match_surfaces_close_match(app_ctx):
    """Regression test for the Marcus bug: submitting "Status" against a sheet
    that only has "Status (Tremere)" should be flagged as a likely mismatch."""
    _seed_approved_character('Marcus', {
        'merits': [{'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Status')

    assert result == {'exact': False, 'close_matches': [{'name': 'Status (Tremere)', 'level': 1}]}


def test_find_trait_sheet_match_no_warning_on_exact_match(app_ctx):
    _seed_approved_character('Marcus', {
        'backgrounds': [{'name': 'Status', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Status')

    assert result == {'exact': True, 'close_matches': []}


def test_find_trait_sheet_match_no_warning_for_genuinely_new_trait(app_ctx):
    _seed_approved_character('Marcus', {
        'merits': [{'name': 'Iron Will', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Contacts')

    assert result == {'exact': False, 'close_matches': []}


def test_find_trait_sheet_match_ignored_for_other_categories(app_ctx):
    _seed_approved_character('Marcus', {
        'merits': [{'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })

    assert find_trait_sheet_match('Marcus', 'Attribute', 'Status') is None


def test_find_trait_sheet_match_none_when_no_approved_sheet(app_ctx):
    assert find_trait_sheet_match('Nobody', 'Advantage (Merit/Background)', 'Status') is None
