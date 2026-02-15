#!/usr/bin/env python3
"""One-time migration script: Import data.csv into the Google Sheets Roster tab.

Usage:
    python migrations/migrate_csv_to_sheets.py

Reads data.csv from the original MCbN project directory and populates the
Roster tab in the new Google Sheet. Also sets up all required tabs/headers
if they don't exist yet.

Run this ONCE after creating the Google Sheet and service account.
"""

import csv
import os
import sys
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.sheets import SheetsClient


# Path to the original data.csv
CSV_PATH = (
    '/Users/jasonkennedy/Library/Mobile Documents/'
    'com~apple~CloudDocs/RPGs/World of Darkness/MCbN/MCBN/data.csv'
)


def normalize_active(value: str) -> str:
    """Normalize active field to TRUE/FALSE."""
    return 'TRUE' if str(value).strip().lower() in ('yes', 'true', '1') else 'FALSE'


def normalize_age(value: str) -> str:
    """Normalize age category capitalization."""
    mapping = {
        'neonate': 'Neonate',
        'ancilla': 'Ancilla',
        'ancila': 'Ancilla',  # Handle typo
        'childer': 'Childer',
        'fledgling': 'Fledgling',
        'elder': 'Elder',
    }
    return mapping.get(str(value).strip().lower(), str(value).strip())


def normalize_sect(value: str) -> str:
    """Normalize sect names."""
    mapping = {
        'camarilla': 'Camarilla',
        'anarch': 'Anarch',
        'hecata': 'Hecata',
        'na': 'NA',
        '': 'NA',
    }
    return mapping.get(str(value).strip().lower(), str(value).strip())


def parse_int(value, default: int = 0) -> int:
    """Parse integer from CSV value."""
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return default


def main():
    print('MCbN Data Migration: data.csv → Google Sheets Roster')
    print('=' * 55)

    # Validate CSV exists
    if not os.path.exists(CSV_PATH):
        print(f'ERROR: CSV file not found at:\n  {CSV_PATH}')
        sys.exit(1)

    # Initialize sheets client
    creds_file = os.environ.get('GOOGLE_CREDENTIALS_FILE',
                                'credentials/service-account.json')
    sheet_id = os.environ.get('SPREADSHEET_ID', '')

    if not sheet_id:
        print('ERROR: SPREADSHEET_ID not set in .env')
        sys.exit(1)

    print(f'Connecting to Google Sheets ({sheet_id[:20]}...)...')
    client = SheetsClient(creds_file, sheet_id)

    # Set up tabs and headers
    print('Setting up sheet tabs and headers...')
    client.setup_sheets()
    print('  Tabs created/verified.')

    # Read CSV
    print(f'\nReading {CSV_PATH}...')
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get('Name', '').strip()
            if name:
                rows.append(row)

    print(f'  Found {len(rows)} named characters.')

    # Process and migrate
    today = datetime.now().strftime('%Y-%m-%d')
    migrated = 0
    skipped = 0
    warnings = []

    # Pre-load existing characters ONCE to avoid per-row API calls
    print('Loading existing roster from sheet...')
    existing_names = set()
    try:
        existing_chars = client.get_all_characters()
        existing_names = {c.character_name.lower() for c in existing_chars}
        print(f'  Found {len(existing_names)} existing characters.')
    except Exception as e:
        print(f'  No existing characters (or empty sheet): {e}')

    for row in rows:
        name = row.get('Name', '').strip()
        clan = row.get('Clan', '').strip()
        age = normalize_age(row.get('Age', ''))
        sect = normalize_sect(row.get('Sect', ''))
        active = normalize_active(row.get('Active', ''))

        # Use "Earned + CC XP" as the creation/audit baseline
        earned_cc = parse_int(row.get('Earned + CC XP', 0))
        spends = parse_int(row.get('Spends', 0))
        available = parse_int(row.get('Available XP', 0))
        enemy = row.get('Enemy/', '').strip()

        # Build notes with historical data for reconciliation
        notes_parts = []
        if spends > 0:
            notes_parts.append(f'Migrated historical spends: {spends}')
        if available < 0:
            notes_parts.append(f'WARNING: Negative available XP at migration: {available}')
            warnings.append(f'  {name}: available_xp={available}, earned={earned_cc}, spends={spends}')

        period_xp = parse_int(row.get('Period XP', 0))
        if period_xp > 0:
            notes_parts.append(f'Period XP at migration: {period_xp}')

        notes = '; '.join(notes_parts)

        # Check for existing character using pre-loaded set (no API call)
        if name.lower() in existing_names:
            print(f'  SKIP (already exists): {name}')
            skipped += 1
            continue

        # Add to roster
        from app.models import Character
        char = Character(
            character_name=name,
            player_discord='',
            clan=clan,
            age_category=age,
            sect=sect,
            active=(active == 'TRUE'),
            creation_xp=earned_cc,
            enemy=enemy,
            date_added=today,
            notes=notes,
        )

        client.add_character(char)
        status = 'active' if active == 'TRUE' else 'inactive'
        print(f'  Migrated: {name} ({clan}, {sect}, {status}, {earned_cc} XP)')
        migrated += 1

    # Summary
    print(f'\n{"=" * 55}')
    print(f'Migration complete!')
    print(f'  Migrated: {migrated}')
    print(f'  Skipped (already exist): {skipped}')
    print(f'  Total in CSV: {len(rows)}')

    if warnings:
        print(f'\nWARNINGS — Characters with negative available XP:')
        for w in warnings:
            print(w)
        print('  These need staff review to reconcile.')

    # Log the migration in audit
    client.log_action(
        staff_user='Migration Script',
        action_type='data_migration',
        target='All Characters',
        details=f'Migrated {migrated} characters from data.csv. {len(warnings)} with negative XP.',
    )

    print('\nDone. Check the Google Sheet to verify.')


if __name__ == '__main__':
    main()
