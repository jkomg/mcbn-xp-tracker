"""add creation_state, creation_notes to coteries; role to coterie_members

Revision ID: 6b3c8d2f1a4e
Revises: 5a9b2c7e1d3f
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = '6b3c8d2f1a4e'
down_revision = '5a9b2c7e1d3f'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa_inspect(bind)

    coterie_cols = [c['name'] for c in inspector.get_columns('coteries')]
    if 'creation_state' not in coterie_cols:
        op.add_column('coteries', sa.Column('creation_state', sa.String(20), nullable=True))
    if 'creation_notes' not in coterie_cols:
        op.add_column('coteries', sa.Column('creation_notes', sa.Text(), nullable=True))

    member_cols = [c['name'] for c in inspector.get_columns('coterie_members')]
    if 'role' not in member_cols:
        op.add_column('coterie_members', sa.Column('role', sa.String(20), nullable=False, server_default='member'))


def downgrade():
    op.drop_column('coteries', 'creation_notes')
    op.drop_column('coteries', 'creation_state')
    op.drop_column('coterie_members', 'role')
