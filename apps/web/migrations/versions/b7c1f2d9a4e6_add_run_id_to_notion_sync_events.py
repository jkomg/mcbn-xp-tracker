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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = {c['name'] for c in inspector.get_columns('notion_sync_events')}
    if 'run_id' not in existing_cols:
        op.add_column('notion_sync_events', sa.Column('run_id', sa.String(length=64), nullable=False, server_default=''))
    existing_indexes = {idx['name'] for idx in inspector.get_indexes('notion_sync_events')}
    if 'ix_notion_sync_events_run_id' not in existing_indexes:
        op.create_index('ix_notion_sync_events_run_id', 'notion_sync_events', ['run_id'])


def downgrade():
    op.drop_index('ix_notion_sync_events_run_id', table_name='notion_sync_events')
    op.drop_column('notion_sync_events', 'run_id')
