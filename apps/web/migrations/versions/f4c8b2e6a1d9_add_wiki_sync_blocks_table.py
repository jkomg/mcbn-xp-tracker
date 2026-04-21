"""add wiki_sync_blocks table

Revision ID: f4c8b2e6a1d9
Revises: e2b5a9c1d7f3
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4c8b2e6a1d9'
down_revision = 'e2b5a9c1d7f3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wiki_sync_blocks',
        sa.Column('slug', sa.String(200), primary_key=True),
        sa.Column('blocked_by', sa.String(100), nullable=False, server_default=''),
        sa.Column('blocked_at', sa.DateTime, nullable=False),
    )


def downgrade():
    op.drop_table('wiki_sync_blocks')
