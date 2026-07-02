"""add dedupe_key to app_log_entries

Revision ID: b2d6e91a4c73
Revises: a91c5f7b2d4e
Create Date: 2026-07-02

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2d6e91a4c73'
down_revision = 'a91c5f7b2d4e'
branch_labels = None
depends_on = None


def upgrade():
    # Every gunicorn worker's create_app() independently checks alembic_version
    # and, if behind, calls upgrade() — so on a deploy with multiple workers,
    # two processes can race this migration against the same remote DB. An
    # inspector-based "does it exist" check-then-act isn't atomic against that
    # race (both can see "not yet created" before either commits). Use SQLite's
    # native IF NOT EXISTS / catch-the-duplicate-error instead, which is safe
    # regardless of which process gets there first.
    bind = op.get_bind()
    try:
        bind.execute(sa.text(
            "ALTER TABLE app_log_entries ADD COLUMN dedupe_key VARCHAR(250) NOT NULL DEFAULT ''"
        ))
    except Exception as exc:
        if 'duplicate column' not in str(exc).lower():
            raise
    bind.execute(sa.text(
        'CREATE INDEX IF NOT EXISTS ix_app_log_entries_dedupe_key ON app_log_entries (dedupe_key)'
    ))


def downgrade():
    op.drop_index('ix_app_log_entries_dedupe_key', table_name='app_log_entries')
    op.drop_column('app_log_entries', 'dedupe_key')
