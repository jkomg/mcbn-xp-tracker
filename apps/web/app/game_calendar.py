"""Static game calendar data for the MCbN chronicle."""

from datetime import date


_RAW = [
    # type, label, start, end, note
    ('downtime', 'Downtime',  date(2025, 11, 30), date(2025, 12,  2), None),
    ('night',    'Night 49',  date(2025, 12,  2), date(2025, 12, 14), None),
    ('night',    'Night 50',  date(2025, 12, 16), date(2025, 12, 28), None),
    ('night',    'Night 51',  date(2025, 12, 30), date(2026,  1, 11), 'New Year\'s'),
    ('night',    'Night 52',  date(2026,  1, 13), date(2026,  1, 25), None),
    ('downtime', 'Downtime',  date(2026,  1, 25), date(2026,  1, 27), None),
    ('night',    'Night 53',  date(2026,  1, 27), date(2026,  2,  8), None),
    ('night',    'Night 54',  date(2026,  2, 10), date(2026,  2, 22), None),
    ('night',    'Night 55',  date(2026,  2, 24), date(2026,  3,  8), None),
    ('night',    'Night 56',  date(2026,  3, 10), date(2026,  3, 22), None),
    ('downtime', 'Downtime',  date(2026,  3, 22), date(2026,  3, 24), None),
    ('night',    'Night 57',  date(2026,  3, 24), date(2026,  4,  5), None),
    ('night',    'Night 58',  date(2026,  4,  7), date(2026,  4, 19), None),
    ('night',    'Night 59',  date(2026,  4, 21), date(2026,  5,  3), None),
    ('night',    'Night 60',  date(2026,  5,  5), date(2026,  5, 17), None),
    ('downtime', 'Downtime',  date(2026,  5, 17), date(2026,  5, 19), None),
    ('night',    'Night 61',  date(2026,  5, 19), date(2026,  5, 31), None),
    ('night',    'Night 62',  date(2026,  6,  2), date(2026,  6, 14), None),
    ('night',    'Night 63',  date(2026,  6, 16), date(2026,  6, 28), None),
    ('night',    'Night 64',  date(2026,  6, 30), date(2026,  7, 12), None),
    ('downtime', 'Downtime',  date(2026,  7, 12), date(2026,  7, 14), None),
    ('night',    'Night 65',  date(2026,  7, 14), date(2026,  7, 26), None),
    ('night',    'Night 66',  date(2026,  7, 28), date(2026,  8,  9), None),
    ('night',    'Night 67',  date(2026,  8, 11), date(2026,  8, 23), None),
    ('night',    'Night 68',  date(2026,  8, 25), date(2026,  9,  6), None),
    ('downtime', 'Downtime',  date(2026,  9,  6), date(2026,  9,  8), None),
    ('night',    'Night 69',  date(2026,  9,  8), date(2026,  9, 20), None),
    ('night',    'Night 70',  date(2026,  9, 22), date(2026, 10,  4), None),
    ('night',    'Night 71',  date(2026, 10,  6), date(2026, 10, 18), None),
    ('night',    'Night 72',  date(2026, 10, 20), date(2026, 11,  1), None),
    ('downtime', 'Downtime',  date(2026, 11,  1), date(2026, 11,  3), None),
    ('night',    'Night 73',  date(2026, 11,  3), date(2026, 11, 15), None),
    ('night',    'Night 74',  date(2026, 11, 17), date(2026, 11, 29), None),
    ('night',    'Night 75',  date(2026, 12,  1), date(2026, 12, 13), None),
    ('night',    'Night 76',  date(2026, 12, 15), date(2026, 12, 27), None),
    ('downtime', 'Downtime',  date(2026, 12, 27), date(2026, 12, 29), None),
    ('night',    'Night 77',  date(2026, 12, 29), date(2027,  1, 10), None),
]


def get_calendar():
    """Return all calendar entries with status computed for today."""
    today = date.today()
    entries = []
    for kind, label, start, end, note in _RAW:
        if end < today:
            status = 'past'
        elif start <= today <= end:
            status = 'current'
        else:
            status = 'upcoming'

        # Days until start (for upcoming entries)
        days_until = (start - today).days if status == 'upcoming' else None
        # Days remaining (for current entries)
        days_left = (end - today).days if status == 'current' else None

        entries.append({
            'type':       kind,
            'label':      label,
            'note':       note,
            'start':      start,
            'end':        end,
            'start_fmt':  start.strftime('%b %-d'),
            'end_fmt':    end.strftime('%b %-d'),
            'status':     status,
            'days_until': days_until,
            'days_left':  days_left,
        })
    return entries
