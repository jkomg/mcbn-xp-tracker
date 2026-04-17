"""add run_id to notion_sync_events

Revision ID: b7c1f2d9a4e6
Revises: a6e9d2c7f4b1
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7c1f2d9a4e6'
down_revision = 'a6e9d2c7f4b1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('notion_sync_events', sa.Column('run_id', sa.String(length=64), nullable=False, server_default=''))
    op.create_index('ix_notion_sync_events_run_id', 'notion_sync_events', ['run_id'])


def downgrade():
    op.drop_index('ix_notion_sync_events_run_id', table_name='notion_sync_events')
    op.drop_column('notion_sync_events', 'run_id')
