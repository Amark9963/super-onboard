"""bounded website import: requests, discovered pages, and snapshot metadata"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("source_versions", sa.Column("source_url", sa.String(2048), nullable=True))
    op.add_column(
        "source_versions", sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("source_versions", sa.Column("page_title", sa.String(300), nullable=True))
    op.add_column("source_versions", sa.Column("fetch_meta", sa.JSON(), nullable=True))
    op.create_table(
        "web_imports",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("root_url", sa.String(2048), nullable=False),
        sa.Column("approved_hosts", sa.JSON(), nullable=False),
        sa.Column("max_pages", sa.Integer(), nullable=False),
        sa.Column("max_depth", sa.Integer(), nullable=False),
        sa.Column("phase", sa.String(30), nullable=False),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.UniqueConstraint("project_id", "id"),
        sa.CheckConstraint(
            "phase IN ('discover_pending','discovering','discovered','import_pending',"
            "'importing','imported','failed')"
        ),
        sa.CheckConstraint("max_pages > 0 AND max_depth >= 0"),
    )
    op.create_index(op.f("ix_web_imports_project_id"), "web_imports", ["project_id"])
    op.create_table(
        "web_import_pages",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("import_id", sa.String(36), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("discovered_via", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), nullable=True),
        sa.Column("selected", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(100), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("source_version_id", sa.String(36), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.UniqueConstraint("project_id", "id"),
        sa.ForeignKeyConstraint(
            ["project_id", "import_id"], ["web_imports.project_id", "web_imports.id"]
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "source_version_id"],
            ["source_versions.project_id", "source_versions.id"],
        ),
        sa.CheckConstraint("status IN ('candidate','queued','fetched','failed','blocked')"),
        sa.CheckConstraint("discovered_via IN ('start','sitemap','link')"),
        sa.UniqueConstraint("import_id", "url"),
    )
    op.create_index(op.f("ix_web_import_pages_project_id"), "web_import_pages", ["project_id"])


def downgrade():
    op.drop_index(op.f("ix_web_import_pages_project_id"), table_name="web_import_pages")
    op.drop_table("web_import_pages")
    op.drop_index(op.f("ix_web_imports_project_id"), table_name="web_imports")
    op.drop_table("web_imports")
    for column in ("fetch_meta", "page_title", "fetched_at", "source_url"):
        op.drop_column("source_versions", column)
