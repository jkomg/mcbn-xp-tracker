import json

import pytest
from flask import Flask

import app as app_module
from app.character_sheet import _apply_patch, find_trait_sheet_match, subcategory_label_for_trait
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


def test_new_entry_always_defaults_to_merits_even_when_backgrounds_array_exists():
    """A genuinely new purchase (no existing entry in either array) can't be
    reliably classified as Background vs. Merit from the name alone without
    duplicating the character-app's full background catalog here — so it
    always defaults to merits, matching this function's original behavior.
    Regression guard for a bug caught in review: defaulting new entries to
    'backgrounds' whenever that array happened to exist would misclassify
    ordinary new merit purchases (e.g. Iron Will) as backgrounds instead."""
    data = {'backgrounds': [], 'merits': []}
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Iron Will', '', 1)

    assert patched is True
    assert data['merits'] == [{'name': 'Iron Will', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}]
    assert data['backgrounds'] == []


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


# --- Status sub-category (power_name reused as faction/group) ---


def test_status_spend_with_faction_creates_folded_entry():
    """A new Status spend with a faction sub-category creates a single
    "Status (Tremere)" entry, matching the existing informal sheet convention."""
    data = {'backgrounds': [], 'merits': []}
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Status', 'Tremere', 1)

    assert patched is True
    assert data['merits'] == [
        {'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]


def test_status_spend_with_same_faction_updates_existing_entry_in_place():
    """Raising Status/Tremere a second time updates the existing "Status
    (Tremere)" entry's level rather than creating a duplicate."""
    data = {
        'backgrounds': [{'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
        'merits': [],
    }
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Status', 'Tremere', 2)

    assert patched is True
    assert data['backgrounds'] == [
        {'name': 'Status (Tremere)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]
    assert data['merits'] == []


def test_non_triggering_trait_unaffected_by_subcategory_logic():
    """Regression check: a plain, non-Status Advantage (e.g. Contacts) is
    completely unaffected by the new sub-category folding logic, even if a
    power_name happens to be passed."""
    data = {'backgrounds': [], 'merits': []}
    patched = _apply_patch(data, 'Advantage (Merit/Background)', 'Contacts', 'Some Value', 1)

    assert patched is True
    assert data['merits'] == [
        {'name': 'Contacts', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]


def test_two_different_status_factions_coexist_as_distinct_entries():
    """Two different factions of Status don't clobber each other — each is
    its own distinct entry in the backgrounds/merits array."""
    data = {'backgrounds': [], 'merits': []}
    _apply_patch(data, 'Advantage (Merit/Background)', 'Status', 'Tremere', 1)
    _apply_patch(data, 'Advantage (Merit/Background)', 'Status', 'Anarch Movement', 2)

    assert sorted(data['merits'], key=lambda e: e['name']) == [
        {'name': 'Status (Anarch Movement)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
        {'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]

    # Raising the Tremere entry again must not touch the Anarch Movement one.
    _apply_patch(data, 'Advantage (Merit/Background)', 'Status', 'Tremere', 3)
    assert sorted(data['merits'], key=lambda e: e['name']) == [
        {'name': 'Status (Anarch Movement)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
        {'name': 'Status (Tremere)', 'level': 3, 'summary': '', 'excludes': [], 'type': 'merit'},
    ]


def test_find_trait_sheet_match_exact_for_structured_status_faction(app_ctx):
    _seed_approved_character('Marcus', {
        'merits': [{'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'}],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Status', 'Tremere')

    assert result == {'exact': True, 'close_matches': []}


def test_find_trait_sheet_match_two_structured_factions_not_flagged_as_close_matches(app_ctx):
    """Two distinct structured Status factions are independent, unambiguous
    entries — checking one against the sheet must not surface the other as
    a "close match" warning."""
    _seed_approved_character('Marcus', {
        'merits': [
            {'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
            {'name': 'Status (Anarch Movement)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
        ],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Status', 'Tremere')

    assert result == {'exact': True, 'close_matches': []}


def test_find_trait_sheet_match_legacy_bare_status_still_warns_against_structured_factions(app_ctx):
    """A legacy/bare "Status" spend (no power_name) submitted against a sheet
    that only has structured faction entries should still be flagged — the
    original Marcus-bug protection must keep working."""
    _seed_approved_character('Marcus', {
        'merits': [
            {'name': 'Status (Tremere)', 'level': 1, 'summary': '', 'excludes': [], 'type': 'merit'},
            {'name': 'Status (Anarch Movement)', 'level': 2, 'summary': '', 'excludes': [], 'type': 'merit'},
        ],
    })

    result = find_trait_sheet_match('Marcus', 'Advantage (Merit/Background)', 'Status')

    assert result['exact'] is False
    assert sorted(m['name'] for m in result['close_matches']) == [
        'Status (Anarch Movement)', 'Status (Tremere)',
    ]


# --- subcategory_label_for_trait -------------------------------------------
# Used by the staff pending/review templates to distinguish a Discipline
# power_name (e.g. "Auspex 3") from a structured Advantage sub-category value
# (e.g. "Tremere") stored in the same power_name field, so staff see
# "Faction / Group: Tremere" instead of mistaking it for a discipline power.

def test_subcategory_label_for_trait_matches_status():
    assert subcategory_label_for_trait('Status') == 'Faction / Group'


def test_subcategory_label_for_trait_case_and_whitespace_insensitive():
    assert subcategory_label_for_trait('  STATUS  ') == 'Faction / Group'


def test_subcategory_label_for_trait_none_for_discipline():
    assert subcategory_label_for_trait('Auspex') is None


def test_subcategory_label_for_trait_none_for_blank():
    assert subcategory_label_for_trait('') is None
    assert subcategory_label_for_trait(None) is None
