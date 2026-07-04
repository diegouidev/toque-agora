"""link público de playlist (playlists.public_token)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Token público (uuid hex) — nulo enquanto a playlist não for publicada.
    op.add_column(
        "playlists",
        sa.Column("public_token", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_playlists_public_token", "playlists", ["public_token"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_playlists_public_token", table_name="playlists")
    op.drop_column("playlists", "public_token")
