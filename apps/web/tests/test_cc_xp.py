"""Unit tests for character-creation XP budget maths (app/cc_xp.py).

Mirrors apps/character-app/src/test/ccXp.test.ts — the two implementations must
agree, since the creator shows the player a number and the server decides what
actually lands on the roster.
"""

from app.cc_xp import (
    CC_XP_BUDGETS,
    MAX_BANKED_XP,
    compute_banked_xp,
    compute_budget,
    compute_spent,
    era_xp_spent,
)


def test_budgets_match_the_chronicle_rules():
    assert CC_XP_BUDGETS['mortal'] == 0
    assert CC_XP_BUDGETS['fledgling'] == 0
    assert CC_XP_BUDGETS['ghoul'] == 0
    assert CC_XP_BUDGETS['neonate'] == 15
    assert CC_XP_BUDGETS['ancilla'] == 35
    assert MAX_BANKED_XP == 5


def test_loresheet_dots_cost_three_each():
    data = {'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 1},
                                    {'loresheet_id': 'b', 'dot': 3}]}
    assert compute_spent(data) == 3 + 9


def test_attribute_raises_are_progressive():
    # strength 2 -> 4 = (3x5) + (4x5) = 35
    data = {'cc_base_attributes': {'strength': 2}, 'attributes': {'strength': 4}}
    assert compute_spent(data) == 35


def test_skill_raises_are_progressive():
    # brawl 1 -> 3 = (2x3) + (3x3) = 15
    data = {'cc_base_skills': {'brawl': 1}, 'skills': {'brawl': 3}}
    assert compute_spent(data) == 15


def test_lowering_a_trait_does_not_refund():
    data = {'cc_base_attributes': {'strength': 3}, 'attributes': {'strength': 1}}
    assert compute_spent(data) == 0


def test_pre_v8_draft_without_baseline_counts_loresheets_only():
    """No cc_base_* keys means trait spend is unreconstructable; counting the
    raise would be a guess, so only loresheet spend is charged."""
    data = {'attributes': {'strength': 4},
            'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 2}]}
    assert compute_spent(data) == 6


def test_budget_comes_from_the_age_category_not_the_draft():
    """character_data is client-authored. Trusting cc_xp_budget let a
    zero-budget character submit a nonzero one and collect roster XP."""
    data = {'age_category': 'ancilla', 'cc_xp_budget': 999}
    assert compute_budget(data) == 35


def test_zero_budget_ages_cannot_claim_a_budget():
    for age in ('mortal', 'fledgling', 'ghoul'):
        data = {'age_category': age, 'cc_xp_budget': 50}
        assert compute_budget(data) == 0, age
        assert compute_banked_xp(data) == 0, age


def test_inherited_xp_is_ignored():
    """Nothing in the creator writes inherited_xp — it is read in two display
    spots and always defaults to 0 — so there is no legitimate non-zero
    source for it, and a submitted one must not become roster XP."""
    data = {'age_category': 'ancilla', 'cc_xp_budget': 35, 'inherited_xp': 10}
    assert compute_budget(data) == 35


def test_in_memoriam_budget_comes_from_eras_not_the_age_table():
    """An In-Memoriam ancilla's pool is era-derived rather than the flat 35 —
    but what reaches the Starting XP step is the capped remainder, not the
    whole pool."""
    data = {'age_category': 'ancilla', 'cc_xp_budget': 0,
            'in_memoriam': {'use_standard': False, 'total_xp': 42}}
    assert compute_budget(data) == MAX_BANKED_XP
    # A standard ancilla with the same age category gets the flat table value,
    # which is what makes this path distinguishable at all.
    assert compute_budget({'age_category': 'ancilla'}) == 35


def test_in_memoriam_budget_subtracts_era_spends():
    """EraXpPicker applies era purchases to the sheet before the XP step
    captures its baseline, so compute_spent cannot see them. Without this an
    ancilla who spent all 60 era XP still banked the 5 XP maximum."""
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 60,
                            'era_xp_spends': [{'xp_cost': 40}, {'xp_cost': 20}]}}
    assert era_xp_spent(data) == 60
    assert compute_budget(data) == 0
    assert compute_banked_xp(data) == 0


