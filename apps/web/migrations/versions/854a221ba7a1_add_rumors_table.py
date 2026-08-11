"""add rumors table

Revision ID: 854a221ba7a1
Revises: 48c34da82c09
Create Date: 2026-08-11 13:18:13.723997

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '854a221ba7a1'
down_revision = '48c34da82c09'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'rumors' not in existing_tables:
        op.create_table(
            'rumors',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('discovery', sa.String(50), nullable=False),
            sa.Column('rumor_text', sa.Text(), nullable=False),
            sa.Column('location', sa.String(200), nullable=True, default=''),
            sa.Column('point_of_contact', sa.String(300), nullable=True, default=''),
            sa.Column('roll', sa.String(200), nullable=True, default=''),
            sa.Column('kind', sa.String(16), nullable=False, server_default='permanent'),
            sa.Column('ic_night_key', sa.String(32), nullable=True, default=''),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('requester_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('requester_character_name', sa.String(200), nullable=True, default=''),
            sa.Column('cubby_channel_id', sa.String(32), nullable=True),
            sa.Column('cubby_message_id', sa.String(32), nullable=True),
            sa.Column('posted_channel_id', sa.String(32), nullable=True),
            sa.Column('posted_message_id', sa.String(32), nullable=True),
            sa.Column('approved_by_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('approved_by_name', sa.String(100), nullable=True, default=''),
            sa.Column('rejected_by_discord_id', sa.String(30), nullable=True, default=''),
            sa.Column('rejected_by_name', sa.String(100), nullable=True, default=''),
            sa.Column('rejected_reason', sa.Text(), nullable=True, default=''),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
        )
        op.create_index(
            'ix_rumors_status_created', 'rumors', ['status', 'created_at'],
        )


def downgrade():
    op.drop_index('ix_rumors_status_created', table_name='rumors')
    op.drop_table('rumors')
