#!/usr/bin/env python3
"""One-time migration script: Google Sheets → SQLite/Turso DB.

Run from apps/web/ directory:
    python scripts/migrate_sheets_to_db.py

Reads all data from the configured Google Sheets and writes to the DB.
Skips records that already exist (safe to re-run).
"""

import sys
import os

# Ensure we can import the app package from apps/web/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.db import db, DbCharacter, DbPlayPeriod, DbXPClaim, DbSpendRequest, DbLedgerEntry, DbAuditLog
from sqlalchemy import func


def _migrate_characters(app, sheets_client):
    with app.app_context():
        chars = sheets_client.get_all_characters()
        added = skipped = 0
        for char in chars:
            existing = DbCharacter.query.filter(
                func.lower(DbCharacter.character_name) == char.character_name.lower()
            ).first()
            if existing:
                skipped += 1
                continue
            row = DbCharacter(
                character_name=char.character_name,
                player_discord=char.player_discord or '',
                player_discord_name=char.player_discord_name or '',
                clan=char.clan or '',
                age_category=char.age_category or '',
                sect=char.sect or '',
                active=char.active,
                creation_xp=char.creation_xp or 0,
                enemy=char.enemy or '',
                date_added=char.date_added or '',
                notes=char.notes or '',
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  Characters: {added} added, {skipped} skipped')
        return added


def _migrate_periods(app, sheets_client):
    with app.app_context():
        periods = sheets_client.get_all_periods()
        added = skipped = 0
        for period in periods:
            existing = DbPlayPeriod.query.filter_by(period_label=period.period_label).first()
            if existing:
                skipped += 1
                continue
            row = DbPlayPeriod(
                period_label=period.period_label,
                night_number=period.night_number,
                start_date=period.start_date or '',
                end_date=period.end_date or '',
                session_number=period.session_number,
                submissions_open=period.submissions_open,
                active=period.active,
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  Play periods: {added} added, {skipped} skipped')
        return added


def _migrate_claims(app, sheets_client):
    with app.app_context():
        claims = sheets_client.get_all_claims()
        added = skipped = 0
        for claim in claims:
            # Use character_name + play_period + timestamp as dedup key
            existing = DbXPClaim.query.filter(
                func.lower(DbXPClaim.character_name) == claim.character_name.lower(),
                DbXPClaim.play_period == claim.play_period,
                DbXPClaim.timestamp == claim.timestamp,
            ).first()
            if existing:
                skipped += 1
                continue
            row = DbXPClaim(
                timestamp=claim.timestamp or '',
                character_name=claim.character_name or '',
                play_period=claim.play_period or '',
                posted_once=claim.posted_once,
                posted_once_link=claim.posted_once_link or '',
                hunting_awakening=claim.hunting_awakening,
                hunting_awakening_link=claim.hunting_awakening_link or '',
                scene_with_another=claim.scene_with_another,
                scene_with_another_link=claim.scene_with_another_link or '',
                conflict=claim.conflict,
                conflict_link=claim.conflict_link or '',
                combat=claim.combat,
                combat_link=claim.combat_link or '',
                unmitigated_stain=claim.unmitigated_stain,
                unmitigated_stain_link=claim.unmitigated_stain_link or '',
                wildcard=claim.wildcard,
                wildcard_link=claim.wildcard_link or '',
                wildcard_reason=claim.wildcard_reason or '',
                wildcard_amount=claim.wildcard_amount or 0,
                xp_claimed=claim.xp_claimed or 0,
                status=claim.status or 'Pending',
                approved_xp=claim.approved_xp or 0,
                reviewed_by=claim.reviewed_by or '',
                review_date=claim.review_date or '',
                st_notes=claim.st_notes or '',
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  XP claims: {added} added, {skipped} skipped')
        return added


def _migrate_spends(app, sheets_client):
    with app.app_context():
        spends = sheets_client.get_all_spends()
        added = skipped = 0
        for spend in spends:
            existing = DbSpendRequest.query.filter(
                func.lower(DbSpendRequest.character_name) == spend.character_name.lower(),
                DbSpendRequest.timestamp == spend.timestamp,
                DbSpendRequest.trait_name == spend.trait_name,
            ).first()
            if existing:
                skipped += 1
                continue
            row = DbSpendRequest(
                timestamp=spend.timestamp or '',
                character_name=spend.character_name or '',
                spend_category=spend.spend_category or '',
                trait_name=spend.trait_name or '',
                current_dots=spend.current_dots or 0,
                new_dots=spend.new_dots or 0,
                xp_cost=spend.xp_cost or 0,
                is_in_clan=spend.is_in_clan,
                justification=spend.justification or '',
                status=spend.status or 'Pending',
                verified_cost=spend.verified_cost or 0,
                reviewed_by=spend.reviewed_by or '',
                review_date=spend.review_date or '',
                st_notes=spend.st_notes or '',
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  Spend requests: {added} added, {skipped} skipped')
        return added


def _migrate_ledger(app, sheets_client):
    with app.app_context():
        # Read all rows directly — not per-character — so entries for deleted
        # or renamed characters are not silently dropped.
        all_entries = sheets_client.get_all_ledger_entries()
        added = skipped = 0
        for entry in all_entries:
            existing = DbLedgerEntry.query.filter(
                func.lower(DbLedgerEntry.character_name) == entry.character_name.lower(),
                DbLedgerEntry.timestamp == entry.timestamp,
                DbLedgerEntry.date == entry.date,
                DbLedgerEntry.reason == entry.reason,
            ).first()
            if existing:
                skipped += 1
                continue
            row = DbLedgerEntry(
                character_name=entry.character_name or '',
                date=entry.date or '',
                awarded=entry.awarded or 0,
                spent=entry.spent or 0,
                reason=entry.reason or '',
                entered_by=entry.entered_by or '',
                timestamp=entry.timestamp or '',
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  Ledger entries: {added} added, {skipped} skipped')
        return added


def _migrate_audit_log(app, sheets_client):
    with app.app_context():
        entries = sheets_client.get_audit_log(limit=10000)
        added = skipped = 0
        for entry in entries:
            existing = DbAuditLog.query.filter(
                DbAuditLog.timestamp == entry.timestamp,
                DbAuditLog.staff_user == entry.staff_user,
                DbAuditLog.action_type == entry.action_type,
                DbAuditLog.target_character == entry.target_character,
            ).first()
            if existing:
                skipped += 1
                continue
            row = DbAuditLog(
                timestamp=entry.timestamp or '',
                staff_user=entry.staff_user or '',
                action_type=entry.action_type or '',
                target_character=entry.target_character or '',
                details=entry.details or '',
            )
            db.session.add(row)
            added += 1
        db.session.commit()
        print(f'  Audit log entries: {added} added, {skipped} skipped')
        return added


def main():
    print('MCbN XP Tracker — Sheets → DB Migration')
    print('=' * 50)

    app = create_app()

    # Import here after app creation so app context is available
    from app import sheets_client

    if sheets_client is None:
        print('ERROR: Google Sheets client is not configured.')
        print('Make sure SPREADSHEET_ID and credentials are set in .env')
        sys.exit(1)

    with app.app_context():
        print('Creating DB tables...')
        db.create_all()
        print('Tables ready.')

    print('\nMigrating data from Google Sheets...')

    _migrate_characters(app, sheets_client)
    _migrate_periods(app, sheets_client)
    _migrate_claims(app, sheets_client)
    _migrate_spends(app, sheets_client)
    _migrate_ledger(app, sheets_client)
    _migrate_audit_log(app, sheets_client)

    print('\nMigration complete.')

    # Print final counts
    with app.app_context():
        print('\nFinal DB row counts:')
        print(f'  characters:     {DbCharacter.query.count()}')
        print(f'  play_periods:   {DbPlayPeriod.query.count()}')
        print(f'  xp_claims:      {DbXPClaim.query.count()}')
        print(f'  spend_requests: {DbSpendRequest.query.count()}')
        print(f'  ledger_entries: {DbLedgerEntry.query.count()}')
        print(f'  audit_log:      {DbAuditLog.query.count()}')


if __name__ == '__main__':
    main()
