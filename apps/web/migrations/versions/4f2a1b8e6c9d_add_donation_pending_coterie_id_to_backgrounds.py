"""add donation_pending_coterie_id to character_backgrounds

Revision ID: 4f2a1b8e6c9d
Revises: 2b8f3c1a9e4d
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = '4f2a1b8e6c9d'
down_revision = '2b8f3c1a9e4d'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('character_backgrounds')]
    if 'donation_pending_coterie_id' not in columns:
        op.add_column('character_backgrounds',
            sa.Column('donation_pending_coterie_id', sa.Integer(),
                      sa.ForeignKey('coteries.id'), nullable=True, index=True))


def downgrade():
    op.drop_column('character_backgrounds', 'donation_pending_coterie_id')
