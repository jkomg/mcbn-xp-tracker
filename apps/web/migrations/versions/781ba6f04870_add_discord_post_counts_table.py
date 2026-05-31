"""add discord_post_counts table

Revision ID: 781ba6f04870
Revises: f2a9b7c3d1e5
Create Date: 2026-05-31 12:53:46.427207

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect


# revision identifiers, used by Alembic.
revision = '781ba6f04870'
down_revision = 'f2a9b7c3d1e5'
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    """Guard against create_all() having already created the table on first boot."""
    return sa_inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _table_exists('discord_display_names'):
        op.create_table(
            'discord_display_names',
            sa.Column('discord_id', sa.String(length=30), nullable=False),
            sa.Column('display_name', sa.String(length=200), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('discord_id'),
        )

    if not _table_exists('discord_post_counts'):
        op.create_table(
            'discord_post_counts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('discord_id', sa.String(length=30), nullable=False),
            sa.Column('date', sa.String(length=10), nullable=False),
            sa.Column('category', sa.String(length=10), nullable=False),
            sa.Column('count', sa.Integer(), nullable=False),
            sa.UniqueConstraint('discord_id', 'date', 'category', name='uq_discord_post_count'),
            sa.PrimaryKeyConstraint('id'),
        )
        with op.batch_alter_table('discord_post_counts', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_discord_post_counts_discord_id'), ['discord_id'], unique=False)

    # wiki_pages cleanup — only drop published column/index if they still exist
    # (fresh DBs built by create_all() won't have them)
    wiki_inspector = sa_inspect(op.get_bind())
    wiki_col_names = {col['name'] for col in wiki_inspector.get_columns('wiki_pages')}
    has_published = 'published' in wiki_col_names

    with op.batch_alter_table('wiki_pages', schema=None) as batch_op:
        batch_op.alter_column('sync_locked_by',
               existing_type=sa.VARCHAR(length=100),
               nullable=True,
               existing_server_default=sa.text("('')"))
        if has_published:
            batch_op.drop_index(batch_op.f('ix_wiki_pages_published'))
            batch_op.drop_column('published')


def downgrade():
    op.drop_table('discord_display_names')

    with op.batch_alter_table('discord_post_counts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_discord_post_counts_discord_id'))
    op.drop_table('discord_post_counts')

    with op.batch_alter_table('wiki_pages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('published', sa.BOOLEAN(), nullable=True))
        batch_op.create_index(batch_op.f('ix_wiki_pages_published'), ['published'], unique=False)
        batch_op.alter_column('sync_locked_by',
               existing_type=sa.VARCHAR(length=100),
               nullable=False,
               existing_server_default=sa.text("('')"))
