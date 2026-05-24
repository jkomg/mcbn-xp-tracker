"""add character drafts table

Revision ID: cc1a2d4f8e9b
Revises: b5c8d2e1a9f6
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cc1a2d4f8e9b'
down_revision = 'b5c8d2e1a9f6'
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    return conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {'t': name},
    ).fetchone() is not None


def upgrade():
    if _table_exists('character_drafts'):
        return
    op.create_table(
        'character_drafts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('player_discord_id', sa.String(length=32), nullable=False),
        sa.Column('character_name', sa.String(length=200), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='draft'),
        sa.Column('is_spc', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('ticket_channel_id', sa.String(length=32), nullable=True),
        sa.Column('character_data', sa.Text(), nullable=True),
        sa.Column('roster_character_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(['roster_character_id'], ['characters.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_character_drafts_player', 'character_drafts', ['player_discord_id'])
    op.create_index('ix_character_drafts_status', 'character_drafts', ['status'])


def downgrade():
    op.drop_index('ix_character_drafts_status', table_name='character_drafts')
    op.drop_index('ix_character_drafts_player', table_name='character_drafts')
    op.drop_table('character_drafts')
