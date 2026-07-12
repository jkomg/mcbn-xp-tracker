"""add scene_requests table

Revision ID: 02950c13950e
Revises: 7e2b9c4f1a83
Create Date: 2026-07-10 14:52:41.930772

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '02950c13950e'
down_revision = '7e2b9c4f1a83'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'scene_requests' not in existing_tables:
        op.create_table(
            'scene_requests',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('requester_character_id', sa.Integer(), sa.ForeignKey('characters.id'), nullable=False),
            sa.Column('spc_name', sa.String(200), nullable=False),
            sa.Column('play_period', sa.String(100), nullable=True, default=''),
            sa.Column('justification', sa.Text(), nullable=True, default=''),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('created_by_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('claimed_by_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('claimed_by_name', sa.String(100), nullable=True, default=''),
            sa.Column('rejected_reason', sa.Text(), nullable=True, default=''),
            sa.Column('queue_channel_id', sa.String(32), nullable=True),
            sa.Column('queue_message_id', sa.String(32), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
        )
        op.create_index(
            'ix_scene_requests_status_created', 'scene_requests', ['status', 'created_at'],
        )
        op.create_index(
            'ix_scene_requests_requester_character_id', 'scene_requests', ['requester_character_id'],
        )


def downgrade():
    op.drop_index('ix_scene_requests_requester_character_id', table_name='scene_requests')
    op.drop_index('ix_scene_requests_status_created', table_name='scene_requests')
    op.drop_table('scene_requests')
