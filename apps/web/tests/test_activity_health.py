from app.activity_health import build_health_report, daterange, shift_window


def test_daterange_inclusive():
    assert daterange('2026-06-01', '2026-06-03') == ['2026-06-01', '2026-06-02', '2026-06-03']


def test_daterange_single_day():
    assert daterange('2026-06-01', '2026-06-01') == ['2026-06-01']


def test_shift_window_same_length_immediately_before():
    assert shift_window('2026-06-08', '2026-06-14') == ('2026-06-01', '2026-06-07')


def test_shift_window_single_day():
    assert shift_window('2026-06-08', '2026-06-08') == ('2026-06-07', '2026-06-07')


def _rows(*entries):
    return [
        {'discord_id': did, 'date': date, 'category': cat, 'count': count}
        for did, date, cat, count in entries
    ]


def test_daily_totals_zero_filled_across_full_range():
    rows = _rows(('u1', '2026-06-01', 'ic', 5))
    report = build_health_report(rows, [], [], {}, '2026-06-01', '2026-06-03')
    assert report['days'] == ['2026-06-01', '2026-06-02', '2026-06-03']
    assert report['daily_totals'] == [5, 0, 0]


def test_daily_by_category_breakdown():
    rows = _rows(
        ('u1', '2026-06-01', 'ic', 3),
        ('u1', '2026-06-01', 'ooc', 2),
        ('u2', '2026-06-01', 'cubby', 1),
    )
    report = build_health_report(rows, [], [], {}, '2026-06-01', '2026-06-01')
    assert report['daily_by_category']['ic'] == [3]
    assert report['daily_by_category']['ooc'] == [2]
    assert report['daily_by_category']['cubby'] == [1]
    assert report['daily_by_category']['rolls'] == [0]
    assert report['period_by_category'] == {'ic': 3, 'ooc': 2, 'rolls': 0, 'cubby': 1}
    assert report['period_total'] == 6


def test_unknown_category_and_nonpositive_count_ignored():
    rows = _rows(
        ('u1', '2026-06-01', 'ic', 3),
        ('u1', '2026-06-01', 'bogus', 100),
        ('u1', '2026-06-01', 'ooc', 0),
    )
    report = build_health_report(rows, [], [], {}, '2026-06-01', '2026-06-01')
    assert report['period_total'] == 3


def test_daily_unique_posters_dedupes_within_a_day():
    rows = _rows(
        ('u1', '2026-06-01', 'ic', 3),
        ('u1', '2026-06-01', 'ooc', 1),
        ('u2', '2026-06-01', 'ic', 1),
    )
    report = build_health_report(rows, [], [], {}, '2026-06-01', '2026-06-01')
    assert report['daily_unique_posters'] == [2]
    assert report['unique_posters'] == 2


def test_leaderboard_sorted_descending_and_capped_at_15():
    rows = _rows(*[(f'u{i}', '2026-06-01', 'ic', i) for i in range(1, 20)])
    report = build_health_report(rows, [], [], {}, '2026-06-01', '2026-06-01')
    assert len(report['leaderboard']) == 15
    assert report['leaderboard'][0]['total'] == 19
    assert report['leaderboard'][0]['discord_id'] == 'u19'
    totals = [r['total'] for r in report['leaderboard']]
    assert totals == sorted(totals, reverse=True)


def test_leaderboard_uses_display_name_when_available():
    rows = _rows(('u1', '2026-06-01', 'ic', 1))
    report = build_health_report(rows, [], [], {'u1': 'Alice'}, '2026-06-01', '2026-06-01')
    assert report['leaderboard'][0]['display_name'] == 'Alice'


def test_delta_pct_computed_against_previous_window():
    rows = _rows(('u1', '2026-06-08', 'ic', 20))
    prev_rows = _rows(('u1', '2026-06-01', 'ic', 10))
    report = build_health_report(rows, prev_rows, [], {}, '2026-06-08', '2026-06-08')
    assert report['delta_pct'] == 100


