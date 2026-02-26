from app.xp_rules import calculate_xp_cost


def test_advantage_uses_flat_per_dot_cost():
    assert calculate_xp_cost("Advantage (Merit/Background)", 0, 2) == 6
    assert calculate_xp_cost("Advantage (Merit/Background)", 2, 3) == 3


def test_progressive_categories_still_use_progressive_math():
    assert calculate_xp_cost("Skill", 1, 3) == 15