def test_in_memoriam_partial_era_spend_still_caps():
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 60,
                            'era_xp_spends': [{'xp_cost': 57}]}}
    assert compute_budget(data) == 3
    assert compute_banked_xp(data) == 3


def test_in_memoriam_cap_applies_before_starting_xp_spending():
    """Ordering matters. EraXpPicker caps what carries out of the era step and
    marks the rest wasted, so a 60 XP pool with 40 spent banks 5 and forfeits
    15. Spending 3 more at the Starting XP step must leave 2 — clamping only at
    the end would hand back the forfeited XP and return 5."""
    data = {
        'age_category': 'ancilla',
        'in_memoriam': {'use_standard': False, 'total_xp': 60,
                        'era_xp_spends': [{'xp_cost': 40}]},
        'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 1}],  # 3 XP
    }
    assert compute_budget(data) == 5
    assert compute_spent(data) == 3
    assert compute_banked_xp(data) == 2


def test_in_memoriam_budget_is_capped_even_with_no_era_spending():
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 60,
                            'era_xp_spends': []}}
    assert compute_budget(data) == MAX_BANKED_XP
    assert compute_banked_xp(data) == MAX_BANKED_XP


def test_in_memoriam_small_remainder_is_not_inflated_to_the_cap():
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 60,
                            'era_xp_spends': [{'xp_cost': 58}]}}
    assert compute_budget(data) == 2
    assert compute_banked_xp(data) == 2


def test_budget_never_goes_negative():
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 10,
                            'era_xp_spends': [{'xp_cost': 40}]}}
    assert compute_budget(data) == 0


def test_malformed_era_spends_are_survivable():
    data = {'age_category': 'ancilla',
            'in_memoriam': {'use_standard': False, 'total_xp': 60,
                            'era_xp_spends': 'not-a-list'}}
    assert era_xp_spent(data) == 0
    data['in_memoriam']['era_xp_spends'] = [{'xp_cost': None}, 'junk']
    assert era_xp_spent(data) == 0


def test_standard_ancilla_ignores_in_memoriam_total():
    """use_standard means the era path was not taken — the flat 35 applies."""
    data = {'age_category': 'ancilla', 'cc_xp_budget': 35,
            'in_memoriam': {'use_standard': True, 'total_xp': 99}}
    assert compute_budget(data) == 35


def test_banks_the_remainder_under_the_cap():
    data = {'age_category': 'neonate', 'cc_xp_budget': 15,
            'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 4}]}  # 12
    assert compute_banked_xp(data) == 3


def test_banking_is_capped():
    data = {'age_category': 'ancilla', 'cc_xp_budget': 35}
    assert compute_banked_xp(data) == MAX_BANKED_XP


def test_over_budget_banks_nothing():
    data = {'age_category': 'neonate', 'cc_xp_budget': 15,
            'loresheet_purchases': [{'loresheet_id': 'a', 'dot': 5},
                                    {'loresheet_id': 'b', 'dot': 5}]}  # 30
    assert compute_banked_xp(data) == 0


def test_zero_budget_age_banks_nothing():
    assert compute_banked_xp({'age_category': 'ghoul', 'cc_xp_budget': 0}) == 0


def test_malformed_input_is_not_fatal():
    """character_data is client-authored; junk must yield 0, not an exception."""
    assert compute_banked_xp(None) == 0
    assert compute_banked_xp({}) == 0
    assert compute_banked_xp({'cc_xp_budget': 'fifteen'}) == 0
    assert compute_banked_xp({'loresheet_purchases': 'not-a-list'}) == 0
    # No age_category means no derivable budget, so nothing can be banked —
    # a draft too broken to identify must not yield XP.
    assert compute_banked_xp({'cc_xp_budget': 15,
                              'loresheet_purchases': [{'dot': None}]}) == 0
    assert compute_banked_xp({'age_category': 'neonate',
                              'loresheet_purchases': [{'dot': None}]}) == MAX_BANKED_XP
