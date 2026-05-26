"""add revision_notes to character_drafts

Revision ID: f2a9b7c3d1e5
Revises: cc1a2d4f8e9b
Create Date: 2026-05-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a9b7c3d1e5'
down_revision = 'cc1a2d4f8e9b'
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info("{table_name}")')).fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade():
    if not _column_exists('character_drafts', 'revision_notes'):
        op.add_column(
            'character_drafts',
            sa.Column('revision_notes', sa.Text(), nullable=True),
        )


def downgrade():
    op.drop_column('character_drafts', 'revision_notes')
