"""add character backgrounds table

Revision ID: 6d2a4f0be9c1
Revises: c9b4e1d8f2a0
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6d2a4f0be9c1'
down_revision = 'c9b4e1d8f2a0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'character_backgrounds',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('character_name', sa.String(length=200), nullable=False),
        sa.Column('background_key', sa.String(length=120), nullable=False),
        sa.Column('background_name', sa.String(length=120), nullable=False),
        sa.Column('dots_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('dots_blanked', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('blanked_at_night_number', sa.Integer(), nullable=True),
        sa.Column('release_night_number', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.String(length=20), nullable=False, server_default=''),
        sa.Column('updated_by', sa.String(length=100), nullable=False, server_default=''),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('character_name', 'background_key', name='uq_character_background_key'),
    )
    op.create_index('ix_character_backgrounds_character', 'character_backgrounds', ['character_name'])
    op.create_index('ix_character_backgrounds_release_night', 'character_backgrounds', ['release_night_number'])


def downgrade():
    op.drop_index('ix_character_backgrounds_release_night', table_name='character_backgrounds')
    op.drop_index('ix_character_backgrounds_character', table_name='character_backgrounds')
    op.drop_table('character_backgrounds')
