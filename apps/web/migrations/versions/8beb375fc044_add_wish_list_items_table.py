"""Add wish_list_items table

Revision ID: 8beb375fc044
Revises: 02950c13950e
Create Date: 2026-07-16 09:34:19.461284

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8beb375fc044'
down_revision = '02950c13950e'
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    return conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {'t': name},
    ).fetchone() is not None


def upgrade():
    if _table_exists('wish_list_items'):
        return
    op.create_table(
        'wish_list_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('character_name', sa.String(200), nullable=False),
        sa.Column('spend_category', sa.String(100), nullable=False),
        sa.Column('trait_name', sa.String(100), nullable=False),
        sa.Column('power_name', sa.String(100), server_default=''),
        sa.Column('current_dots', sa.Integer, nullable=False, server_default='0'),
        sa.Column('new_dots', sa.Integer, nullable=False, server_default='1'),
        sa.Column('is_in_clan', sa.Boolean, server_default=sa.false()),
        sa.Column('xp_cost', sa.Integer, nullable=False, server_default='0'),
        sa.Column('justification', sa.Text, server_default=''),
        sa.Column('created_at', sa.String(20), nullable=False, server_default=''),
    )
    op.create_index('ix_wish_list_items_character', 'wish_list_items', ['character_name'])


def downgrade():
    op.drop_index('ix_wish_list_items_character', table_name='wish_list_items')
    op.drop_table('wish_list_items')
