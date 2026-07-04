"""favoritar CD (band_favorites) + novidades (users.news_seen_at)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Curtir um CD inteiro (banda), separado de favoritar faixa.
    op.create_table(
        "band_favorites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("band_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["band_id"], ["bands.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "band_id", name="uq_band_favorite"),
    )
    op.create_index(
        "ix_band_favorites_owner_id", "band_favorites", ["owner_id"]
    )

    # Marca temporal do "último visto" das novidades (badge de CDs novos).
    op.add_column(
        "users",
        sa.Column("news_seen_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "news_seen_at")
    op.drop_index("ix_band_favorites_owner_id", table_name="band_favorites")
    op.drop_table("band_favorites")
