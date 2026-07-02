"""Tests for _map_rod_to_cc's age_category mapping.

Regression: RoD sheet imports used to hardcode age_category to 'ancilla'
regardless of the character's actual roster age category.
"""

from app.blueprints.player import _map_rod_to_cc

_MINIMAL_ROD = {'name': 'Test Char', 'clan': 'Toreador', 'attributes': {}}


def test_uses_the_given_age_category():
    for age in ('mortal', 'fledgling', 'neonate', 'ancilla'):
        data = _map_rod_to_cc(_MINIMAL_ROD, age_category=age)
        assert data['age_category'] == age


def test_falls_back_to_ancilla_when_blank():
    data = _map_rod_to_cc(_MINIMAL_ROD, age_category='')
    assert data['age_category'] == 'ancilla'


def test_falls_back_to_ancilla_when_unrecognized():
    data = _map_rod_to_cc(_MINIMAL_ROD, age_category='ghoul')
    assert data['age_category'] == 'ancilla'


def test_default_parameter_is_ancilla_for_backward_compatibility():
    data = _map_rod_to_cc(_MINIMAL_ROD)
    assert data['age_category'] == 'ancilla'
