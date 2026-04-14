"""add wiki_pages table

Revision ID: d4f1e9c23a8b
Revises: c3e5f8a12b7d
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4f1e9c23a8b'
down_revision = 'c3e5f8a12b7d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wiki_pages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('body_markdown', sa.Text(), nullable=True, server_default=''),
        sa.Column('category', sa.String(100), nullable=True, server_default=''),
        sa.Column('cover_image_url', sa.Text(), nullable=True, server_default=''),
        sa.Column('source', sa.String(50), nullable=True, server_default=''),
        sa.Column('published', sa.Boolean(), nullable=True, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.String(100), nullable=True, server_default=''),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_wiki_pages_slug', 'wiki_pages', ['slug'], unique=True)
    op.create_index('ix_wiki_pages_category', 'wiki_pages', ['category'], unique=False)
    op.create_index('ix_wiki_pages_published', 'wiki_pages', ['published'], unique=False)


def downgrade():
    op.drop_index('ix_wiki_pages_published', table_name='wiki_pages')
    op.drop_index('ix_wiki_pages_category', table_name='wiki_pages')
    op.drop_index('ix_wiki_pages_slug', table_name='wiki_pages')
    op.drop_table('wiki_pages')
