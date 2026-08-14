"""Character-creation XP budget maths, server side.

Mirrors apps/character-app/src/generator/ccXp.ts. Both read the budgets and
the banking cap from packages/rules/cc_xp.json, and both price trait raises
from packages/rules/xp_costs.json — the same table post-creation spends use —
so the creator, the roster grant, and the spend engine cannot drift apart.

The server recomputes rather than trusting a submitted total: the creator is a
browser app and the draft JSON is client-authored.
"""
from .shared_contract import load_json
from .xp_rules import XP_COSTS

_CC_XP = load_json('packages/rules/cc_xp.json')

CC_XP_BUDGETS: dict[str, int] = _CC_XP['budgets']
MAX_BANKED_XP: int = _CC_XP['max_banked_xp']

_ATTRIBUTE_MULTIPLIER = XP_COSTS['Attribute']['multiplier']
_SKILL_MULTIPLIER = XP_COSTS['Skill']['multiplier']
_LORESHEET_MULTIPLIER = XP_COSTS['Loresheet']['level_multiplier']


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _cumulative_cost(from_rating: int, to_rating: int, multiplier: int) -> int:
    """Cost of raising a trait step by step, e.g. 2->4 attributes = 3x5 + 4x5."""
    if to_rating <= from_rating:
        return 0
    return sum(level * multiplier for level in range(from_rating + 1, to_rating + 1))


def _spent_on_traits(base: dict | None, current: dict | None, multiplier: int) -> int:
    if not isinstance(base, dict) or not isinstance(current, dict):
        return 0
    return sum(
        _cumulative_cost(_as_int(base.get(key)), _as_int(current.get(key)), multiplier)
        for key in base
    )


def loresheet_spent(character_data: dict) -> int:
    purchases = character_data.get('loresheet_purchases')
    if not isinstance(purchases, list):
        return 0
    return sum(
        _as_int(p.get('dot')) * _LORESHEET_MULTIPLIER
        for p in purchases
        if isinstance(p, dict)
    )


def compute_spent(character_data: dict) -> int:
    """Creation XP spent: attribute raises + skill raises + loresheet dots.

    Attribute/skill spend is measured against cc_base_attributes /
    cc_base_skills, the baseline the creator persists when the XP step is first
    entered (schema v8). Drafts created before v8 have no baseline, so their
    trait raises are not reconstructable and only loresheet spend counts —
    matching what those drafts were shown at the time.
    """
    return (
        loresheet_spent(character_data)
        + _spent_on_traits(
            character_data.get('cc_base_attributes'),
            character_data.get('attributes'),
            _ATTRIBUTE_MULTIPLIER,
        )
        + _spent_on_traits(
            character_data.get('cc_base_skills'),
            character_data.get('skills'),
            _SKILL_MULTIPLIER,
        )
    )


def compute_budget(character_data: dict) -> int:
    """Total creation budget: age-category (or era-derived) budget + inherited."""
    in_memoriam = character_data.get('in_memoriam')
    is_im_ancilla = (
        character_data.get('age_category') == 'ancilla'
        and isinstance(in_memoriam, dict)
        and not in_memoriam.get('use_standard')
    )
    if is_im_ancilla:
        base = _as_int(in_memoriam.get('total_xp'))
    else:
        base = _as_int(character_data.get('cc_xp_budget'))
    return base + _as_int(character_data.get('inherited_xp'))


def compute_banked_xp(character_data: dict) -> int:
    """XP carried into play, which becomes the roster character's creation_xp.

    Clamped to 0..MAX_BANKED_XP: an over-budget draft banks nothing, and
    anything above the cap is forfeit. The cap applies to every path including
    In-Memoriam ancilla — the intent is that players spend as much as possible
    at creation and bank only what they must.

    Note this is the *unspent* remainder, not the whole budget. Creation
    purchases never generate spend requests, so granting the full budget would
    hand out XP for traits the character already has on the sheet.
    """
    if not isinstance(character_data, dict):
        return 0
    remaining = compute_budget(character_data) - compute_spent(character_data)
    return max(0, min(remaining, MAX_BANKED_XP))
