import json

import pytest
from flask import Flask

import app as app_module
from app.character_sheet import (
    _DOT,
    _EMPTY,
    _apply_patch,
    _apply_reverse_patch,
    _generate_stats_markdown,
    _merge_cc_specialties,
    _normalize_skill_key,
    character_has_specialty,
    character_skill_rating,
    character_vital_rating,
    find_trait_sheet_match,
    subcategory_label_for_trait,
)
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
#
# The label is only meaningful for Advantage (Merit/Background) spends —
# trait_name is free text, so a Discipline spend could coincidentally be
# typed as "Status" and must not be mislabeled as a Faction/Group.

_ADVANTAGE_CATEGORY = 'Advantage (Merit/Background)'


def test_subcategory_label_for_trait_matches_status():
    assert subcategory_label_for_trait('Status', _ADVANTAGE_CATEGORY) == 'Faction / Group'


def test_subcategory_label_for_trait_case_and_whitespace_insensitive():
    assert subcategory_label_for_trait('  STATUS  ', _ADVANTAGE_CATEGORY) == 'Faction / Group'


def test_subcategory_label_for_trait_none_for_discipline():
    assert subcategory_label_for_trait('Auspex', _ADVANTAGE_CATEGORY) is None


def test_subcategory_label_for_trait_none_for_blank():
    assert subcategory_label_for_trait('', _ADVANTAGE_CATEGORY) is None
    assert subcategory_label_for_trait(None, _ADVANTAGE_CATEGORY) is None


def test_subcategory_label_for_trait_none_for_non_advantage_category_even_if_status_named():
    """Regression test for the Codex P2 finding: a Discipline spend whose
    free-text trait_name happens to be "Status" (e.g. a player typed a
    discipline power named "Status" with a real power_name set) must not be
    labeled as a Faction/Group — the category gate must win over the name
    match so staff see the Discipline power_name display instead."""
    assert subcategory_label_for_trait('Status', 'Discipline (In-Clan)') is None
    assert subcategory_label_for_trait('status', 'Caitiff Discipline') is None


def test_subcategory_label_for_trait_none_when_category_omitted():
    """Without a spend_category, the label must not be returned — callers
    are required to pass the category through."""
    assert subcategory_label_for_trait('Status') is None


def test_subcategory_label_for_trait_none_for_non_triggering_advantage():
    """Advantage-category spends for traits outside _SUBCATEGORY_ADVANTAGES
    (e.g. Contacts) still get no label — only Status is in scope."""
    assert subcategory_label_for_trait('Contacts', _ADVANTAGE_CATEGORY) is None


# ── Skill Specialty ─────────────────────────────────────────────────────────

_SKILL_SPECIALTY = 'Skill Specialty'


def test_apply_patch_adds_specialty():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Quickdraw', 1)
    assert patched is True
    assert data['skill_specialties']['firearms'] == ['Quickdraw']


def test_apply_patch_specialty_creates_skill_specialties_dict_if_missing():
    data = {'skills': {'firearms': 2}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Quickdraw', 1)
    assert patched is True
    assert data['skill_specialties']['firearms'] == ['Quickdraw']


def test_apply_patch_specialty_appends_to_existing_list():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Trick Shots', 1)
    assert patched is True
    assert data['skill_specialties']['firearms'] == ['Quickdraw', 'Trick Shots']


def test_apply_patch_specialty_rejects_duplicate():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Quickdraw', 1)
    assert patched is False
    assert data['skill_specialties']['firearms'] == ['Quickdraw']


def test_apply_patch_specialty_duplicate_check_is_case_insensitive():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', 'quickdraw', 1)
    assert patched is False


def test_apply_patch_specialty_requires_power_name():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Firearms', '', 1)
    assert patched is False
    assert data['skill_specialties'] == {}


def test_apply_reverse_patch_removes_specialty():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}}
    reverted = _apply_reverse_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Quickdraw', 0, 1)
    assert reverted is True
    assert data['skill_specialties']['firearms'] == []


def test_apply_reverse_patch_specialty_no_op_if_already_removed():
    """Staleness guard: if the specialty isn't present anymore (e.g. staff
    already removed it directly), the reversal is a no-op rather than
    raising or clobbering unrelated state."""
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': []}}
    reverted = _apply_reverse_patch(data, _SKILL_SPECIALTY, 'Firearms', 'Quickdraw', 0, 1)
    assert reverted is False


