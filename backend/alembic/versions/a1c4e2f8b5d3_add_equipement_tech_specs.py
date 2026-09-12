"""add equipement tech specs

Adds five nullable columns to the equipements table so the CSV-imported
technical specs (CPU, RAM, disk, OS, screen size) become first-class fields
instead of being stuffed into the notes text column.

Revision ID: a1c4e2f8b5d3
Revises: 988adbf12037
Create Date: 2026-07-02 12:00:00+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c4e2f8b5d3'
down_revision: Union[str, Sequence[str], None] = '988adbf12037'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('equipements', sa.Column('processeur', sa.String(length=100), nullable=True))
    op.add_column('equipements', sa.Column('ram_go', sa.Integer(), nullable=True))
    op.add_column('equipements', sa.Column('disque_go', sa.Integer(), nullable=True))
    op.add_column('equipements', sa.Column('systeme_exploitation', sa.String(length=100), nullable=True))
    op.add_column('equipements', sa.Column('ecran_pouces', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('equipements', 'ecran_pouces')
    op.drop_column('equipements', 'systeme_exploitation')
    op.drop_column('equipements', 'disque_go')
    op.drop_column('equipements', 'ram_go')
    op.drop_column('equipements', 'processeur')
