"""Add created_at and last_login to users

Revision ID: f5c97448fef4
Revises: 
Create Date: 2025-04-20 14:30:31.553967

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func

# revision identifiers, used by Alembic.
revision: str = 'f5c97448fef4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    op.add_column('users', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=func.now()))
    op.add_column('users', sa.Column('last_login', sa.DateTime(), nullable=True))
    op.alter_column('users', 'created_at', server_default=None)

def downgrade():
    op.drop_column('users', 'last_login')
    op.drop_column('users', 'created_at')