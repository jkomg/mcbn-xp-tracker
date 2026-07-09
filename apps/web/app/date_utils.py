"""Shared date parsing for DbCharacter.date_added, which has two formats in
the wild: 'YYYYMMDD HH:MM:SS' from every live approval (db_service.py's
_now_str() fallback in add_character), and 'YYYY-MM-DD' from the one-time
CSV migration (migrate_csv_to_sheets.py) that predates the live approval
flow. Never string-compare date_added directly against a '%Y-%m-%d' cutoff
— the two formats don't sort consistently against each other (confirmed:
a same-year 'YYYYMMDD...' string always compares greater than a
'YYYY-MM-DD' string at the first '-', regardless of the actual date),
which silently breaks anything that assumes correct ordering, including
the ancilla eligibility check in character_creator.py.
"""

from datetime import date, datetime


def parse_date_added(raw: str) -> date | None:
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ('%Y%m%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None
