"""add notion_sync_events table

Revision ID: a6e9d2c7f4b1
Revises: f3a7b91e45c2
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a6e9d2c7f4b1'
down_revision = 'f3a7b91e45c2'
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    return conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {'t': name},
    ).fetchone() is not None


def upgrade():
    if _table_exists('notion_sync_events'):
        return
    op.create_table(
        'notion_sync_events',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('ts', sa.String(30), nullable=False),
        sa.Column('source', sa.String(16), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('error', sa.Text, server_default=''),
        sa.Column('created_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_notion_sync_events_created_at', 'notion_sync_events', ['created_at'])


def downgrade():
    op.drop_index('ix_notion_sync_events_created_at', table_name='notion_sync_events')
    op.drop_table('notion_sync_events')
