"""Tests for CSV injection sanitisation and spend request validation."""

import pytest
from app.blueprints.player import _csv_safe
from app.xp_rules import validate_spend_request


class TestCsvSafe:
    def test_normal_string_unchanged(self):
        assert _csv_safe('Alice') == 'Alice'

    def test_empty_string_unchanged(self):
        assert _csv_safe('') == ''

    def test_equals_sign_prefixed(self):
        assert _csv_safe('=SUM(A1)') == "'=SUM(A1)"

    def test_plus_sign_prefixed(self):
        assert _csv_safe('+1') == "'+1"

    def test_minus_sign_prefixed(self):
        assert _csv_safe('-1') == "'-1"

    def test_at_sign_prefixed(self):
        assert _csv_safe('@foo') == "'@foo"

    def test_tab_prefixed(self):
        assert _csv_safe('\tcmd') == "'\tcmd"

    def test_carriage_return_prefixed(self):
        assert _csv_safe('\rcmd') == "'\rcmd"

    def test_numeric_input_coerced_to_string(self):
        assert _csv_safe(42) == '42'

    def test_numeric_string_unchanged(self):
        assert _csv_safe('5') == '5'

    def test_safe_leading_char_unchanged(self):
        assert _csv_safe('Night 77') == 'Night 77'


class TestValidateSpendRequest:
    def test_valid_matching_cost(self):
        # Skill 1→2 costs 2×3=6 XP
        result = validate_spend_request('Skill', 1, 2, 6)
        assert result['valid'] is True
        assert result['matches'] is True
        assert result['correct_cost'] == 6

    def test_valid_mismatched_cost(self):
        result = validate_spend_request('Skill', 1, 2, 99)
        assert result['valid'] is True
        assert result['matches'] is False
        assert result['correct_cost'] == 6

    def test_invalid_category_returns_not_valid(self):
        result = validate_spend_request('NotARealCategory', 0, 1, 0)
        assert result['valid'] is False
        assert result['correct_cost'] == 0
        assert 'Unknown' in result['message']

    def test_invalid_dot_range_returns_not_valid(self):
        result = validate_spend_request('Skill', 3, 1, 0)
        assert result['valid'] is False

    def test_description_key_present(self):
        result = validate_spend_request('Attribute', 2, 3, 20)
        assert 'description' in result
