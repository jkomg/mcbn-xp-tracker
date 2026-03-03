"""Vampire: The Masquerade V5 XP cost calculations.

Covers core book + all supplements (Players Guide, Cults of the Blood Gods,
Chicago by Night, etc.). All spend requests are validated against these rules.
"""
from .shared_contract import load_json


# XP cost functions: takes (current_dots, new_dots) and returns total XP cost.
# Most categories are progressive (sum per dot step). Some are flat-per-dot.

def _cost_per_dot(multiplier: int, current: int, new: int) -> int:
    """Calculate total XP for buying from current to new dots at a given multiplier."""
    if new <= current:
        raise ValueError(f'New dots ({new}) must be greater than current ({current})')
    if current < 0 or new > 10:
        raise ValueError('Dot values must be between 0 and 10')
    return sum(dot * multiplier for dot in range(current + 1, new + 1))


def _cost_flat_per_dot(per_dot: int, current: int, new: int) -> int:
    """Calculate total XP for buying dot increases at a fixed per-dot cost."""
    if new <= current:
        raise ValueError(f'New dots ({new}) must be greater than current ({current})')
    if current < 0 or new > 10:
        raise ValueError('Dot values must be between 0 and 10')
    return (new - current) * per_dot


# ── Cost Tables ──────────────────────────────────────────────────────────────
XP_COSTS = load_json('packages/rules/xp_costs.json')


def calculate_xp_cost(category: str, current_dots: int, new_dots: int) -> int:
    """Calculate the correct XP cost for a given purchase.

    Args:
        category: One of the keys in XP_COSTS.
        current_dots: Current dot rating.
        new_dots: Desired new dot rating.

    Returns:
        Total XP cost for the purchase.

    Raises:
        ValueError: If category is unknown or dot values are invalid.
    """
    if category not in XP_COSTS:
        raise ValueError(f'Unknown spend category: {category}')

    rules = XP_COSTS[category]

    if current_dots < rules.get('min_dots', 0):
        raise ValueError(
            f'{category}: current dots ({current_dots}) below minimum '
            f'({rules["min_dots"]})'
        )
    if new_dots > rules.get('max_dots', 5):
        raise ValueError(
            f'{category}: new dots ({new_dots}) above maximum '
            f'({rules["max_dots"]})'
        )

    # Flat cost categories (e.g., New Skill is always 3 XP for 0→1)
    if 'flat_cost' in rules:
        if current_dots != 0 or new_dots != 1:
            raise ValueError(
                f'{category}: must be 0 → 1 (got {current_dots} → {new_dots})'
            )
        return rules['flat_cost']

    # Level-based costs (Rituals, Alchemy) — cost is just level × multiplier
    # These represent learning a single ritual/formula at a specific level,
    # not a progressive dot purchase.
    if 'level_multiplier' in rules:
        if new_dots < 1:
            raise ValueError(f'{category}: new dots must be at least 1')
        # For rituals: "new_dots" represents the ritual level being learned
        return new_dots * rules['level_multiplier']

    # Flat-per-dot costs (e.g., Advantage/Backgrounds)
    if 'flat_per_dot' in rules:
        return _cost_flat_per_dot(rules['flat_per_dot'], current_dots, new_dots)

    # Standard progressive costs
    return _cost_per_dot(rules['multiplier'], current_dots, new_dots)


def validate_spend_request(
    category: str,
    current_dots: int,
    new_dots: int,
    player_cost: int,
) -> dict:
    """Validate a spend request and compare player-submitted cost to actual cost.

    Returns:
        dict with keys:
            - valid (bool): Whether the request is structurally valid
            - correct_cost (int): System-calculated XP cost
            - matches (bool): Whether player_cost matches correct_cost
            - message (str): Human-readable status
            - description (str): Cost formula description
    """
    try:
        correct_cost = calculate_xp_cost(category, current_dots, new_dots)
    except ValueError as e:
        return {
            'valid': False,
            'correct_cost': 0,
            'matches': False,
            'message': str(e),
            'description': '',
        }

    matches = player_cost == correct_cost
    rules = XP_COSTS.get(category, {})

    if matches:
        message = f'Cost verified: {correct_cost} XP'
    else:
        message = (
            f'Cost mismatch: player submitted {player_cost} XP, '
            f'correct cost is {correct_cost} XP'
        )

    return {
        'valid': True,
        'correct_cost': correct_cost,
        'matches': matches,
        'message': message,
        'description': rules.get('description', ''),
    }
