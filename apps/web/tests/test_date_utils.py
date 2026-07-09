from datetime import date

from app.date_utils import parse_date_added


def test_parses_live_approval_format():
    assert parse_date_added('20260513 20:27:11') == date(2026, 5, 13)


def test_parses_migrated_csv_format():
    assert parse_date_added('2026-02-15') == date(2026, 2, 15)


def test_blank_returns_none():
    assert parse_date_added('') is None


def test_garbage_returns_none():
    assert parse_date_added('not a date') is None


def test_strips_whitespace():
    assert parse_date_added('  2026-02-15  ') == date(2026, 2, 15)
