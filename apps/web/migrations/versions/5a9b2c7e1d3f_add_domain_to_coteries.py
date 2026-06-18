"""add chasse/lien/portillon domain columns to coteries

Revision ID: 5a9b2c7e1d3f
Revises: 4f2a1b8e6c9d
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = '5a9b2c7e1d3f'
down_revision = '4f2a1b8e6c9d'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('coteries')]
    if 'chasse' not in columns:
        op.add_column('coteries', sa.Column('chasse', sa.Integer(), nullable=False, server_default='0'))
    if 'lien' not in columns:
        op.add_column('coteries', sa.Column('lien', sa.Integer(), nullable=False, server_default='0'))
    if 'portillon' not in columns:
        op.add_column('coteries', sa.Column('portillon', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('coteries', 'portillon')
    op.drop_column('coteries', 'lien')
    op.drop_column('coteries', 'chasse')
