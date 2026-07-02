"""add dedupe_key to app_log_entries

Revision ID: b2d6e91a4c73
Revises: a91c5f7b2d4e
Create Date: 2026-07-02

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'b2d6e91a4c73'
down_revision = 'a91c5f7b2d4e'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('app_log_entries')}
    if 'dedupe_key' not in cols:
        op.add_column('app_log_entries', sa.Column('dedupe_key', sa.String(length=250), nullable=False, server_default=''))
    indexes = {ix['name'] for ix in inspector.get_indexes('app_log_entries')}
    if 'ix_app_log_entries_dedupe_key' not in indexes:
        op.create_index('ix_app_log_entries_dedupe_key', 'app_log_entries', ['dedupe_key'])


def downgrade():
    op.drop_index('ix_app_log_entries_dedupe_key', table_name='app_log_entries')
    op.drop_column('app_log_entries', 'dedupe_key')
