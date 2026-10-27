"""extraction jobs, candidate review state, conflict grouping"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

APPEND_ONLY = ("candidate_provenance", "requirement_duplicates")


def project_columns():
    return [
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
    ]


def project_constraints(table):
    return [
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "id"),
    ]


def upgrade():
    dialect = op.get_bind().dialect.name

    # Columns are added in place (no batch rebuild) so existing immutability triggers survive.
    op.add_column("audit_events", sa.Column("detail", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("provider", sa.String(length=40), nullable=True))
    op.add_column("jobs", sa.Column("summary", sa.JSON(), nullable=True))
    op.add_column("requirement_versions", sa.Column("topic", sa.String(length=100), nullable=True))
    op.add_column(
        "requirement_versions",
        sa.Column("scope_reviewed", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "requirement_versions",
        sa.Column("requires_live_lookup", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "requirement_versions",
        sa.Column("missing_information", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column(
        "requirement_versions",
        sa.Column("citation_report", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column("requirement_evidence", sa.Column("char_start", sa.Integer(), nullable=True))
    op.add_column("requirement_evidence", sa.Column("char_end", sa.Integer(), nullable=True))
    op.add_column(
        "conflict_groups",
        sa.Column("kind", sa.String(length=20), server_default="conflict", nullable=False),
    )
    op.add_column("conflict_groups", sa.Column("title", sa.Text(), nullable=True))
    op.add_column("conflict_groups", sa.Column("signature", sa.String(length=64), nullable=True))
    op.add_column(
        "conflict_groups",
        sa.Column("triage_state", sa.String(length=20), server_default="open", nullable=False),
    )
    op.add_column("conflict_groups", sa.Column("triage_rationale", sa.Text(), nullable=True))
    op.create_index(
        "uq_conflict_groups_signature", "conflict_groups", ["project_id", "signature"], unique=True
    )

    op.create_table(
        "candidate_provenance",
        *project_columns(),
        sa.Column("requirement_version_id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=120), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("simulated", sa.Boolean(), nullable=False),
        sa.Column("schema_version", sa.String(length=10), nullable=False),
        *project_constraints("candidate_provenance"),
        sa.ForeignKeyConstraint(
            ["project_id", "requirement_version_id"],
            ["requirement_versions.project_id", "requirement_versions.id"],
        ),
        sa.ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"]),
        sa.UniqueConstraint("requirement_version_id"),
        sa.UniqueConstraint("project_id", "fingerprint"),
    )
    op.create_index(
        op.f("ix_candidate_provenance_project_id"),
        "candidate_provenance",
        ["project_id"],
        unique=False,
    )
    op.create_table(
        "requirement_duplicates",
        *project_columns(),
        sa.Column("requirement_version_id", sa.String(length=36), nullable=False),
        sa.Column("canonical_version_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("decided_by", sa.String(length=36), nullable=False),
        *project_constraints("requirement_duplicates"),
        sa.ForeignKeyConstraint(["decided_by"], ["internal_users.id"]),
        sa.ForeignKeyConstraint(
            ["project_id", "requirement_version_id"],
            ["requirement_versions.project_id", "requirement_versions.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "canonical_version_id"],
            ["requirement_versions.project_id", "requirement_versions.id"],
        ),
        sa.CheckConstraint("kind IN ('duplicate','merged')"),
        sa.CheckConstraint("requirement_version_id <> canonical_version_id"),
        sa.UniqueConstraint("requirement_version_id"),
    )
    op.create_index(
        op.f("ix_requirement_duplicates_project_id"),
        "requirement_duplicates",
        ["project_id"],
        unique=False,
    )

    if dialect == "postgresql":
        for table in APPEND_ONLY:
            op.execute(
                f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {table} "
                "FOR EACH ROW EXECUTE FUNCTION reject_history_change()"
            )
        op.execute("""CREATE FUNCTION reject_proposal_change() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'The AI proposal is immutable; edit the working fields'; END;
        $$ LANGUAGE plpgsql""")
        op.execute("""CREATE TRIGGER proposal_immutable BEFORE UPDATE OF ai_proposal
            ON requirement_versions FOR EACH ROW
            WHEN (OLD.ai_proposal::text IS DISTINCT FROM NEW.ai_proposal::text)
            EXECUTE FUNCTION reject_proposal_change()""")
    elif dialect == "sqlite":
        for table in APPEND_ONLY:
            for action in ("UPDATE", "DELETE"):
                op.execute(
                    f"CREATE TRIGGER immutable_{table}_{action} BEFORE {action} ON {table} "
                    "BEGIN SELECT RAISE(ABORT, 'History is immutable'); END"
                )
        op.execute(
            "CREATE TRIGGER proposal_immutable BEFORE UPDATE OF ai_proposal ON requirement_versions "
            "WHEN OLD.ai_proposal IS NOT NEW.ai_proposal "
            "BEGIN SELECT RAISE(ABORT, 'The AI proposal is immutable'); END"
        )


def downgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("DROP TRIGGER proposal_immutable ON requirement_versions")
        op.execute("DROP FUNCTION reject_proposal_change()")
        for table in APPEND_ONLY:
            op.execute(f"DROP TRIGGER immutable_history ON {table}")
    else:
        op.execute("DROP TRIGGER proposal_immutable")
        for table in APPEND_ONLY:
            for action in ("UPDATE", "DELETE"):
                op.execute(f"DROP TRIGGER immutable_{table}_{action}")
    op.drop_table("requirement_duplicates")
    op.drop_table("candidate_provenance")
    op.drop_index("uq_conflict_groups_signature", table_name="conflict_groups")
    for column in ("triage_rationale", "triage_state", "signature", "title", "kind"):
        op.drop_column("conflict_groups", column)
    op.drop_column("requirement_evidence", "char_end")
    op.drop_column("requirement_evidence", "char_start")
    for column in (
        "citation_report",
        "missing_information",
        "requires_live_lookup",
        "scope_reviewed",
        "topic",
    ):
        op.drop_column("requirement_versions", column)
    op.drop_column("jobs", "summary")
    op.drop_column("jobs", "provider")
    op.drop_column("audit_events", "detail")
