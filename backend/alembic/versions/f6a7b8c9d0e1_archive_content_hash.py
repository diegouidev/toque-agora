"""hash de conteúdo dos arquivos (detecção de CD duplicado)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "archives", sa.Column("content_hash", sa.String(length=64), nullable=True)
    )
    op.create_index("ix_archives_content_hash", "archives", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_archives_content_hash", table_name="archives")
    op.drop_column("archives", "content_hash")
