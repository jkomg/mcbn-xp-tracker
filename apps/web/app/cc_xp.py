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


def era_xp_spent(character_data: dict) -> int:
    """XP an In-Memoriam ancilla spent during the era step.

    EraXpPicker applies these purchases straight onto the sheet (attributes,
    skills, disciplines, rituals, ceremonies) and records them in
    in_memoriam.era_xp_spends. They happen BEFORE the XP step captures its
    baseline, so compute_spent() cannot see them — they have to be subtracted
    from the era budget here instead.
    """
    in_memoriam = character_data.get('in_memoriam')
    if not isinstance(in_memoriam, dict):
        return 0
    spends = in_memoriam.get('era_xp_spends')
    if not isinstance(spends, list):
        return 0
    return sum(
        _as_int(s.get('xp_cost')) for s in spends if isinstance(s, dict)
    )


def _is_in_memoriam_ancilla(character_data: dict) -> bool:
    in_memoriam = character_data.get('in_memoriam')
    return (
        (character_data.get('age_category') or '').strip().lower() == 'ancilla'
        and isinstance(in_memoriam, dict)
        and not in_memoriam.get('use_standard')
    )


def compute_budget(character_data: dict) -> int:
    """Creation budget the server is willing to grant against.

    Derived from the age category via CC_XP_BUDGETS, NOT read from the draft's
    cc_xp_budget: character_data is client-authored, so trusting that field let
    a mortal/fledgling/ghoul submit a nonzero budget and collect roster XP they
    never had.

    In-Memoriam ancilla budgets are era-derived and cannot be recomputed here
    without reimplementing the era rules, so in_memoriam.total_xp is still
    taken from the draft — but era spends are subtracted, and the banked result
    is capped at MAX_BANKED_XP regardless, which bounds the exposure from an
    inflated total to at most the cap. Staff also see budget/spent/banked on
    the review screen before approving.

    inherited_xp is deliberately ignored: nothing in the creator ever writes
    it (it is read in two display spots and always defaults to 0), so there is
    no legitimate non-zero source for it today. If banked inherited XP becomes
    a real mechanic it needs a server-side origin, not a client-supplied number.
    """
    if _is_in_memoriam_ancilla(character_data):
        in_memoriam = character_data.get('in_memoriam') or {}
        era_remainder = _as_int(in_memoriam.get('total_xp')) - era_xp_spent(character_data)
        # The cap applies to what survives the ERA step, before any Starting-XP
        # spending — EraXpPicker shows the player exactly this (banked, with the
        # rest marked wasted) and writes it into cc_xp_budget. Clamping only at
        # the end instead would refund era XP the player already forfeited: a
        # 60 XP pool with 40 spent leaves 20, of which 5 banks and 15 is lost,
        # so spending 3 more here must leave 2 — not 5.
        base = min(max(0, era_remainder), MAX_BANKED_XP)
    else:
        age = (character_data.get('age_category') or '').strip().lower()
        base = CC_XP_BUDGETS.get(age, 0)
    return max(0, base)


def compute_banked_xp(character_data: dict) -> int:
    """XP carried into play, which becomes the roster character's creation_xp.

    Clamped to 0..MAX_BANKED_XP: an over-budget draft banks nothing, and
    anything above the cap is forfeit. The cap applies to every path including
    In-Memoriam ancilla — the intent is that players spend as much as possible
    at creation and bank only what they must.

    Note this is the *unspent* remainder, not the whole budget. Creation
    purchases never generate spend requests, so granting the full budget would
    hand out XP for traits the character already has on the sheet.

    The cap is also the backstop on the one input still taken from the draft
    (an In-Memoriam ancilla's era total): however inflated it is, at most
    MAX_BANKED_XP can reach the roster.
    """
    if not isinstance(character_data, dict):
        return 0
    remaining = compute_budget(character_data) - compute_spent(character_data)
    return max(0, min(remaining, MAX_BANKED_XP))
