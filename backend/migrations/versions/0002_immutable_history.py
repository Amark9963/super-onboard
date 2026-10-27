"""Protect captured history at the database boundary."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

APPEND_ONLY = (
    "customer_response_versions",
    "customer_confirmations",
    "staff_reviews",
    "artifact_versions",
    "artifact_requirements",
    "audit_events",
    "review_request_items",
    "invitation_items",
)


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("""CREATE FUNCTION reject_history_change() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'History is immutable; append a revision'; END;
        $$ LANGUAGE plpgsql""")
        for table in APPEND_ONLY:
            op.execute(
                f"CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON {table} "
                "FOR EACH ROW EXECUTE FUNCTION reject_history_change()"
            )
        op.execute("""CREATE TRIGGER confirmed_immutable BEFORE UPDATE OR DELETE
            ON requirement_versions FOR EACH ROW
            WHEN (OLD.customer_confirmation_state = 'confirmed')
            EXECUTE FUNCTION reject_history_change()""")
    elif dialect == "sqlite":
        for table in APPEND_ONLY:
            for action in ("UPDATE", "DELETE"):
                op.execute(
                    f"CREATE TRIGGER immutable_{table}_{action} BEFORE {action} ON {table} "
                    "BEGIN SELECT RAISE(ABORT, 'History is immutable'); END"
                )
        for action in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER confirmed_{action} BEFORE {action} ON requirement_versions "
                "WHEN OLD.customer_confirmation_state = 'confirmed' "
                "BEGIN SELECT RAISE(ABORT, 'Confirmed revision is immutable'); END"
            )


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER confirmed_immutable ON requirement_versions")
        for table in APPEND_ONLY:
            op.execute(f"DROP TRIGGER immutable_history ON {table}")
        op.execute("DROP FUNCTION reject_history_change()")
    else:
        for table in APPEND_ONLY:
            for action in ("UPDATE", "DELETE"):
                op.execute(f"DROP TRIGGER immutable_{table}_{action}")
        for action in ("UPDATE", "DELETE"):
            op.execute(f"DROP TRIGGER confirmed_{action}")
