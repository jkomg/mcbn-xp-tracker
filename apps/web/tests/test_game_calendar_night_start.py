"""`night_has_started` is the calendar's answer to "has this night opened yet",
as distinct from DbPlayPeriod.submissions_open, which is a staff flag that runs
ahead of the calendar. Blank release depends on the former.

Every case injects `today` so these stay deterministic as real time passes.
"""

from datetime import date

from app.game_calendar import night_has_started, night_start_date


def test_night_start_date_comes_from_the_calendar():
    assert night_start_date(49) == date(2025, 12, 2)
    assert night_start_date(69) == date(2026, 9, 8)
    assert night_start_date(77) == date(2026, 12, 29)


def test_a_night_the_calendar_does_not_list_has_no_start_date():
    assert night_start_date(101) is None


def test_a_night_whose_start_has_passed_has_started():
    assert night_has_started(69, today=date(2026, 9, 12)) is True


def test_a_night_starting_today_has_started():
    """A night opens on its start date — the same window get_calendar() reports
    as 'current'."""
    assert night_has_started(69, today=date(2026, 9, 8)) is True


def test_a_night_starting_tomorrow_has_not_started():
    assert night_has_started(69, today=date(2026, 9, 7)) is False


def test_the_early_release_case_from_issue_431():
    """Night 69 opens 9/8. On 9/4 its period was already open for submissions,
    which is why 3 dots of Mawla were returned four days early."""
    assert night_has_started(69, today=date(2026, 9, 4)) is False


def test_an_unknown_night_is_neither_started_nor_not_started():
    """None, not False, so a caller can tell "not yet" from "no idea" — the
    release path holds an unknown night rather than dropping or releasing it."""
    assert night_has_started(101, today=date(2026, 9, 12)) is None
    assert night_has_started(9999, today=date(2030, 1, 1)) is None


def test_beyond_the_end_of_the_calendar_is_unknown_not_started():
    """The calendar ends at Night 77 (2027-01-10). Nights past it are unknown
    even on a date long after, which is the safe direction: held, and visible to
    staff, rather than silently released."""
    assert night_has_started(78, today=date(2027, 6, 1)) is None
