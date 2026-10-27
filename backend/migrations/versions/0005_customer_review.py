"""customer review links, responses and confirmation workflow"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # Plain add_column keeps the append-only triggers on staff_reviews and friends intact.
    op.add_column("review_requests", sa.Column("message", sa.Text(), nullable=True))
    op.add_column("review_requests", sa.Column("created_by", sa.String(36), nullable=True))
    op.add_column("clarification_questions", sa.Column("conflict_id", sa.String(36), nullable=True))
    for name in ("activated_at", "revoked_at", "opened_at", "sent_at"):
        op.add_column(
            "review_invitations", sa.Column(name, sa.DateTime(timezone=True), nullable=True)
        )
    op.add_column("review_invitations", sa.Column("delivery_error", sa.String(100), nullable=True))
    op.add_column("review_invitations", sa.Column("replaces_id", sa.String(36), nullable=True))
    op.add_column("review_invitations", sa.Column("created_by", sa.String(36), nullable=True))
    op.add_column("staff_reviews", sa.Column("response_id", sa.String(36), nullable=True))
    op.create_index(
        "uq_customer_confirmation_version",
        "customer_confirmations",
        ["project_id", "requirement_version_id"],
        unique=True,
    )


def downgrade():
    op.drop_index("uq_customer_confirmation_version", table_name="customer_confirmations")
    op.drop_column("staff_reviews", "response_id")
    for name in (
        "created_by",
        "replaces_id",
        "delivery_error",
        "sent_at",
        "opened_at",
        "revoked_at",
        "activated_at",
    ):
        op.drop_column("review_invitations", name)
    op.drop_column("clarification_questions", "conflict_id")
    op.drop_column("review_requests", "created_by")
    op.drop_column("review_requests", "message")
