"""Customer-backed conflict resolutions for M4 outputs."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conflict_resolutions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("conflict_id", sa.String(36), nullable=False),
        sa.Column("response_id", sa.String(36), nullable=False),
        sa.Column("chosen_version_id", sa.String(36), nullable=False),
        sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("internal_users.id"), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.UniqueConstraint("project_id", "id"),
        sa.UniqueConstraint("project_id", "conflict_id"),
        sa.ForeignKeyConstraint(
            ["project_id", "conflict_id"], ["conflict_groups.project_id", "conflict_groups.id"]
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "response_id"],
            ["customer_response_versions.project_id", "customer_response_versions.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "chosen_version_id"],
            ["requirement_versions.project_id", "requirement_versions.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "reviewer_id"],
            ["project_memberships.project_id", "project_memberships.user_id"],
        ),
    )
    op.create_index(
        op.f("ix_conflict_resolutions_project_id"),
        "conflict_resolutions",
        ["project_id"],
        unique=False,
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE TRIGGER immutable_conflict_resolutions BEFORE UPDATE OR DELETE "
            "ON conflict_resolutions FOR EACH ROW EXECUTE FUNCTION reject_history_change()"
        )
    else:
        for action in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER immutable_conflict_resolutions_{action} "
                f"BEFORE {action} ON conflict_resolutions "
                "BEGIN SELECT RAISE(ABORT, 'History is immutable'); END"
            )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER immutable_conflict_resolutions ON conflict_resolutions")
    else:
        for action in ("UPDATE", "DELETE"):
            op.execute(f"DROP TRIGGER immutable_conflict_resolutions_{action}")
    op.drop_index(op.f("ix_conflict_resolutions_project_id"), table_name="conflict_resolutions")
    op.drop_table("conflict_resolutions")
