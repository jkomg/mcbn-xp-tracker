"""add app_log_entries table

Revision ID: f3a7b91e45c2
Revises: e5a2f8b31c9d
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a7b91e45c2'
down_revision = 'e5a2f8b31c9d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'app_log_entries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('ts', sa.String(30), nullable=False),
        sa.Column('source', sa.String(10), nullable=False),
        sa.Column('level', sa.String(10), nullable=False),
        sa.Column('event', sa.String(200), nullable=False, server_default=''),
        sa.Column('message', sa.Text, server_default=''),
        sa.Column('details', sa.Text, server_default=''),
        sa.Column('created_at', sa.DateTime, nullable=False),
    )
    op.create_index('ix_app_log_entries_created_at', 'app_log_entries', ['created_at'])


def downgrade():
    op.drop_index('ix_app_log_entries_created_at', table_name='app_log_entries')
    op.drop_table('app_log_entries')
