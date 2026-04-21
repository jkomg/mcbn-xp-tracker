"""add dismissed to app_log_entries

Revision ID: d1a8e3f7c2b5
Revises: 6d2a4f0be9c1
Create Date: 2026-04-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1a8e3f7c2b5'
down_revision = '6d2a4f0be9c1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'app_log_entries',
        sa.Column('dismissed', sa.Boolean, nullable=False, server_default='0'),
    )
    op.create_index('ix_app_log_entries_dismissed', 'app_log_entries', ['dismissed'])


def downgrade():
    op.drop_index('ix_app_log_entries_dismissed', table_name='app_log_entries')
    op.drop_column('app_log_entries', 'dismissed')
