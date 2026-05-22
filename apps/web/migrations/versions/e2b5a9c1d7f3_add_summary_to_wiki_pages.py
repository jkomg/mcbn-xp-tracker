"""add summary to wiki_pages

Revision ID: e2b5a9c1d7f3
Revises: d1a8e3f7c2b5
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e2b5a9c1d7f3'
down_revision = 'd1a8e3f7c2b5'
branch_labels = None
depends_on = None


def _column_exists(table, col):
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info("{table}")')).fetchall()
    return any(row[1] == col for row in rows)


def upgrade():
    if not _column_exists('wiki_pages', 'summary'):
        op.add_column(
            'wiki_pages',
            sa.Column('summary', sa.String(300), nullable=True, server_default=''),
        )


def downgrade():
    op.drop_column('wiki_pages', 'summary')
