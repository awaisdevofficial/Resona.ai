"""Add tts_model column to agents table

Revision ID: 20250310_tts_model
Revises:
Create Date: 2025-03-10

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20250310_tts_model"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("tts_model", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agents", "tts_model")
