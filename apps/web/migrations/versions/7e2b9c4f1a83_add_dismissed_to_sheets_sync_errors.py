"""add dismissed column to sheets_sync_errors

Revision ID: 7e2b9c4f1a83
Revises: 235f1a01929d
Create Date: 2026-07-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7e2b9c4f1a83'
down_revision = '235f1a01929d'
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
    if not _column_exists('sheets_sync_errors', 'dismissed'):
        op.add_column(
            'sheets_sync_errors',
            sa.Column('dismissed', sa.Boolean, nullable=False, server_default='0'),
        )
    if not _index_exists('ix_sheets_sync_errors_dismissed'):
        op.create_index('ix_sheets_sync_errors_dismissed', 'sheets_sync_errors', ['dismissed'])


def downgrade():
    op.drop_index('ix_sheets_sync_errors_dismissed', table_name='sheets_sync_errors')
    op.drop_column('sheets_sync_errors', 'dismissed')
