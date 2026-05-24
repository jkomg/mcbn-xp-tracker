"""add dismissed to app_log_entries

Revision ID: d1a8e3f7c2b5
Revises: 6d2a4f0be9c1
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1a8e3f7c2b5'
down_revision = '6d2a4f0be9c1'
branch_labels = None
depends_on = None


def _column_exists(table, col):
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info("{table}")')).fetchall()
    return any(row[1] == col for row in rows)


def _index_exists(name):
    conn = op.get_bind()
    row = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND name=:n"),
        {'n': name},
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
    op.drop_index('ix_app_log_entries_dismissed', table_name='app_log_entries')
    op.drop_column('app_log_entries', 'dismissed')
