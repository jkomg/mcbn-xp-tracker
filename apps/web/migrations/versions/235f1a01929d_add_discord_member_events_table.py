"""add discord_member_events table

Revision ID: 235f1a01929d
Revises: a3f7c92e6b1d
Create Date: 2026-07-07

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '235f1a01929d'
down_revision = 'a3f7c92e6b1d'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'discord_member_events' not in existing_tables:
        op.create_table(
            'discord_member_events',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('discord_id', sa.String(30), nullable=False),
            sa.Column('event_type', sa.String(20), nullable=False),
            sa.Column('role', sa.String(20), nullable=False, server_default=''),
            sa.Column('date', sa.String(10), nullable=False),
            sa.UniqueConstraint('discord_id', 'event_type', 'role', 'date', name='uq_discord_member_event'),
        )
        op.create_index('ix_discord_member_events_discord_id', 'discord_member_events', ['discord_id'])


def downgrade():
    op.drop_index('ix_discord_member_events_discord_id', table_name='discord_member_events')
    op.drop_table('discord_member_events')
