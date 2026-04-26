"""Add status column to wiki_pages (replaces published boolean)

Adds a status string column with values: draft, active, upcoming, archived.
Migrates existing data: published=0 → draft, published=1 → active.
The published column is left in place as dead weight (SQLite can't drop columns
easily and it costs nothing to keep).

Revision ID: b5c8d2e1a9f6
Revises: a3c7d1e9f2b4
Create Date: 2026-04-25

"""
from alembic import op
import sqlalchemy as sa


revision = 'b5c8d2e1a9f6'
down_revision = 'a3c7d1e9f2b4'
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
    if not _column_exists('wiki_pages', 'status'):
        op.add_column(
            'wiki_pages',
            sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        )
        # Migrate existing data: unpublished pages become drafts
        op.execute(sa.text(
            "UPDATE wiki_pages SET status = 'draft' WHERE published = 0"
        ))

    if not _index_exists('ix_wiki_pages_status'):
        op.create_index('ix_wiki_pages_status', 'wiki_pages', ['status'])


def downgrade():
    if _index_exists('ix_wiki_pages_status'):
        op.drop_index('ix_wiki_pages_status', table_name='wiki_pages')
    # status column intentionally left — SQLite cannot drop columns cleanly
    # and restoring published semantics from status is straightforward if needed
