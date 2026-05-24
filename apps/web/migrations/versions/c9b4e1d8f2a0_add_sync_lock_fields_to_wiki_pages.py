"""add sync lock fields to wiki_pages

Revision ID: c9b4e1d8f2a0
Revises: b7c1f2d9a4e6
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9b4e1d8f2a0'
down_revision = 'b7c1f2d9a4e6'
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
    if not _column_exists('wiki_pages', 'sync_locked'):
        op.add_column(
            'wiki_pages',
            sa.Column('sync_locked', sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if not _column_exists('wiki_pages', 'sync_locked_by'):
        op.add_column(
            'wiki_pages',
            sa.Column('sync_locked_by', sa.String(length=100), nullable=False, server_default=''),
        )
    if not _column_exists('wiki_pages', 'sync_locked_at'):
        op.add_column(
            'wiki_pages',
            sa.Column('sync_locked_at', sa.DateTime(), nullable=True),
        )
    if not _index_exists('ix_wiki_pages_sync_locked'):
        op.create_index('ix_wiki_pages_sync_locked', 'wiki_pages', ['sync_locked'])


def downgrade():
    op.drop_index('ix_wiki_pages_sync_locked', table_name='wiki_pages')
    op.drop_column('wiki_pages', 'sync_locked_at')
    op.drop_column('wiki_pages', 'sync_locked_by')
    op.drop_column('wiki_pages', 'sync_locked')
