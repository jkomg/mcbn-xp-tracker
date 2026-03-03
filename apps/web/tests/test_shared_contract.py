from app.models import SPEND_CATEGORIES
from app.xp_rules import XP_COSTS


def test_spend_categories_match_rule_keys():
    assert set(SPEND_CATEGORIES) == set(XP_COSTS.keys())