def test_apply_reverse_patch_specialty_no_op_when_missing_power_name():
    data = {'skills': {'firearms': 2}, 'skill_specialties': {'firearms': ['Quickdraw']}}
    reverted = _apply_reverse_patch(data, _SKILL_SPECIALTY, 'Firearms', '', 0, 1)
    assert reverted is False


def test_character_skill_rating_reads_approved_sheet(app_ctx):
    _seed_approved_character('Rated Rex', {'skills': {'firearms': 3}})
    assert character_skill_rating('Rated Rex', 'Firearms') == 3


def test_character_skill_rating_zero_for_unrated_skill(app_ctx):
    _seed_approved_character('Unrated Uma', {'skills': {'firearms': 3}})
    assert character_skill_rating('Unrated Uma', 'Larceny') == 0


def test_character_skill_rating_zero_when_no_approved_sheet(app_ctx):
    assert character_skill_rating('Nobody', 'Firearms') == 0


def test_character_has_specialty_true_when_present(app_ctx):
    _seed_approved_character(
        'Specialized Sam', {'skills': {'firearms': 3}, 'skill_specialties': {'firearms': ['Quickdraw']}},
    )
    assert character_has_specialty('Specialized Sam', 'Firearms', 'Quickdraw') is True
    assert character_has_specialty('Specialized Sam', 'Firearms', 'quickdraw') is True


def test_character_has_specialty_false_when_absent(app_ctx):
    _seed_approved_character(
        'Specialized Sam', {'skills': {'firearms': 3}, 'skill_specialties': {'firearms': ['Quickdraw']}},
    )
    assert character_has_specialty('Specialized Sam', 'Firearms', 'Trick Shots') is False


def test_subcategory_label_for_trait_specialty_for_skill_specialty_category():
    assert subcategory_label_for_trait('Firearms', _SKILL_SPECIALTY) == 'Specialty'
    assert subcategory_label_for_trait('Anything', _SKILL_SPECIALTY) == 'Specialty'


# ── _normalize_skill_key (Codex P2: multiword skills like Animal Ken) ──────


def test_normalize_skill_key_lowercases():
    assert _normalize_skill_key('Firearms') == 'firearms'


def test_normalize_skill_key_collapses_spaces_to_underscore():
    assert _normalize_skill_key('Animal Ken') == 'animal_ken'
    assert _normalize_skill_key('animal ken') == 'animal_ken'
    assert _normalize_skill_key('  Animal   Ken  ') == 'animal_ken'


def test_normalize_skill_key_blank():
    assert _normalize_skill_key('') == ''
    assert _normalize_skill_key(None) == ''


def test_character_skill_rating_multiword_skill(app_ctx):
    """Regression test: a plain .lower() with no space handling would look
    up 'animal ken' against a sheet keyed 'animal_ken' and always miss."""
    _seed_approved_character('Beast Whisperer', {'skills': {'animal_ken': 3}})
    assert character_skill_rating('Beast Whisperer', 'Animal Ken') == 3


def test_apply_patch_specialty_multiword_skill_matches_rating_key():
    """The Skill Specialty patch branch must key skill_specialties the same
    way the sheet's skills dict and player/sheet.html's fixed key lists do
    ('animal_ken'), or a purchased specialty would be stored under a key the
    sheet template never looks at."""
    data = {'skills': {'animal_ken': 2}, 'skill_specialties': {}}
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Animal Ken', 'Big Cats', 1)
    assert patched is True
    assert data['skill_specialties']['animal_ken'] == ['Big Cats']


# ── _merge_cc_specialties (Codex P1: CC-format skillSpecialties list) ──────


def test_merge_cc_specialties_populates_from_cc_list():
    data = {'skillSpecialties': [{'skill': 'Firearms', 'name': 'Quickdraw'}]}
    _merge_cc_specialties(data)
    assert data['skill_specialties'] == {'firearms': ['Quickdraw']}


def test_merge_cc_specialties_multiword_skill_normalized():
    data = {'skillSpecialties': [{'skill': 'Animal Ken', 'name': 'Big Cats'}]}
    _merge_cc_specialties(data)
    assert data['skill_specialties'] == {'animal_ken': ['Big Cats']}


def test_merge_cc_specialties_includes_predator_type_picks():
    data = {
        'skillSpecialties': [{'skill': 'Firearms', 'name': 'Quickdraw'}],
        'predatorType': {'pickedSpecialties': [{'skill': 'Stealth', 'name': 'Shadowing'}]},
    }
    _merge_cc_specialties(data)
    assert data['skill_specialties'] == {'firearms': ['Quickdraw'], 'stealth': ['Shadowing']}


