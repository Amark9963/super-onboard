"""M0 relational foundation. Composite FKs prevent cross-project associations."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Identity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ProjectBound(Identity):
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)


def scoped(*links, checks=(), unique=()):
    return (
        UniqueConstraint("project_id", "id"),
        *(
            ForeignKeyConstraint(["project_id", field], [f"{table}.project_id", f"{table}.id"])
            for field, table in links
        ),
        *(CheckConstraint(expression) for expression in checks),
        *(UniqueConstraint(*fields) for fields in unique),
    )


class InternalUser(Identity, Base):
    __tablename__ = "internal_users"
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    role: Mapped[str] = mapped_column(String(30), default="specialist")
    __table_args__ = (CheckConstraint("role IN ('admin','specialist','manager')"),)


class Organization(Identity, Base):
    __tablename__ = "organizations"
    name: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("internal_users.id"))


class Project(Identity, Base):
    __tablename__ = "projects"
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("internal_users.id"))
    name: Mapped[str] = mapped_column(String(200))
    readiness: Mapped[str] = mapped_column(String(30), default="intake")
    go_live_target: Mapped[str | None] = mapped_column(String(10))


class ProjectMembership(ProjectBound, Base):
    __tablename__ = "project_memberships"
    user_id: Mapped[str] = mapped_column(ForeignKey("internal_users.id"))
    __table_args__ = scoped(unique=(("project_id", "user_id"),))


class CustomerContact(ProjectBound, Base):
    __tablename__ = "customer_contacts"
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(100))
    authorization_note: Mapped[str] = mapped_column(Text, default="Unverified")
    __table_args__ = scoped()


class Portfolio(ProjectBound, Base):
    __tablename__ = "portfolios"
    name: Mapped[str] = mapped_column(String(200))
    __table_args__ = scoped()


class Property(ProjectBound, Base):
    __tablename__ = "properties"
    name: Mapped[str] = mapped_column(String(200))
    portfolio_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = scoped(("portfolio_id", "portfolios"))


class SourceDocument(ProjectBound, Base):
    __tablename__ = "source_documents"
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))
    __table_args__ = scoped()


class SourceVersion(ProjectBound, Base):
    __tablename__ = "source_versions"
    document_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    object_key: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    parse_status: Mapped[str] = mapped_column(String(30), default="pending")
    error_code: Mapped[str | None] = mapped_column(String(100))
    filename: Mapped[str | None] = mapped_column(String(200))
    media_type: Mapped[str | None] = mapped_column(String(100))
    byte_size: Mapped[int | None] = mapped_column(Integer)
    __table_args__ = scoped(
        ("document_id", "source_documents"),
        unique=(("document_id", "version"),),
        checks=("version > 0",),
    )


class SourceBlock(ProjectBound, Base):
    __tablename__ = "source_blocks"
    source_version_id: Mapped[str] = mapped_column(String(36))
    text: Mapped[str] = mapped_column(Text)
    locator: Mapped[dict] = mapped_column(JSON, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    __table_args__ = scoped(
        ("source_version_id", "source_versions"),
        unique=(("project_id", "source_version_id", "id"),),
    )


class Requirement(ProjectBound, Base):
    __tablename__ = "requirements"
    title: Mapped[str] = mapped_column(String(200))
    __table_args__ = scoped()


class RequirementVersion(ProjectBound, Base):
    __tablename__ = "requirement_versions"
    requirement_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer)
    supersedes_id: Mapped[str | None] = mapped_column(String(36))
    category: Mapped[str] = mapped_column(String(60))
    statement: Mapped[str] = mapped_column(Text)
    scope_type: Mapped[str] = mapped_column(String(20))
    property_id: Mapped[str | None] = mapped_column(String(36))
    portfolio_id: Mapped[str | None] = mapped_column(String(36))
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    proposed_action: Mapped[str | None] = mapped_column(Text)
    ai_proposal: Mapped[dict | None] = mapped_column(JSON)
    evidence_status: Mapped[str] = mapped_column(String(30), default="unverified")
    customer_confirmation_state: Mapped[str] = mapped_column(String(30), default="not_confirmed")
    staff_review_state: Mapped[str] = mapped_column(String(30), default="pending")
    # M2 candidate fields. `ai_proposal` is write-once; staff edits change the working fields only.
    topic: Mapped[str | None] = mapped_column(String(100))
    scope_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    requires_live_lookup: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    missing_information: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    citation_report: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    __table_args__ = scoped(
        ("requirement_id", "requirements"),
        ("property_id", "properties"),
        ("portfolio_id", "portfolios"),
        checks=(
            "version > 0",
            "(scope_type = 'company' AND property_id IS NULL AND portfolio_id IS NULL) OR (scope_type = 'property' AND property_id IS NOT NULL AND portfolio_id IS NULL) OR (scope_type = 'portfolio' AND portfolio_id IS NOT NULL AND property_id IS NULL)",
            "customer_confirmation_state IN ('not_confirmed','confirmed','correction_requested')",
            "staff_review_state IN ('pending','accepted','rejected')",
        ),
        unique=(("requirement_id", "version"), ("project_id", "requirement_id", "id")),
    ) + (
        ForeignKeyConstraint(
            ["project_id", "requirement_id", "supersedes_id"],
            [
                "requirement_versions.project_id",
                "requirement_versions.requirement_id",
                "requirement_versions.id",
            ],
        ),
    )


class RequirementEvidence(ProjectBound, Base):
    __tablename__ = "requirement_evidence"
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    source_version_id: Mapped[str] = mapped_column(String(36))
    block_id: Mapped[str] = mapped_column(String(36))
    quoted_text: Mapped[str] = mapped_column(Text)
    quote_match_state: Mapped[str] = mapped_column(String(30), default="unverified")
    verification_notes: Mapped[str | None] = mapped_column(Text)
    char_start: Mapped[int | None] = mapped_column(Integer)
    char_end: Mapped[int | None] = mapped_column(Integer)
    __table_args__ = scoped(("requirement_version_id", "requirement_versions")) + (
        ForeignKeyConstraint(
            ["project_id", "source_version_id", "block_id"],
            ["source_blocks.project_id", "source_blocks.source_version_id", "source_blocks.id"],
        ),
    )


class CandidateProvenance(ProjectBound, Base):
    """Write-once record of which extraction job and provider proposed a candidate."""

    __tablename__ = "candidate_provenance"
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    job_id: Mapped[str] = mapped_column(String(36))
    fingerprint: Mapped[str] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(120))
    model: Mapped[str | None] = mapped_column(String(100))
    simulated: Mapped[bool] = mapped_column(Boolean)
    schema_version: Mapped[str] = mapped_column(String(10))
    __table_args__ = scoped(
        ("requirement_version_id", "requirement_versions"),
        ("job_id", "jobs"),
        unique=(("requirement_version_id",), ("project_id", "fingerprint")),
    )


class RequirementDuplicate(ProjectBound, Base):
    """Final staff decision that a candidate duplicates (or was merged into) another."""

    __tablename__ = "requirement_duplicates"
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    canonical_version_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(20))
    decided_by: Mapped[str] = mapped_column(ForeignKey("internal_users.id"))
    __table_args__ = scoped(
        ("requirement_version_id", "requirement_versions"),
        ("canonical_version_id", "requirement_versions"),
        checks=(
            "kind IN ('duplicate','merged')",
            "requirement_version_id <> canonical_version_id",
        ),
        unique=(("requirement_version_id",),),
    )


class ReviewRequest(ProjectBound, Base):
    __tablename__ = "review_requests"
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = scoped()


class ClarificationQuestion(ProjectBound, Base):
    __tablename__ = "clarification_questions"
    requirement_version_id: Mapped[str | None] = mapped_column(String(36))
    text: Mapped[str] = mapped_column(Text)
    answer_type: Mapped[str] = mapped_column(String(30), default="free_text")
    choices: Mapped[list] = mapped_column(JSON, default=list)
    conflict_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = scoped(("requirement_version_id", "requirement_versions"))


class ReviewRequestItem(ProjectBound, Base):
    __tablename__ = "review_request_items"
    request_id: Mapped[str] = mapped_column(String(36))
    question_id: Mapped[str] = mapped_column(String(36))
    shared_payload: Mapped[dict] = mapped_column(JSON)
    __table_args__ = scoped(
        ("request_id", "review_requests"),
        ("question_id", "clarification_questions"),
        unique=(("project_id", "request_id", "id"),),
    )


class ReviewInvitation(ProjectBound, Base):
    __tablename__ = "review_invitations"
    request_id: Mapped[str] = mapped_column(String(36))
    contact_id: Mapped[str] = mapped_column(String(36))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery_state: Mapped[str] = mapped_column(String(30), default="draft")
    # M3 lifecycle: draft (activated_at is null) -> active -> expired | revoked.
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_error: Mapped[str | None] = mapped_column(String(100))
    replaces_id: Mapped[str | None] = mapped_column(String(36))
    created_by: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = scoped(
        ("request_id", "review_requests"),
        ("contact_id", "customer_contacts"),
        checks=("length(token_hash) = 64",),
        unique=(("project_id", "request_id", "id"),),
    )


class InvitationItem(ProjectBound, Base):
    __tablename__ = "invitation_items"
    request_id: Mapped[str] = mapped_column(String(36))
    invitation_id: Mapped[str] = mapped_column(String(36))
    item_id: Mapped[str] = mapped_column(String(36))
    __table_args__ = scoped(unique=(("project_id", "invitation_id", "item_id"),)) + (
        ForeignKeyConstraint(
            ["project_id", "request_id", "invitation_id"],
            [
                "review_invitations.project_id",
                "review_invitations.request_id",
                "review_invitations.id",
            ],
        ),
        ForeignKeyConstraint(
            ["project_id", "request_id", "item_id"],
            [
                "review_request_items.project_id",
                "review_request_items.request_id",
                "review_request_items.id",
            ],
        ),
    )


class CustomerResponseVersion(ProjectBound, Base):
    __tablename__ = "customer_response_versions"
    invitation_id: Mapped[str] = mapped_column(String(36))
    item_id: Mapped[str] = mapped_column(String(36))
    submission_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer)
    response_type: Mapped[str] = mapped_column(String(30))
    answer: Mapped[dict] = mapped_column(JSON)
    __table_args__ = scoped(
        unique=(
            ("invitation_id", "item_id", "submission_id"),
            ("invitation_id", "item_id", "version"),
        ),
        checks=(
            "version > 0",
            "response_type IN ('answer','confirm','request_correction','cannot_confirm')",
        ),
    ) + (
        ForeignKeyConstraint(
            ["project_id", "invitation_id", "item_id"],
            [
                "invitation_items.project_id",
                "invitation_items.invitation_id",
                "invitation_items.item_id",
            ],
        ),
    )


class CustomerConfirmation(ProjectBound, Base):
    __tablename__ = "customer_confirmations"
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    response_id: Mapped[str] = mapped_column(String(36))
    confirmed_statement: Mapped[str] = mapped_column(Text)
    __table_args__ = scoped(
        ("requirement_version_id", "requirement_versions"),
        ("response_id", "customer_response_versions"),
    ) + (
        Index(
            "uq_customer_confirmation_version", "project_id", "requirement_version_id", unique=True
        ),
    )


class StaffReview(ProjectBound, Base):
    __tablename__ = "staff_reviews"
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("internal_users.id"))
    decision: Mapped[str] = mapped_column(String(30))
    rationale: Mapped[str] = mapped_column(Text)
    response_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = scoped(("requirement_version_id", "requirement_versions")) + (
        ForeignKeyConstraint(
            ["project_id", "reviewer_id"],
            ["project_memberships.project_id", "project_memberships.user_id"],
        ),
    )


class ArtifactVersion(ProjectBound, Base):
    __tablename__ = "artifact_versions"
    kind: Mapped[str] = mapped_column(String(30))
    version: Mapped[int] = mapped_column(Integer)
    markdown: Mapped[str] = mapped_column(Text)
    structured: Mapped[dict] = mapped_column(JSON)
    exclusions: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = scoped(
        checks=("kind IN ('blueprint','test_plan')", "version > 0"),
        unique=(("project_id", "kind", "version"),),
    )


class ArtifactRequirement(ProjectBound, Base):
    __tablename__ = "artifact_requirements"
    artifact_id: Mapped[str] = mapped_column(String(36))
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    __table_args__ = scoped(
        ("artifact_id", "artifact_versions"),
        ("requirement_version_id", "requirement_versions"),
        unique=(("artifact_id", "requirement_version_id"),),
    )


class AuditEvent(ProjectBound, Base):
    __tablename__ = "audit_events"
    actor_type: Mapped[str] = mapped_column(String(30))
    actor_reference: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(36))
    detail: Mapped[dict | None] = mapped_column(JSON)
    __table_args__ = scoped(checks=("actor_type IN ('internal_user','customer_link','system')",))


class Job(ProjectBound, Base):
    __tablename__ = "jobs"
    kind: Mapped[str] = mapped_column(String(30))
    source_version_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    error_code: Mapped[str | None] = mapped_column(String(100))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider: Mapped[str | None] = mapped_column(String(40))
    summary: Mapped[dict | None] = mapped_column(JSON)
    __table_args__ = scoped(
        ("source_version_id", "source_versions"),
        checks=("kind IN ('ingestion','extraction')", "attempts >= 0"),
    )


class ConflictGroup(ProjectBound, Base):
    __tablename__ = "conflict_groups"
    severity: Mapped[str] = mapped_column(String(20))
    scope_intersection: Mapped[dict] = mapped_column(JSON)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    rationale: Mapped[str | None] = mapped_column(Text)
    # M2: kind is conflict | variant | gap. `resolved` stays false until customer-backed
    # resolution exists (M3+); staff triage here is a classification, not a resolution.
    kind: Mapped[str] = mapped_column(String(20), default="conflict", server_default="conflict")
    title: Mapped[str | None] = mapped_column(Text)
    signature: Mapped[str | None] = mapped_column(String(64))
    triage_state: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    triage_rationale: Mapped[str | None] = mapped_column(Text)
    __table_args__ = scoped() + (
        Index("uq_conflict_groups_signature", "project_id", "signature", unique=True),
    )


class ConflictMember(ProjectBound, Base):
    __tablename__ = "conflict_members"
    conflict_id: Mapped[str] = mapped_column(String(36))
    requirement_version_id: Mapped[str] = mapped_column(String(36))
    __table_args__ = scoped(
        ("conflict_id", "conflict_groups"), ("requirement_version_id", "requirement_versions")
    )


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class InternalSession(Identity, Base):
    __tablename__ = "internal_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("internal_users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginThrottle(Base):
    __tablename__ = "login_throttles"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