def test_delta_pct_none_when_no_prior_baseline_but_current_activity():
    rows = _rows(('u1', '2026-06-08', 'ic', 20))
    report = build_health_report(rows, [], [], {}, '2026-06-08', '2026-06-08')
    assert report['delta_pct'] is None


def test_delta_pct_zero_when_both_windows_empty():
    report = build_health_report([], [], [], {}, '2026-06-08', '2026-06-08')
    assert report['delta_pct'] == 0


def test_participation_dedupes_by_player_across_multiple_characters():
    active_characters = [
        {'character_name': 'Marcus', 'player_discord': 'p1'},
        {'character_name': "Marcus's Retainer", 'player_discord': 'p1'},
        {'character_name': 'Zara', 'player_discord': 'p2'},
    ]
    rows = _rows(('p1', '2026-06-01', 'ic', 1))
    report = build_health_report(rows, [], active_characters, {}, '2026-06-01', '2026-06-01')

    assert report['active_player_count'] == 2
    assert report['posted_player_count'] == 1
    assert report['participation_pct'] == 50
    assert len(report['not_posting']) == 1
    assert report['not_posting'][0]['discord_id'] == 'p2'
    assert report['not_posting'][0]['characters'] == ['Zara']


def test_participation_zero_active_players_does_not_divide_by_zero():
    report = build_health_report([], [], [], {}, '2026-06-01', '2026-06-01')
    assert report['participation_pct'] == 0
    assert report['active_player_count'] == 0
    assert report['not_posting'] == []


def test_unlinked_characters_excluded_from_participation_but_counted():
    active_characters = [
        {'character_name': 'NoDiscordLinked', 'player_discord': ''},
        {'character_name': 'Zara', 'player_discord': 'p2'},
    ]
    report = build_health_report([], [], active_characters, {}, '2026-06-01', '2026-06-01')
    assert report['active_player_count'] == 1
    assert report['unlinked_character_count'] == 1
    assert report['not_posting'][0]['characters'] == ['Zara']


def test_not_posting_lists_all_characters_for_a_silent_multi_character_player():
    active_characters = [
        {'character_name': 'Beta', 'player_discord': 'p1'},
        {'character_name': 'Alpha', 'player_discord': 'p1'},
    ]
    report = build_health_report([], [], active_characters, {}, '2026-06-01', '2026-06-01')
    assert report['not_posting'][0]['characters'] == ['Alpha', 'Beta']


def test_not_posting_falls_back_to_roster_display_name_when_never_posted():
    """Regression test: a player with zero posts in either window never gets
    a display_names entry (that dict is only populated from activity rows),
    so the not-posting table needs the roster's own player_discord_name as a
    fallback instead of rendering a raw Discord ID."""
    active_characters = [
        {'character_name': 'Zara', 'player_discord': 'p2', 'player_discord_name': 'ZaraPlayer'},
    ]
    report = build_health_report([], [], active_characters, {}, '2026-06-01', '2026-06-01')
    assert report['not_posting'][0]['display_name'] == 'ZaraPlayer'


def test_not_posting_prefers_activity_tracked_name_over_roster_name():
    """A player who posted last period but not this one is in not_posting
    with a real (possibly more current) activity-tracked name — prefer that
    over the roster snapshot when both are available."""
    active_characters = [
        {'character_name': 'Zara', 'player_discord': 'p2', 'player_discord_name': 'OldRosterName'},
    ]
    prev_rows = _rows(('p2', '2026-05-01', 'ic', 1))
    report = build_health_report(
        [], prev_rows, active_characters, {'p2': 'CurrentDisplayName'}, '2026-06-01', '2026-06-01',
    )
    assert report['not_posting'][0]['display_name'] == 'CurrentDisplayName'


def test_not_posting_blank_display_name_when_neither_source_available():
    active_characters = [{'character_name': 'Zara', 'player_discord': 'p2'}]
    report = build_health_report([], [], active_characters, {}, '2026-06-01', '2026-06-01')
    assert report['not_posting'][0]['display_name'] == ''
