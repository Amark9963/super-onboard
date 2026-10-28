"""M2 internal routes: extraction jobs, candidate review, conflicts and gaps.

Staff review here never approves customer policy. `accepted` means "accepted for customer
review"; customer confirmation is a separate axis that M2 never changes.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import func, select

from app.ai import Category, provider_options, slug
from app.api import Input, project_access, scoped_object
from app.auth import DB, User
from app.conflicts import SEVERITY_ORDER, refresh_conflicts
from app.invitations import open_invitation_lock
from app.models import (
    AuditEvent,
    CandidateProvenance,
    ConflictGroup,
    ConflictMember,
    InternalUser,
    Job,
    Portfolio,
    Property,
    Requirement,
    RequirementDuplicate,
    RequirementEvidence,
    RequirementVersion,
    SourceBlock,
    SourceDocument,
    SourceVersion,
    StaffReview,
)

router = APIRouter(prefix="/api", tags=["extraction and review"])
Reason = Annotated[str, Field(min_length=1, max_length=2000)]
STATE_LABELS = {
    "pending": "Awaiting staff review",
    "accepted": "Accepted for customer review — not approved",
    "rejected": "Rejected by staff",
    "duplicate": "Marked duplicate",
    "merged": "Merged into another candidate",
}


# ---------------------------------------------------------------- inputs


class ExtractionJobInput(Input):
    source_version_id: str
    provider: str = "mock"
    acknowledge_external_processing: bool = False


class CandidateEdit(Input):
    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    category: Category | None = None
    statement: Annotated[str, Field(min_length=1, max_length=2000)] | None = None
    topic: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    scope_type: Literal["company", "portfolio", "property"] | None = None
    property_id: str | None = None
    portfolio_id: str | None = None
    conditions: (
        Annotated[list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=10)]
        | None
    ) = None
    proposed_action: Annotated[str, Field(max_length=200)] | None = None

    @field_validator("topic")
    @classmethod
    def topic_slug(cls, value):
        if value is not None and not slug(value):
            raise ValueError("topic must contain letters or digits")
        return slug(value) if value else value


class RetryInput(Input):
    acknowledge_external_processing: bool = False


class AcceptInput(Input):
    confirm_scope: bool = False
    note: Annotated[str, Field(max_length=2000)] = ""


class ReasonInput(Input):
    reason: Reason


class OptionalReasonInput(Input):
    reason: Annotated[str, Field(max_length=2000)] = ""


class DuplicateInput(Input):
    canonical_id: str
    note: Annotated[str, Field(max_length=2000)] = ""


class TriageInput(Input):
    state: Literal["open", "dismissed", "confirmed"]
    rationale: Annotated[str, Field(max_length=2000)] = ""


# ---------------------------------------------------------------- helpers


def record(db, project_id, user, action, target, detail=None):
    db.add(
        AuditEvent(
            project_id=project_id,
            actor_type="internal_user",
            actor_reference=user.id,
            action=action,
            target_id=target,
            detail=detail,
        )
    )


def job_json(job, version_name=None):
    return {
        "id": job.id,
        "source_version_id": job.source_version_id,
        "source_name": version_name,
        "provider": job.provider,
        "status": job.status,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "error_code": job.error_code,
        "summary": job.summary,
        "created_at": job.created_at,
    }


def provider_choice(name, acknowledged):
    option = next((p for p in provider_options() if p["id"] == name), None)
    if option is None:
        raise HTTPException(422, "Provider is not available in this deployment")
    if option["external_processing"] and not acknowledged:
        raise HTTPException(
            422,
            "This provider sends document segments to a third-party API. "
            "Acknowledge external processing to continue.",
        )
    return option


def lock_candidate(db, project_id, version_id):
    row = db.scalar(
        select(RequirementVersion)
        .where(RequirementVersion.id == version_id, RequirementVersion.project_id == project_id)
        .with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


def duplicate_row(db, version_id):
    return db.scalar(
        select(RequirementDuplicate).where(
            RequirementDuplicate.requirement_version_id == version_id
        )
    )


def effective_state(version, duplicate):
    return duplicate.kind if duplicate else version.staff_review_state


def scope_names(db, project_id):
    names = {}
    for model in (Property, Portfolio):
        names.update(
            {r.id: r.name for r in db.scalars(select(model).where(model.project_id == project_id))}
        )
    return names


def scope_json(version, names):
    scope_id = version.property_id or version.portfolio_id
    return {
        "type": version.scope_type,
        "property_id": version.property_id,
        "portfolio_id": version.portfolio_id,
        "name": "Company-wide" if version.scope_type == "company" else names.get(scope_id),
        "confirmed_by_staff": version.scope_reviewed,
    }


def candidate_json(version, title, provenance, duplicate, names, db=None, ctx=None):
    """`ctx` (from outputs.approval_context) lets list endpoints share one computation."""
    state = effective_state(version, duplicate)
    approved = False
    if db is not None:
        from app.outputs import approval_context, approval_reasons

        ctx = ctx or approval_context(db, version.project_id)
        approved = not approval_reasons(db, version, ctx["ids"], ctx["conflicts"])
    return {
        "id": version.id,
        "requirement_id": version.requirement_id,
        "version": version.version,
        "title": title,
        "category": version.category,
        "topic": version.topic,
        "statement": version.statement,
        "scope": scope_json(version, names),
        "conditions": version.conditions,
        "proposed_action": version.proposed_action,
        "requires_live_lookup": version.requires_live_lookup,
        "missing_information": version.missing_information,
        "evidence_status": version.evidence_status,
        "staff_review_state": version.staff_review_state,
        "review_state": state,
        "review_label": STATE_LABELS[state],
        "customer_confirmation_state": version.customer_confirmation_state,
        "approval_status": "approved" if approved else "not_approved",
        "duplicate_of": duplicate.canonical_version_id if duplicate else None,
        # Revisions keep the original proposal's labels even though they have no provenance row.
        "simulated": provenance.simulated
        if provenance
        else (version.ai_proposal or {}).get("simulated"),
        "provider": provenance.provider
        if provenance
        else (version.ai_proposal or {}).get("provider"),
        "created_at": version.created_at,
    }


def candidate_rows(db, project_id):
    return (
        select(RequirementVersion, Requirement.title, CandidateProvenance, RequirementDuplicate)
        .join(Requirement, Requirement.id == RequirementVersion.requirement_id)
        .outerjoin(
            CandidateProvenance, CandidateProvenance.requirement_version_id == RequirementVersion.id
        )
        .outerjoin(
            RequirementDuplicate,
            RequirementDuplicate.requirement_version_id == RequirementVersion.id,
        )
        .where(RequirementVersion.project_id == project_id)
    )


def evidence_json(row, block, document, source):
    return {
        "id": row.id,
        "quoted_text": row.quoted_text,
        "quote_match_state": row.quote_match_state,
        "verification_notes": row.verification_notes,
        "char_start": row.char_start,
        "char_end": row.char_end,
        "block": {
            "id": block.id,
            "text": block.text,
            "locator": block.locator,
            "position": block.position,
        },
        "source": {
            "document": document.name,
            "version_id": source.id,
            "version": source.version,
            "content_hash": source.content_hash,
        },
    }


# ---------------------------------------------------------------- providers and jobs


@router.get("/ai/providers")
def providers(user: User):
    return provider_options()


@router.post("/projects/{project_id}/extraction-jobs", status_code=201)
def create_extraction_job(project_id: str, data: ExtractionJobInput, db: DB, user: User):
    project_access(db, user, project_id)
    option = provider_choice(data.provider, data.acknowledge_external_processing)
    version = scoped_object(db, SourceVersion, project_id, data.source_version_id)
    if version.parse_status not in {"parsed", "fixture"}:
        raise HTTPException(409, "Only successfully parsed sources can be extracted")
    block_count = db.scalar(
        select(func.count())
        .select_from(SourceBlock)
        .where(SourceBlock.project_id == project_id, SourceBlock.source_version_id == version.id)
    )
    if not block_count:
        raise HTTPException(409, "This source version has no evidence blocks to extract from")
    active = db.scalar(
        select(Job.id).where(
            Job.project_id == project_id,
            Job.kind == "extraction",
            Job.source_version_id == version.id,
            Job.status.in_(("pending", "running")),
        )
    )
    if active:
        raise HTTPException(409, "An extraction job for this source version is already active")
    job = Job(
        project_id=project_id,
        kind="extraction",
        source_version_id=version.id,
        provider=option["id"],
    )
    db.add(job)
    db.flush()
    record(
        db,
        project_id,
        user,
        "extraction.requested",
        job.id,
        {
            "provider": option["id"],
            "simulated": option["simulated"],
            "external_processing_acknowledged": data.acknowledge_external_processing,
        },
    )
    db.commit()
    return job_json(job, version.filename)


@router.get("/projects/{project_id}/extraction-jobs")
def extraction_jobs(
    project_id: str, db: DB, user: User, source_version_id: str | None = None, limit: int = 50
):
    project_access(db, user, project_id)
    query = (
        select(Job, SourceVersion.filename)
        .join(SourceVersion, SourceVersion.id == Job.source_version_id)
        .where(Job.project_id == project_id, Job.kind == "extraction")
        .order_by(Job.created_at.desc(), Job.id)
        .limit(max(1, min(limit, 200)))
    )
    if source_version_id:
        query = query.where(Job.source_version_id == source_version_id)
    return [job_json(job, name) for job, name in db.execute(query)]


@router.post("/projects/{project_id}/extraction-jobs/{job_id}/retry", status_code=201)
def retry_extraction(project_id: str, job_id: str, data: RetryInput, db: DB, user: User):
    project_access(db, user, project_id)
    old = scoped_object(db, Job, project_id, job_id)
    if old.kind != "extraction" or old.status != "failed":
        raise HTTPException(409, "Only failed extraction jobs can be retried")
    option = provider_choice(old.provider, data.acknowledge_external_processing)
    active = db.scalar(
        select(Job.id).where(
            Job.project_id == project_id,
            Job.kind == "extraction",
            Job.source_version_id == old.source_version_id,
            Job.status.in_(("pending", "running")),
        )
    )
    if active:
        raise HTTPException(409, "An extraction job for this source version is already active")
    job = Job(
        project_id=project_id,
        kind="extraction",
        source_version_id=old.source_version_id,
        provider=option["id"],
    )
    db.add(job)
    db.flush()
    record(db, project_id, user, "extraction.retried", job.id, {"retry_of": old.id})
    db.commit()
    return job_json(job)


# ---------------------------------------------------------------- candidates


@router.get("/projects/{project_id}/requirements")
def requirements(
    project_id: str,
    db: DB,
    user: User,
    state: Literal["pending", "accepted", "rejected", "duplicate"] | None = None,
    category: str | None = None,
    evidence_status: Literal["verified", "flagged", "unverifiable"] | None = None,
    scope_type: Literal["company", "portfolio", "property"] | None = None,
    property_id: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    project_access(db, user, project_id)
    names = scope_names(db, project_id)
    from app.outputs import approval_context

    ctx = approval_context(db, project_id)
    everything = db.execute(candidate_rows(db, project_id)).all()
    counts = {"pending": 0, "accepted": 0, "rejected": 0, "duplicate": 0, "flagged": 0}
    for version, _, _, duplicate in everything:
        counts["duplicate" if duplicate else version.staff_review_state] += 1
        counts["flagged"] += version.evidence_status != "verified"

    def wanted(version, duplicate):
        if state == "duplicate" and not duplicate:
            return False
        if state in {"pending", "accepted", "rejected"} and (
            duplicate or version.staff_review_state != state
        ):
            return False
        return (
            (not category or version.category == category)
            and (not evidence_status or version.evidence_status == evidence_status)
            and (not scope_type or version.scope_type == scope_type)
            and (not property_id or version.property_id == property_id)
        )

    rows = sorted(
        (r for r in everything if wanted(r[0], r[3])),
        key=lambda r: (r[0].category, r[1], r[0].created_at, r[0].id),
    )
    return {
        "total": len(rows),
        "counts": counts,
        "items": [
            candidate_json(v, t, p, d, names, db, ctx)
            for v, t, p, d in rows[offset : offset + limit]
        ],
    }


def load_candidate(db, project_id, version_id):
    row = db.execute(
        candidate_rows(db, project_id).where(RequirementVersion.id == version_id)
    ).first()
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


@router.get("/projects/{project_id}/requirements/{version_id}")
def requirement_detail(project_id: str, version_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    version, title, provenance, duplicate = load_candidate(db, project_id, version_id)
    names = scope_names(db, project_id)
    evidence = [
        evidence_json(row, block, document, source)
        for row, block, source, document in db.execute(
            select(RequirementEvidence, SourceBlock, SourceVersion, SourceDocument)
            .join(
                SourceBlock,
                (SourceBlock.id == RequirementEvidence.block_id)
                & (SourceBlock.project_id == RequirementEvidence.project_id),
            )
            .join(SourceVersion, SourceVersion.id == RequirementEvidence.source_version_id)
            .join(SourceDocument, SourceDocument.id == SourceVersion.document_id)
            .where(
                RequirementEvidence.project_id == project_id,
                RequirementEvidence.requirement_version_id == version_id,
            )
            .order_by(RequirementEvidence.created_at, RequirementEvidence.id)
        )
    ]
    reviews = [
        {
            "id": review.id,
            "decision": review.decision,
            "rationale": review.rationale,
            "reviewer": email,
            "created_at": review.created_at,
        }
        for review, email in db.execute(
            select(StaffReview, InternalUser.email)
            .join(InternalUser, InternalUser.id == StaffReview.reviewer_id)
            .where(
                StaffReview.project_id == project_id,
                StaffReview.requirement_version_id == version_id,
            )
            .order_by(StaffReview.created_at, StaffReview.id)
        )
    ]
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.project_id == project_id, AuditEvent.target_id == version_id)
        .order_by(AuditEvent.created_at, AuditEvent.id)
    ).all()
    emails = dict(
        db.execute(
            select(InternalUser.id, InternalUser.email).where(
                InternalUser.id.in_({e.actor_reference for e in events})
            )
        ).all()
    )
    audit = [
        {
            "action": event.action,
            "actor_type": event.actor_type,
            "actor": emails.get(event.actor_reference, event.actor_reference),
            "detail": event.detail,
            "created_at": event.created_at,
        }
        for event in events
    ]
    groups = db.execute(
        select(ConflictGroup)
        .join(ConflictMember, ConflictMember.conflict_id == ConflictGroup.id)
        .where(
            ConflictGroup.project_id == project_id,
            ConflictMember.requirement_version_id == version_id,
            ConflictGroup.triage_state != "obsolete",
        )
    ).scalars()
    merged_in = db.scalars(
        select(RequirementDuplicate.requirement_version_id).where(
            RequirementDuplicate.project_id == project_id,
            RequirementDuplicate.canonical_version_id == version_id,
        )
    ).all()
    return {
        **candidate_json(version, title, provenance, duplicate, names, db),
        "ai_proposal": version.ai_proposal,
        "citation_report": version.citation_report,
        "evidence": evidence,
        "reviews": reviews,
        "audit": audit,
        "conflicts": [
            {
                "id": g.id,
                "kind": g.kind,
                "severity": g.severity,
                "title": g.title,
                "triage_state": g.triage_state,
            }
            for g in groups
        ],
        "duplicates_of_this": merged_in,
    }


def scope_fields(db, project_id, scope_type, property_id, portfolio_id):
    if scope_type == "company":
        if property_id or portfolio_id:
            raise HTTPException(422, "Company-wide scope cannot name a property or portfolio")
        return None, None
    if scope_type == "property":
        if not property_id or portfolio_id:
            raise HTTPException(422, "Property scope requires exactly one property")
        scoped_object(db, Property, project_id, property_id)
        return property_id, None
    if not portfolio_id or property_id:
        raise HTTPException(422, "Portfolio scope requires exactly one portfolio")
    scoped_object(db, Portfolio, project_id, portfolio_id)
    return None, portfolio_id


def require_open_for_staff(version, duplicate, *, allow_rejected=False):
    if version.customer_confirmation_state != "not_confirmed":
        raise HTTPException(409, "Customer-confirmed revisions are immutable; propose a revision")
    if duplicate:
        raise HTTPException(409, "Duplicate and merged decisions are final")
    if version.staff_review_state == "rejected" and not allow_rejected:
        raise HTTPException(409, "Reopen this candidate before changing it")


def ensure_unlocked(db, project_id, version):
    if open_invitation_lock(db, project_id, version.id):
        raise HTTPException(
            409,
            "An active customer review link includes this wording. Revoke the invitation or "
            "wait for it to expire before changing the candidate.",
        )


def staff_decision(db, project_id, user, version, decision, rationale):
    db.add(
        StaffReview(
            project_id=project_id,
            requirement_version_id=version.id,
            reviewer_id=user.id,
            decision=decision,
            rationale=rationale,
        )
    )
    record(
        db,
        project_id,
        user,
        decision.replace("candidate_", "candidate."),
        version.id,
        {"rationale": rationale},
    )


@router.patch("/projects/{project_id}/requirements/{version_id}")
def edit_requirement(project_id: str, version_id: str, data: CandidateEdit, db: DB, user: User):
    project_access(db, user, project_id)
    version = lock_candidate(db, project_id, version_id)
    require_open_for_staff(version, duplicate_row(db, version.id))
    ensure_unlocked(db, project_id, version)
    requirement = scoped_object(db, Requirement, project_id, version.requirement_id)
    changes = {}
    sent = data.model_fields_set
    for name in ("category", "statement", "topic", "conditions", "proposed_action"):
        if name in sent:
            value = getattr(data, name)
            if name == "conditions":
                value = sorted({slug(c) for c in value or [] if slug(c)})
            elif name == "proposed_action":
                value = (slug(value) or None) if value else None
            elif value is None:
                raise HTTPException(422, f"{name} cannot be empty")
            if getattr(version, name) != value:
                changes[name] = (getattr(version, name), value)
    if "title" in sent:
        if data.title is None:
            raise HTTPException(422, "title cannot be empty")
        if requirement.title != data.title:
            changes["title"] = (requirement.title, data.title)
    scope_sent = sent & {"scope_type", "property_id", "portfolio_id"}
    if scope_sent:
        if data.scope_type is None:
            raise HTTPException(422, "scope_type is required when changing scope")
        property_id, portfolio_id = scope_fields(
            db, project_id, data.scope_type, data.property_id, data.portfolio_id
        )
        before = (version.scope_type, version.property_id, version.portfolio_id)
        after = (data.scope_type, property_id, portfolio_id)
        if before != after:
            changes["scope"] = (list(before), list(after))
        version.scope_type, version.property_id, version.portfolio_id = after
        version.scope_reviewed = True
    if not changes and not scope_sent:
        return candidate_response(db, project_id, version_id)
    for name, (_, value) in changes.items():
        if name == "title":
            requirement.title = value
        elif name != "scope":
            setattr(version, name, value)
    reset = version.staff_review_state == "accepted"
    if reset:
        version.staff_review_state = "pending"
    record(
        db,
        project_id,
        user,
        "candidate.edited",
        version.id,
        {
            "changes": {k: {"before": b, "after": a} for k, (b, a) in changes.items()},
            "scope_confirmed": bool(scope_sent),
            "returned_to_pending": reset,
        },
    )
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, version_id)


def candidate_response(db, project_id, version_id):
    version, title, provenance, duplicate = load_candidate(db, project_id, version_id)
    return candidate_json(version, title, provenance, duplicate, scope_names(db, project_id), db)


@router.post("/projects/{project_id}/requirements/{version_id}/accept")
def accept_requirement(project_id: str, version_id: str, data: AcceptInput, db: DB, user: User):
    project_access(db, user, project_id)
    version = lock_candidate(db, project_id, version_id)
    require_open_for_staff(version, duplicate_row(db, version.id))
    ensure_unlocked(db, project_id, version)
    if version.staff_review_state != "pending":
        raise HTTPException(409, "Only pending candidates can be accepted for customer review")
    if version.evidence_status != "verified":
        raise HTTPException(
            409, "Evidence is not fully verified. Reject this candidate or re-run extraction."
        )
    if not version.scope_reviewed and not data.confirm_scope:
        raise HTTPException(409, "Confirm or assign the scope before accepting")
    version.scope_reviewed = True
    version.staff_review_state = "accepted"
    staff_decision(db, project_id, user, version, "candidate_accepted", data.note)
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, version_id)


@router.post("/projects/{project_id}/requirements/{version_id}/reject")
def reject_requirement(project_id: str, version_id: str, data: ReasonInput, db: DB, user: User):
    project_access(db, user, project_id)
    version = lock_candidate(db, project_id, version_id)
    require_open_for_staff(version, duplicate_row(db, version.id))
    ensure_unlocked(db, project_id, version)
    version.staff_review_state = "rejected"
    staff_decision(db, project_id, user, version, "candidate_rejected", data.reason)
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, version_id)


@router.post("/projects/{project_id}/requirements/{version_id}/reopen")
def reopen_requirement(
    project_id: str, version_id: str, data: OptionalReasonInput, db: DB, user: User
):
    project_access(db, user, project_id)
    version = lock_candidate(db, project_id, version_id)
    require_open_for_staff(version, duplicate_row(db, version.id), allow_rejected=True)
    ensure_unlocked(db, project_id, version)
    if version.staff_review_state == "pending":
        raise HTTPException(409, "Candidate is already awaiting review")
    version.staff_review_state = "pending"
    staff_decision(db, project_id, user, version, "candidate_reopened", data.reason)
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, version_id)


def fold_into(db, project_id, user, version_id, data, kind):
    project_access(db, user, project_id)
    if data.canonical_id == version_id:
        raise HTTPException(422, "A candidate cannot be a duplicate of itself")
    version = lock_candidate(db, project_id, version_id)
    canonical = lock_candidate(db, project_id, data.canonical_id)
    require_open_for_staff(version, duplicate_row(db, version.id))
    ensure_unlocked(db, project_id, version)
    if canonical.staff_review_state == "rejected" or duplicate_row(db, canonical.id):
        raise HTTPException(409, "The target candidate must be live (not rejected or duplicate)")
    if canonical.customer_confirmation_state != "not_confirmed":
        raise HTTPException(409, "Confirmed revisions cannot be changed")
    ensure_unlocked(db, project_id, canonical)
    if kind == "merged" and (
        (version.scope_type, version.property_id, version.portfolio_id)
        != (canonical.scope_type, canonical.property_id, canonical.portfolio_id)
    ):
        raise HTTPException(
            409, "Merging requires identical scope; assign the same scope to both candidates first"
        )
    copied = 0
    if kind == "merged":
        existing = {
            (e.source_version_id, e.block_id, e.char_start, e.char_end)
            for e in db.scalars(
                select(RequirementEvidence).where(
                    RequirementEvidence.requirement_version_id == canonical.id
                )
            )
        }
        for row in db.scalars(
            select(RequirementEvidence).where(
                RequirementEvidence.project_id == project_id,
                RequirementEvidence.requirement_version_id == version.id,
                RequirementEvidence.quote_match_state.in_(("exact", "normalized")),
            )
        ):
            key = (row.source_version_id, row.block_id, row.char_start, row.char_end)
            if key in existing:
                continue
            db.add(
                RequirementEvidence(
                    project_id=project_id,
                    requirement_version_id=canonical.id,
                    source_version_id=row.source_version_id,
                    block_id=row.block_id,
                    quoted_text=row.quoted_text,
                    quote_match_state=row.quote_match_state,
                    verification_notes=row.verification_notes,
                    char_start=row.char_start,
                    char_end=row.char_end,
                )
            )
            copied += 1
    version.staff_review_state = "rejected"
    db.add(
        RequirementDuplicate(
            project_id=project_id,
            requirement_version_id=version.id,
            canonical_version_id=canonical.id,
            kind=kind,
            decided_by=user.id,
        )
    )
    decision = "candidate_merged" if kind == "merged" else "candidate_duplicate"
    staff_decision(db, project_id, user, version, decision, data.note)
    record(
        db,
        project_id,
        user,
        "candidate.merge_target",
        canonical.id,
        {"folded": version.id, "kind": kind, "evidence_copied": copied},
    )
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, version_id)


@router.post("/projects/{project_id}/requirements/{version_id}/duplicate")
def mark_duplicate(project_id: str, version_id: str, data: DuplicateInput, db: DB, user: User):
    return fold_into(db, project_id, user, version_id, data, "duplicate")


@router.post("/projects/{project_id}/requirements/{version_id}/merge")
def merge_requirement(project_id: str, version_id: str, data: DuplicateInput, db: DB, user: User):
    return fold_into(db, project_id, user, version_id, data, "merged")


# ---------------------------------------------------------------- conflicts and gaps


@router.get("/projects/{project_id}/conflicts")
def conflicts(
    project_id: str,
    db: DB,
    user: User,
    kind: Literal["conflict", "variant", "gap"] | None = None,
    triage_state: Literal["open", "dismissed", "confirmed", "obsolete"] | None = None,
):
    project_access(db, user, project_id)
    query = select(ConflictGroup).where(
        ConflictGroup.project_id == project_id, ConflictGroup.signature.is_not(None)
    )
    if kind:
        query = query.where(ConflictGroup.kind == kind)
    query = query.where(
        ConflictGroup.triage_state == triage_state
        if triage_state
        else ConflictGroup.triage_state != "obsolete"
    )
    groups = sorted(
        db.scalars(query), key=lambda g: (SEVERITY_ORDER.get(g.severity, 9), g.title or "", g.id)
    )
    names = scope_names(db, project_id)
    from app.outputs import approval_context

    ctx = approval_context(db, project_id)
    members = {}
    if groups:
        for link, version, title, provenance, duplicate in db.execute(
            select(
                ConflictMember,
                RequirementVersion,
                Requirement.title,
                CandidateProvenance,
                RequirementDuplicate,
            )
            .join(
                RequirementVersion, RequirementVersion.id == ConflictMember.requirement_version_id
            )
            .join(Requirement, Requirement.id == RequirementVersion.requirement_id)
            .outerjoin(
                CandidateProvenance,
                CandidateProvenance.requirement_version_id == RequirementVersion.id,
            )
            .outerjoin(
                RequirementDuplicate,
                RequirementDuplicate.requirement_version_id == RequirementVersion.id,
            )
            .where(
                ConflictMember.project_id == project_id,
                ConflictMember.conflict_id.in_([g.id for g in groups]),
            )
        ):
            members.setdefault(link.conflict_id, []).append(
                candidate_json(version, title, provenance, duplicate, names, db, ctx)
            )
    return [
        {
            "id": g.id,
            "kind": g.kind,
            "severity": g.severity,
            "title": g.title,
            "scope_intersection": g.scope_intersection,
            "triage_state": g.triage_state,
            "triage_rationale": g.triage_rationale,
            "resolved": g.resolved,
            "members": sorted(members.get(g.id, []), key=lambda m: m["id"]),
        }
        for g in groups
    ]


@router.post("/projects/{project_id}/conflicts/{conflict_id}/triage")
def triage_conflict(project_id: str, conflict_id: str, data: TriageInput, db: DB, user: User):
    """Staff classification of a suggestion. This does not resolve the underlying policy."""
    project_access(db, user, project_id)
    group = db.scalar(
        select(ConflictGroup)
        .where(ConflictGroup.id == conflict_id, ConflictGroup.project_id == project_id)
        .with_for_update()
    )
    if group is None:
        raise HTTPException(404, "Record not found")
    if group.triage_state == "obsolete":
        raise HTTPException(409, "This suggestion no longer matches the current candidates")
    if data.state == "dismissed" and not data.rationale.strip():
        raise HTTPException(422, "A rationale is required to dismiss a suggestion")
    previous = group.triage_state
    group.triage_state = data.state
    group.triage_rationale = data.rationale.strip() or None
    record(
        db,
        project_id,
        user,
        "conflict.triaged",
        group.id,
        {"before": previous, "after": data.state, "rationale": group.triage_rationale},
    )
    db.commit()
    return {"id": group.id, "triage_state": group.triage_state, "resolved": group.resolved}