def test_merge_cc_specialties_noop_when_skill_specialties_already_present():
    """Once skill_specialties exists (e.g. from a RoD import or a prior
    patch), the CC list is never consulted again — this is the existing,
    intentional guard in player.py's _normalize_sheet_data."""
    data = {
        'skillSpecialties': [{'skill': 'Firearms', 'name': 'Quickdraw'}],
        'skill_specialties': {'firearms': ['Already Here']},
    }
    _merge_cc_specialties(data)
    assert data['skill_specialties'] == {'firearms': ['Already Here']}


def test_merge_cc_specialties_noop_when_no_cc_data():
    data = {'skills': {'firearms': 2}}
    _merge_cc_specialties(data)
    assert 'skill_specialties' not in data


def test_character_has_specialty_sees_cc_format_specialty(app_ctx):
    """Regression test for the Codex P1 finding: without merging CC-format
    specialties, a character whose specialty only exists as
    skillSpecialties: [{skill, name}] would look unspecialized, letting the
    same specialty be purchased again."""
    _seed_approved_character('CC Imported Casey', {
        'skills': {'firearms': 3},
        'skillSpecialties': [{'skill': 'Firearms', 'name': 'Quickdraw'}],
    })
    assert character_has_specialty('CC Imported Casey', 'Firearms', 'Quickdraw') is True


def test_apply_patch_preserves_cc_specialties_when_adding_new_one():
    """Regression test for the Codex P1 finding: patching a new specialty
    onto a sheet that already has CC-format specialties must not create a
    skill_specialties dict from scratch and silently drop them — this test
    exercises _merge_cc_specialties directly the way _do_patch calls it
    before _apply_patch."""
    data = {
        'skills': {'firearms': 3, 'stealth': 2},
        'skillSpecialties': [{'skill': 'Firearms', 'name': 'Quickdraw'}],
    }
    _merge_cc_specialties(data)
    patched = _apply_patch(data, _SKILL_SPECIALTY, 'Stealth', 'Shadowing', 1)
    assert patched is True
    assert data['skill_specialties'] == {
        'firearms': ['Quickdraw'],
        'stealth': ['Shadowing'],
    }


# ── Blood Potency ────────────────────────────────────────────────────────
# trait_name is the fixed-trait category name itself here — the player.html
# form auto-fills and read-onlys the trait name field for Humanity/Blood
# Potency spends (FIXED_TRAIT_CATEGORIES), so _apply_patch is always called
# with trait_name == 'Blood Potency', mirroring the existing Humanity branch.

_BLOOD_POTENCY = 'Blood Potency'


def test_apply_patch_sets_blood_potency():
    data = {'bloodPotency': 1}
    patched = _apply_patch(data, _BLOOD_POTENCY, _BLOOD_POTENCY, '', 2)
    assert patched is True
    assert data['bloodPotency'] == 2


def test_apply_patch_sets_blood_potency_when_missing_from_draft():
    data = {}
    patched = _apply_patch(data, _BLOOD_POTENCY, _BLOOD_POTENCY, '', 1)
    assert patched is True
    assert data['bloodPotency'] == 1


def test_apply_reverse_patch_restores_prior_blood_potency():
    data = {'bloodPotency': 2}
    reverted = _apply_reverse_patch(data, _BLOOD_POTENCY, _BLOOD_POTENCY, '', 1, 2)
    assert reverted is True
    assert data['bloodPotency'] == 1


def test_apply_reverse_patch_blood_potency_no_op_when_stale():
    """Staleness guard: if bloodPotency no longer equals new_dots (e.g. a
    later spend raised it further), the reversal is a no-op that leaves the
    newer value untouched — mirrors the existing Humanity staleness guard."""
    data = {'bloodPotency': 3}
    reverted = _apply_reverse_patch(data, _BLOOD_POTENCY, _BLOOD_POTENCY, '', 1, 2)
    assert reverted is False
    assert data['bloodPotency'] == 3


# ── Vitals dot rendering (Humanity / Blood Potency are 0-10, not 0-5) ────────

