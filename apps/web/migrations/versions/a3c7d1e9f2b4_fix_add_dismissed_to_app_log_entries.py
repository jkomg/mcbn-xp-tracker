"""fix: ensure dismissed column exists in app_log_entries

Idempotent fix for a migration drift where d1a8e3f7c2b5 was recorded as applied
in alembic_version but the ALTER TABLE may not have committed on Turso (non-transactional
DDL ordering). Checks via PRAGMA table_info before adding the column.

Revision ID: a3c7d1e9f2b4
Revises: f4c8b2e6a1d9
Create Date: 2026-04-24

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3c7d1e9f2b4'
down_revision = 'f4c8b2e6a1d9'
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info("{table_name}")')).fetchall()
    return any(row[1] == column_name for row in rows)


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND name=:n"),
        {'n': index_name},
    ).fetchone()
    return row is not None


def upgrade():
    if not _column_exists('app_log_entries', 'dismissed'):
        op.add_column(
            'app_log_entries',
            sa.Column('dismissed', sa.Boolean, nullable=False, server_default='0'),
        )
    if not _index_exists('ix_app_log_entries_dismissed'):
        op.create_index('ix_app_log_entries_dismissed', 'app_log_entries', ['dismissed'])


def downgrade():
    if _index_exists('ix_app_log_entries_dismissed'):
        op.drop_index('ix_app_log_entries_dismissed', table_name='app_log_entries')
    if _column_exists('app_log_entries', 'dismissed'):
        op.drop_column('app_log_entries', 'dismissed')
