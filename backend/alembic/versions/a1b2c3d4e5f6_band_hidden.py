"""band hidden flag (ocultar CD da vitrine)

Revision ID: a1b2c3d4e5f6
Revises: d08b6d430237
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "d08b6d430237"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # is_hidden: server_default=false preenche as linhas existentes; depois
    # removemos o default no banco (o default fica no app/ORM).
    op.add_column(
        "bands",
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("bands", "is_hidden", server_default=None)


def downgrade() -> None:
    op.drop_column("bands", "is_hidden")