def test_stats_markdown_renders_vitals_on_a_ten_dot_track():
    """Humanity and Blood Potency are rated 0-10, unlike every other dotted
    trait. They must render a full ten-dot track, or a rating above 5 gets
    silently clamped to 5 in the wiki stats block."""
    markdown = _generate_stats_markdown({'bloodPotency': 7, 'humanity': 8})
    assert f'Blood Potency {_DOT * 7}{_EMPTY * 3}' in markdown
    assert f'Humanity {_DOT * 8}{_EMPTY * 2}' in markdown


def test_stats_markdown_still_renders_five_dot_traits_on_a_five_dot_track():
    """The 0-10 track applies only to the vitals — Attributes and Skills keep
    their five-dot rendering."""
    markdown = _generate_stats_markdown({'attributes': {'strength': 3}})
    assert f'Strength {_DOT * 3}{_EMPTY * 2}' in markdown


# ── Fixed-trait vitals: current_dots must match the sheet ────────────────────

def test_character_vital_rating_reads_both_vitals(app_ctx):
    _seed_approved_character('Vitals Vera', {'bloodPotency': 4, 'humanity': 6})
    assert character_vital_rating('Vitals Vera', 'Blood Potency') == 4
    assert character_vital_rating('Vitals Vera', 'Humanity') == 6


def test_character_vital_rating_none_for_other_categories(app_ctx):
    _seed_approved_character('Vitals Vera', {'bloodPotency': 4})
    assert character_vital_rating('Vitals Vera', 'Attribute') is None


def test_character_vital_rating_none_when_field_absent(app_ctx):
    """Absent field must read as unknown, not 0 — a character whose sheet
    never recorded the vital must still be able to submit spends."""
    _seed_approved_character('No Vitals Nick', {'attributes': {'strength': 2}})
    assert character_vital_rating('No Vitals Nick', 'Blood Potency') is None


def test_character_vital_rating_none_without_a_sheet(app_ctx):
    assert character_vital_rating('Ghost Who Has No Draft', 'Blood Potency') is None


def test_submit_spend_request_rejects_stale_blood_potency(app_ctx):
    """The bug this guards: a wish-list item left at the default 0->1 would
    charge 10 XP to 'raise' a Blood Potency 4 character and downgrade the
    sheet to 1 on approval."""
    _seed_approved_character('Potent Pete', {'bloodPotency': 4})
    with pytest.raises(ValueError, match='Blood Potency is 4'):
        app_module.db_service.submit_spend_request(
            character_name='Potent Pete',
            spend_category='Blood Potency',
            trait_name='Blood Potency',
            current_dots=0,
            new_dots=1,
            is_in_clan=False,
            justification='stale wish-list default',
        )


def test_submit_spend_request_rejects_inflated_humanity(app_ctx):
    """Same guard in the undercharge direction, on the pre-existing category."""
    _seed_approved_character('Moral Mona', {'humanity': 6})
    with pytest.raises(ValueError, match='Humanity is 6'):
        app_module.db_service.submit_spend_request(
            character_name='Moral Mona',
            spend_category='Humanity',
            trait_name='Humanity',
            current_dots=8,
            new_dots=9,
            is_in_clan=False,
            justification='inflated current rating',
        )


def test_submit_spend_request_allows_matching_blood_potency(app_ctx):
    _seed_approved_character('Potent Pete', {'bloodPotency': 4})
    cost = app_module.db_service.submit_spend_request(
        character_name='Potent Pete',
        spend_category='Blood Potency',
        trait_name='Blood Potency',
        current_dots=4,
        new_dots=5,
        is_in_clan=False,
        justification='honest raise',
    )
    assert cost == 50


def test_submit_spend_request_unaffected_without_a_sheet(app_ctx):
    """No imported sheet means nothing to validate against — must not block."""
    cost = app_module.db_service.submit_spend_request(
        character_name='Sheetless Sam',
        spend_category='Blood Potency',
        trait_name='Blood Potency',
        current_dots=1,
        new_dots=2,
        is_in_clan=False,
        justification='no sheet on file',
    )
    assert cost == 20


def test_submit_spend_request_does_not_gate_other_categories(app_ctx):
    """The gate is scoped to fixed-trait vitals; named-collection traits still
    go through unchecked, same as before this change."""
    _seed_approved_character('Potent Pete', {'bloodPotency': 4, 'attributes': {'strength': 3}})
    cost = app_module.db_service.submit_spend_request(
        character_name='Potent Pete',
        spend_category='Attribute',
        trait_name='Strength',
        current_dots=1,
        new_dots=2,
        is_in_clan=False,
        justification='unchecked category',
    )
    assert cost == 10
