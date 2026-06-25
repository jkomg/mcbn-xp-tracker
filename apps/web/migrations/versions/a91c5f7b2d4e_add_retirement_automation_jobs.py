"""add retirement automation jobs

Revision ID: a91c5f7b2d4e
Revises: f2a9b7c3d1e5
Create Date: 2026-06-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'a91c5f7b2d4e'
down_revision = '6b3c8d2f1a4e'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    char_cols = {c['name'] for c in inspector.get_columns('characters')}
    if 'ticket_channel_id' not in char_cols:
        op.add_column('characters', sa.Column('ticket_channel_id', sa.String(length=32), nullable=True))

    if 'retirement_automation_jobs' not in inspector.get_table_names():
        op.create_table(
            'retirement_automation_jobs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('character_name', sa.String(length=200), nullable=False),
            sa.Column('requested_by', sa.String(length=100), nullable=False, server_default=''),
            sa.Column('cubby_channel_id', sa.String(length=32), nullable=True),
            sa.Column('requested_at', sa.DateTime(), nullable=False),
            sa.Column('last_attempt_at', sa.DateTime(), nullable=True),
            sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('last_error', sa.Text(), nullable=True, server_default=''),
            sa.Column('children_source_thread_id', sa.String(length=32), nullable=True),
            sa.Column('children_retired_thread_id', sa.String(length=32), nullable=True),
            sa.Column('cubby_moved_at', sa.DateTime(), nullable=True),
            sa.Column('children_moved_at', sa.DateTime(), nullable=True),
            sa.Column('discord_completed_at', sa.DateTime(), nullable=True),
            sa.Column('wiki_synced_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_retirement_automation_jobs_character_name', 'retirement_automation_jobs', ['character_name'])
        op.create_index('ix_retirement_automation_jobs_requested_at', 'retirement_automation_jobs', ['requested_at'])
        op.create_index('ix_retirement_jobs_discord_pending', 'retirement_automation_jobs', ['discord_completed_at'])
        op.create_index('ix_retirement_jobs_wiki_pending', 'retirement_automation_jobs', ['wiki_synced_at'])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'retirement_automation_jobs' in inspector.get_table_names():
        for index_name in (
            'ix_retirement_jobs_wiki_pending',
            'ix_retirement_jobs_discord_pending',
            'ix_retirement_automation_jobs_requested_at',
            'ix_retirement_automation_jobs_character_name',
        ):
            existing = {idx['name'] for idx in inspector.get_indexes('retirement_automation_jobs')}
            if index_name in existing:
                op.drop_index(index_name, table_name='retirement_automation_jobs')
        op.drop_table('retirement_automation_jobs')

    char_cols = {c['name'] for c in inspector.get_columns('characters')}
    if 'ticket_channel_id' in char_cols:
        op.drop_column('characters', 'ticket_channel_id')
