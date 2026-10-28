"""M4 approval gate and immutable, source-linked specification exports."""

import json
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import Field
from sqlalchemy import and_, func, select

from app.api import Input, project_access, scoped_object
from app.auth import DB, User
from app.conflicts import current_versions, refresh_conflicts
from app.extraction import describe_locator
from app.invitations import CONFIRMATION_NOTE
from app.models import (
    ArtifactRequirement,
    ArtifactVersion,
    AuditEvent,
    ClarificationQuestion,
    ConflictGroup,
    ConflictMember,
    ConflictResolution,
    CustomerConfirmation,
    CustomerResponseVersion,
    InternalUser,
    Job,
    Organization,
    Portfolio,
    Project,
    Property,
    Requirement,
    RequirementEvidence,
    RequirementVersion,
    ReviewRequestItem,
    SourceBlock,
    SourceDocument,
    SourceVersion,
    StaffReview,
)
from app.review import record, scope_names

router = APIRouter(prefix="/api", tags=["outputs and readiness"])


class ResolveInput(Input):
    response_id: str
    chosen_version_id: str
    rationale: Annotated[str, Field(min_length=10, max_length=2000)]


class GenerateInput(Input):
    acknowledge_exclusions: bool = False


class RevisionInput(Input):
    statement: Annotated[str, Field(min_length=1, max_length=2000)]
    reason: Annotated[str, Field(min_length=10, max_length=2000)]


def high_conflicts(db, project_id):
    return db.scalars(
        select(ConflictGroup).where(
            ConflictGroup.project_id == project_id,
            ConflictGroup.kind == "conflict",
            ConflictGroup.severity == "high",
            ConflictGroup.triage_state.not_in(("obsolete", "dismissed")),
            ConflictGroup.resolved.is_(False),
        )
    ).all()


def approval_reasons(db, version, latest_ids=None, open_conflicts=None):
    reasons = []
    if latest_ids is not None and version.id not in latest_ids:
        reasons.append("superseded")
    if version.staff_review_state != "accepted":
        reasons.append("staff_candidate_review")
    if not version.scope_reviewed:
        reasons.append("scope_review")
    if version.evidence_status != "verified":
        reasons.append("verified_evidence")
    if version.customer_confirmation_state != "confirmed":
        reasons.append("customer_confirmation")
    else:
        confirmation = db.scalar(
            select(CustomerConfirmation).where(
                CustomerConfirmation.project_id == version.project_id,
                CustomerConfirmation.requirement_version_id == version.id,
                CustomerConfirmation.confirmed_statement == version.statement,
            )
        )
        reviewed = confirmation and db.scalar(
            select(StaffReview.id).where(
                StaffReview.project_id == version.project_id,
                StaffReview.requirement_version_id == version.id,
                StaffReview.response_id == confirmation.response_id,
                StaffReview.decision == "confirmation_validated",
            )
        )
        if not reviewed:
            reasons.append("validated_confirmation")
    if open_conflicts is None:
        open_conflicts = high_conflicts(db, version.project_id)
    if open_conflicts:
        member = db.scalar(
            select(ConflictMember.id).where(
                ConflictMember.project_id == version.project_id,
                ConflictMember.requirement_version_id == version.id,
                ConflictMember.conflict_id.in_([g.id for g in open_conflicts]),
            )
        )
        if member:
            reasons.append("high_conflict")
    resolved_groups = db.scalars(
        select(ConflictGroup)
        .join(ConflictMember, ConflictMember.conflict_id == ConflictGroup.id)
        .where(
            ConflictGroup.project_id == version.project_id,
            ConflictGroup.kind == "conflict",
            ConflictGroup.resolved.is_(True),
            ConflictGroup.triage_state != "obsolete",
            ConflictMember.requirement_version_id == version.id,
        )
    ).all()
    for group in resolved_groups:
        chosen_id = db.scalar(
            select(ConflictResolution.chosen_version_id).where(
                ConflictResolution.project_id == version.project_id,
                ConflictResolution.conflict_id == group.id,
            )
        )
        if chosen_id != version.id:
            reasons.append("conflict_selected_other_rule")
            break
    return reasons


def approved_set(db, project_id):
    versions = current_versions(db, project_id)
    latest_ids = {v.id for v in versions}
    conflicts = high_conflicts(db, project_id)
    return [v for v in versions if not approval_reasons(db, v, latest_ids, conflicts)]


def approval_context(db, project_id):
    """Per-request context so list endpoints do not recompute it for every row."""
    return {
        "ids": {v.id for v in current_versions(db, project_id)},
        "conflicts": high_conflicts(db, project_id),
    }


def latest_artifact(db, project_id, kind):
    return db.scalar(
        select(ArtifactVersion)
        .where(ArtifactVersion.project_id == project_id, ArtifactVersion.kind == kind)
        .order_by(ArtifactVersion.version.desc())
        .limit(1)
    )


def artifact_state(db, artifact, approved_ids):
    captured = set(
        db.scalars(
            select(ArtifactRequirement.requirement_version_id).where(
                ArtifactRequirement.project_id == artifact.project_id,
                ArtifactRequirement.artifact_id == artifact.id,
            )
        )
    )
    return {
        "stale": captured != approved_ids,
        "requirement_version_ids": sorted(captured),
        "new_approved_ids": sorted(approved_ids - captured),
        "removed_approved_ids": sorted(captured - approved_ids),
    }


def readiness_snapshot(db, project_id):
    versions = current_versions(db, project_id)
    approved = approved_set(db, project_id)
    approved_ids = {v.id for v in approved}
    conflicts = high_conflicts(db, project_id)
    artifacts = {kind: latest_artifact(db, project_id, kind) for kind in ("blueprint", "test_plan")}
    artifact_states = {
        kind: (artifact_state(db, row, approved_ids) if row else None)
        for kind, row in artifacts.items()
    }
    every = db.scalars(
        select(RequirementVersion).where(RequirementVersion.project_id == project_id)
    ).all()
    current_ids = {v.id for v in versions}
    pending_confirmation = sum(
        v.staff_review_state == "accepted" and v.customer_confirmation_state != "confirmed"
        for v in every
    )
    # Revisions proposed after approval; the confirmed baseline stays approved until one is
    # itself confirmed and validated.
    pending_revisions = sum(
        v.id not in current_ids
        and v.supersedes_id is not None
        and v.customer_confirmation_state != "confirmed"
        and v.staff_review_state != "rejected"
        for v in every
    )
    sources = db.scalar(
        select(func.count())
        .select_from(SourceDocument)
        .where(SourceDocument.project_id == project_id)
    )
    active_jobs = db.scalar(
        select(Job.id).where(Job.project_id == project_id, Job.status.in_(("pending", "running")))
    )
    if conflicts:
        state = "blocked"
    elif active_jobs:
        state = "extracting"
    elif pending_confirmation:
        state = "awaiting_customer"
    elif not sources and not versions:
        state = "intake"
    elif not approved:
        state = "in_review"
    elif any(row is None for row in artifacts.values()):
        state = "drafting_artifacts"
    elif any(item["stale"] for item in artifact_states.values()):
        state = "artifacts_stale"
    else:
        state = "artifacts_current"
    return {
        "state": state,
        "approved_count": len(approved),
        "pending_confirmation_count": pending_confirmation,
        "pending_revision_count": pending_revisions,
        "open_high_conflict_count": len(conflicts),
        "artifacts": {
            kind: ({"id": row.id, "version": row.version, **artifact_states[kind]} if row else None)
            for kind, row in artifacts.items()
        },
        "note": "Document readiness only; no live agent configuration or deployment.",
    }


@router.get("/projects/{project_id}/readiness")
def readiness(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    return readiness_snapshot(db, project_id)


@router.get("/projects/{project_id}/approvals")
def approvals(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    versions = current_versions(db, project_id)
    names = scope_names(db, project_id)
    ids = {v.id for v in versions}
    conflicts = high_conflicts(db, project_id)
    titles = dict(
        db.execute(
            select(Requirement.id, Requirement.title).where(Requirement.project_id == project_id)
        ).all()
    )
    return [
        {
            "requirement_version_id": v.id,
            "version": v.version,
            "title": titles[v.requirement_id],
            "statement": v.statement,
            "scope": "Company-wide"
            if v.scope_type == "company"
            else names.get(v.property_id or v.portfolio_id),
            "approved": not (reasons := approval_reasons(db, v, ids, conflicts)),
            "blockers": reasons,
        }
        for v in versions
    ]


@router.post("/projects/{project_id}/conflicts/{conflict_id}/resolve")
def resolve_conflict(project_id: str, conflict_id: str, data: ResolveInput, db: DB, user: User):
    project_access(db, user, project_id)
    group = db.scalar(
        select(ConflictGroup)
        .where(ConflictGroup.project_id == project_id, ConflictGroup.id == conflict_id)
        .with_for_update()
    )
    if not group:
        raise HTTPException(404, "Conflict not found")
    if (
        group.kind != "conflict"
        or group.triage_state in {"obsolete", "dismissed"}
        or group.resolved
    ):
        raise HTTPException(409, "Only an active unresolved conflict can be resolved")
    response = scoped_object(db, CustomerResponseVersion, project_id, data.response_id)
    item = scoped_object(db, ReviewRequestItem, project_id, response.item_id)
    question = scoped_object(db, ClarificationQuestion, project_id, item.question_id)
    if question.conflict_id != group.id or response.response_type != "answer":
        raise HTTPException(409, "A customer answer linked to this conflict is required")
    newer = db.scalar(
        select(CustomerResponseVersion.id).where(
            CustomerResponseVersion.invitation_id == response.invitation_id,
            CustomerResponseVersion.item_id == response.item_id,
            CustomerResponseVersion.version > response.version,
        )
    )
    if newer:
        raise HTTPException(409, "The customer has amended this answer")
    chosen = scoped_object(db, RequirementVersion, project_id, data.chosen_version_id)
    member = db.scalar(
        select(ConflictMember.id).where(
            ConflictMember.project_id == project_id,
            ConflictMember.conflict_id == group.id,
            ConflictMember.requirement_version_id == chosen.id,
        )
    )
    if not member or chosen not in current_versions(db, project_id):
        raise HTTPException(409, "Choose a current rule in this conflict")
    if chosen.customer_confirmation_state != "confirmed":
        raise HTTPException(
            409, "The selected rule must also have a validated customer confirmation"
        )
    resolution = ConflictResolution(
        project_id=project_id,
        conflict_id=group.id,
        response_id=response.id,
        chosen_version_id=chosen.id,
        reviewer_id=user.id,
        rationale=data.rationale,
    )
    db.add(resolution)
    group.resolved = True
    group.rationale = data.rationale
    db.flush()
    record(
        db,
        project_id,
        user,
        "conflict.resolved",
        group.id,
        {
            "response_id": response.id,
            "chosen_version_id": chosen.id,
            "resolution_id": resolution.id,
        },
    )
    db.commit()
    return {"id": group.id, "resolved": True, "resolution_id": resolution.id}


@router.post("/projects/{project_id}/requirements/{version_id}/revisions", status_code=201)
def revise_confirmed(project_id: str, version_id: str, data: RevisionInput, db: DB, user: User):
    project_access(db, user, project_id)
    old = db.scalar(
        select(RequirementVersion)
        .where(RequirementVersion.project_id == project_id, RequirementVersion.id == version_id)
        .with_for_update()
    )
    if not old:
        raise HTTPException(404, "Requirement version not found")
    if old.customer_confirmation_state != "confirmed":
        raise HTTPException(409, "Use the correction workflow for unconfirmed candidates")
    if old.id not in {v.id for v in current_versions(db, project_id)}:
        raise HTTPException(409, "Only the current confirmed version can be revised")
    if db.scalar(
        select(RequirementVersion.id).where(
            RequirementVersion.project_id == project_id,
            RequirementVersion.requirement_id == old.requirement_id,
            RequirementVersion.version > old.version,
        )
    ):
        raise HTTPException(409, "A revision of this requirement is already in progress")
    if old.statement == data.statement:
        raise HTTPException(422, "New wording must differ from the confirmed version")
    new = RequirementVersion(
        project_id=project_id,
        requirement_id=old.requirement_id,
        version=old.version + 1,  # guarded above: no newer version exists
        supersedes_id=old.id,
        category=old.category,
        statement=data.statement,
        scope_type=old.scope_type,
        property_id=old.property_id,
        portfolio_id=old.portfolio_id,
        conditions=old.conditions,
        proposed_action=old.proposed_action,
        topic=old.topic,
        ai_proposal=old.ai_proposal,
        evidence_status=old.evidence_status,
        customer_confirmation_state="not_confirmed",
        staff_review_state="pending",
        scope_reviewed=old.scope_reviewed,
        requires_live_lookup=old.requires_live_lookup,
        missing_information=old.missing_information,
        citation_report=old.citation_report,
    )
    db.add(new)
    db.flush()
    for evidence in db.scalars(
        select(RequirementEvidence).where(
            RequirementEvidence.project_id == project_id,
            RequirementEvidence.requirement_version_id == old.id,
        )
    ).all():
        db.add(
            RequirementEvidence(
                project_id=project_id,
                requirement_version_id=new.id,
                source_version_id=evidence.source_version_id,
                block_id=evidence.block_id,
                quoted_text=evidence.quoted_text,
                quote_match_state=evidence.quote_match_state,
                verification_notes=evidence.verification_notes,
                char_start=evidence.char_start,
                char_end=evidence.char_end,
            )
        )
    record(
        db,
        project_id,
        user,
        "requirement.revised_after_approval",
        new.id,
        {"supersedes": old.id, "reason": data.reason},
    )
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return {
        "id": new.id,
        "version": new.version,
        "supersedes_id": old.id,
        "approval_status": "not_approved",
        "fresh_confirmation_required": True,
        "baseline_remains_approved_until_revision_is_validated": True,
    }


def exclusions_for(db, project_id, approved_ids):
    versions = current_versions(db, project_id)
    titles = dict(
        db.execute(
            select(Requirement.id, Requirement.title).where(Requirement.project_id == project_id)
        ).all()
    )
    result = [
        {
            "kind": "requirement",
            "requirement_version_id": v.id,
            "title": titles[v.requirement_id],
            "reason": "Not approved for blueprint",
        }
        for v in versions
        if v.id not in approved_ids and v.staff_review_state != "rejected"
    ]
    result.extend(
        {
            "kind": g.kind,
            "conflict_id": g.id,
            "title": g.title,
            "reason": "Unresolved policy conflict or dependency",
        }
        for g in db.scalars(
            select(ConflictGroup).where(
                ConflictGroup.project_id == project_id,
                ConflictGroup.kind.in_(("conflict", "gap")),
                ConflictGroup.triage_state.not_in(("obsolete", "dismissed")),
                ConflictGroup.resolved.is_(False),
            )
        )
    )
    return result


SECTIONS = (
    (
        "company",
        "Customer goals and company details",
        {"customer_goals", "company_details", "property_portfolio"},
    ),
    ("hours", "Business hours and after-hours logic", {"office_hours"}),
    ("faqs", "Approved FAQs and leasing information", {"faqs", "leasing"}),
    ("maintenance", "Maintenance handling", {"maintenance"}),
    ("emergencies", "Emergencies, transfers and fallbacks", {"emergencies", "staff_transfers"}),
    (
        "restrictions",
        "Restrictions, limits and must-escalate cases",
        {"restrictions", "spending_limits"},
    ),
    (
        "dependencies",
        "Integrations and operational dependencies",
        {"integrations", "operational_dependencies", "unknowns"},
    ),
)


def evidence_for(db, project_id, version_ids):
    """Verified source references per requirement version, from stored blocks only."""
    if not version_ids:
        return {}
    rows = db.execute(
        select(
            RequirementEvidence,
            SourceBlock.locator,
            SourceDocument.name,
            SourceVersion.version,
            SourceVersion.content_hash,
        )
        .join(
            SourceBlock,
            and_(
                SourceBlock.id == RequirementEvidence.block_id,
                SourceBlock.project_id == RequirementEvidence.project_id,
            ),
        )
        .join(SourceVersion, SourceVersion.id == RequirementEvidence.source_version_id)
        .join(SourceDocument, SourceDocument.id == SourceVersion.document_id)
        .where(
            RequirementEvidence.project_id == project_id,
            RequirementEvidence.requirement_version_id.in_(list(version_ids)),
            RequirementEvidence.quote_match_state.in_(("exact", "normalized")),
        )
        .order_by(RequirementEvidence.created_at, RequirementEvidence.id)
    ).all()
    result = {}
    for evidence, locator, document, number, digest in rows:
        result.setdefault(evidence.requirement_version_id, []).append(
            {
                "document": document,
                "document_version": number,
                "document_sha256": digest,
                "source_version_id": evidence.source_version_id,
                "block_id": evidence.block_id,
                "locator": locator,
                "locator_text": describe_locator(locator),
                "quoted_text": evidence.quoted_text,
                "quote_match": evidence.quote_match_state,
            }
        )
    return result


def provenance_for(db, project_id, version_ids):
    """Customer confirmation and any conflict resolution behind each approved version."""
    confirmations = {}
    for confirmation, validated_at in db.execute(
        select(CustomerConfirmation, StaffReview.created_at)
        .join(
            StaffReview,
            and_(
                StaffReview.project_id == CustomerConfirmation.project_id,
                StaffReview.response_id == CustomerConfirmation.response_id,
                StaffReview.decision == "confirmation_validated",
            ),
        )
        .where(
            CustomerConfirmation.project_id == project_id,
            CustomerConfirmation.requirement_version_id.in_(list(version_ids)),
        )
    ):
        confirmations[confirmation.requirement_version_id] = {
            "response_id": confirmation.response_id,
            "confirmed_at": confirmation.created_at.isoformat(),
            "validated_at": validated_at.isoformat(),
            "basis": CONFIRMATION_NOTE,
        }
    resolutions = {}
    for resolution in db.scalars(
        select(ConflictResolution).where(
            ConflictResolution.project_id == project_id,
            ConflictResolution.chosen_version_id.in_(list(version_ids)),
        )
    ):
        resolutions.setdefault(resolution.chosen_version_id, []).append(
            {
                "conflict_id": resolution.conflict_id,
                "customer_response_id": resolution.response_id,
                "rationale": resolution.rationale,
                "resolved_at": resolution.created_at.isoformat(),
            }
        )
    return confirmations, resolutions


def render_markdown(kind, structured):
    title = kind.replace("_", " ").title()
    lines = [
        f"# {structured['project']['name']} — {title} v{structured['version']}",
        "",
        f"Customer: {structured['project']['organization']}",
        "",
        "Human-facing Super-ready specification. Not a live agent configuration or deployment.",
        "Manual configuration and manual testing happen outside this application.",
        "",
    ]
    scope = structured["scope"]
    lines += [
        "## Customer and property scope",
        "",
        f"- Properties: {', '.join(p['name'] for p in scope['properties']) or 'none recorded'}",
        f"- Portfolios: {', '.join(p['name'] for p in scope['portfolios']) or 'none recorded'}",
        "",
    ]
    if kind == "blueprint":
        rules = {r["requirement_version_id"]: r for r in structured["approved_rules"]}
        for section in structured["sections"]:
            lines += [f"## {section['title']}", ""]
            for version_id in section["requirement_version_ids"]:
                rule = rules[version_id]
                lines += [
                    f"### {rule['title']}",
                    "",
                    f"- Scope: {rule['scope']}",
                    f"- Policy: {rule['statement']}",
                ]
                if rule["conditions"]:
                    lines.append(f"- Conditions: {', '.join(rule['conditions'])}")
                if rule["proposed_action"]:
                    lines.append(f"- Proposed action: {rule['proposed_action']}")
                if rule["requires_live_system_lookup"]:
                    lines.append(
                        "- requires_live_system_lookup: configure the integration manually; "
                        "do not treat any snapshot as current data."
                    )
                lines.append(f"- Requirement version: `{rule['requirement_version_id']}`")
                confirmation = rule["customer_confirmation"]
                if confirmation:
                    lines.append(
                        f"- Customer confirmation: recorded {confirmation['confirmed_at']}, "
                        f"validated by staff {confirmation['validated_at']} "
                        f"({confirmation['basis']})"
                    )
                for resolution in rule["conflict_resolutions"]:
                    lines.append(f"- Conflict resolution: {resolution['rationale']}")
                for source in rule["evidence"]:
                    lines.append(
                        f"- Source: \u201c{source['quoted_text']}\u201d — {source['document']} "
                        f"v{source['document_version']}, {source['locator_text']}"
                    )
                lines.append("")
        if structured["sections_without_approved_data"]:
            lines += ["## Not covered by approved data", ""]
            lines += [f"- {name}" for name in structured["sections_without_approved_data"]]
            lines.append("")
    else:
        lines += [
            "## Manual test cases",
            "",
            "No test is executed or simulated by this application.",
            "",
        ]
        for case in structured["cases"]:
            lines += [
                f"### {case['id']} — {case['name']}",
                "",
                f"- Requirement version: `{case.get('requirement_version_id')}`",
                f"- Scope: {case['scope']}",
                f"- Scenario: {case['scenario']}",
                f"- Preconditions: {case['preconditions']}",
                f"- Example input: {case['example_input']}",
                f"- Expected behavior: {case['expected_behavior']}",
                f"- Escalation/fallback: {case['fallback']}",
                "- Manual verification: compare observed behavior with the confirmed rule "
                "and record the result outside this application.",
            ]
            for source in case.get("source_references", []):
                lines.append(
                    f"- Source: {source['document']} v{source['document_version']}, "
                    f"{source['locator_text']}"
                )
            lines.append("")
    lines += ["## Unresolved issues and exclusions", ""]
    for exclusion in structured["exclusions"]:
        lines.append(f"- {exclusion['title']}: {exclusion['reason']}")
    if not structured["exclusions"]:
        lines.append("- None recorded at generation time.")
    return "\n".join(lines) + "\n"


def build_structured(db, project, kind, number, approved, exclusions):
    names = scope_names(db, project.id)
    organization = db.get(Organization, project.organization_id)
    titles = dict(
        db.execute(
            select(Requirement.id, Requirement.title).where(Requirement.project_id == project.id)
        ).all()
    )
    ids = [v.id for v in approved]
    evidence = evidence_for(db, project.id, ids)
    confirmations, resolutions = provenance_for(db, project.id, ids)
    rules = [
        {
            "requirement_version_id": v.id,
            "requirement_id": v.requirement_id,
            "version": v.version,
            "title": titles[v.requirement_id],
            "category": v.category,
            "statement": v.statement,
            "scope_type": v.scope_type,
            "scope": "Company-wide"
            if v.scope_type == "company"
            else names.get(v.property_id or v.portfolio_id),
            "property_id": v.property_id,
            "portfolio_id": v.portfolio_id,
            "conditions": v.conditions,
            "proposed_action": v.proposed_action,
            "requires_live_system_lookup": v.requires_live_lookup,
            "evidence": evidence.get(v.id, []),
            "customer_confirmation": confirmations.get(v.id),
            "conflict_resolutions": resolutions.get(v.id, []),
        }
        for v in sorted(approved, key=lambda item: (titles[item.requirement_id], item.version))
    ]
    properties = db.scalars(
        select(Property).where(Property.project_id == project.id).order_by(Property.name)
    ).all()
    portfolios = db.scalars(
        select(Portfolio).where(Portfolio.project_id == project.id).order_by(Portfolio.name)
    ).all()
    base = {
        "schema_version": 2,
        "kind": kind,
        "version": number,
        "project": {"id": project.id, "name": project.name, "organization": organization.name},
        "scope": {
            "properties": [
                {"id": p.id, "name": p.name, "portfolio_id": p.portfolio_id} for p in properties
            ],
            "portfolios": [{"id": p.id, "name": p.name} for p in portfolios],
        },
        "caveat": "Human-facing Super-ready specification; no live agent configuration or deployment.",
        "exclusions": exclusions,
    }
    if kind == "blueprint":
        placed = set()
        sections = []
        for key, label, categories in SECTIONS:
            members = [r["requirement_version_id"] for r in rules if r["category"] in categories]
            placed.update(members)
            if members:
                sections.append({"key": key, "title": label, "requirement_version_ids": members})
        leftover = [
            r["requirement_version_id"] for r in rules if r["requirement_version_id"] not in placed
        ]
        if leftover:  # an unknown category is never silently dropped
            sections.append(
                {
                    "key": "other",
                    "title": "Other approved rules",
                    "requirement_version_ids": leftover,
                }
            )
        covered = {section["key"] for section in sections}
        base["approved_rules"] = rules
        base["sections"] = sections
        base["sections_without_approved_data"] = [
            label for key, label, _ in SECTIONS if key not in covered
        ]
        base["dependencies"] = [
            {
                "requirement_version_id": r["requirement_version_id"],
                "title": r["title"],
                "flag": "requires_live_system_lookup",
            }
            for r in rules
            if r["requires_live_system_lookup"]
        ]
    else:
        cases = []
        for index, rule in enumerate(rules, 1):
            common = {
                "requirement_version_id": rule["requirement_version_id"],
                "scope": rule["scope"],
                "preconditions": "Applicable scope and confirmed policy are active",
                "fallback": "Escalate for manual review when the rule cannot be applied confidently",
                "source_references": [
                    {k: e[k] for k in ("document", "document_version", "locator_text")}
                    for e in rule["evidence"]
                ],
            }
            for code, label, scenario, expected in (
                ("N", "normal", "Caller asks about the covered policy", rule["statement"]),
                (
                    "X",
                    "negative",
                    "Caller asks for an action outside the confirmed rule",
                    "Do not invent permission; escalate",
                ),
                (
                    "B",
                    "boundary",
                    "Caller asks at a condition or scope boundary",
                    "Apply the confirmed scope and conditions; otherwise escalate",
                ),
            ):
                cases.append(
                    {
                        "id": f"T-{index:03d}-{code}",
                        "name": f"{rule['title']} — {label}",
                        "scenario": scenario,
                        "example_input": "Fictional caller request; fill in during manual test",
                        "expected_behavior": expected,
                        **common,
                    }
                )
            if rule["requires_live_system_lookup"]:
                cases.append(
                    {
                        "id": f"T-{index:03d}-D",
                        "name": f"{rule['title']} — unresolved dependency",
                        "scenario": "Live system data is unavailable",
                        "example_input": "Fictional lookup request",
                        "expected_behavior": "Do not guess live data; follow manual fallback",
                        **common,
                    }
                )
        for index, exclusion in enumerate(exclusions, 1):
            cases.append(
                {
                    "id": f"U-{index:03d}",
                    "name": f"Unresolved: {exclusion['title']}",
                    "requirement_version_id": exclusion.get("requirement_version_id"),
                    "scope": "Review required",
                    "scenario": "Caller asks about an unresolved policy",
                    "preconditions": "Policy remains unapproved",
                    "example_input": "Fictional caller request",
                    "expected_behavior": "Do not assert a policy; escalate for manual clarification",
                    "fallback": "Manual review",
                    "source_references": [],
                }
            )
        base["cases"] = cases
    return base


def artifact_json(db, row, approved_ids):
    return {
        "id": row.id,
        "kind": row.kind,
        "version": row.version,
        "created_at": row.created_at,
        "exclusions": row.exclusions,
        **artifact_state(db, row, approved_ids),
    }


@router.post("/projects/{project_id}/artifacts/{kind}/generate", status_code=201)
def generate(
    project_id: str,
    kind: Literal["blueprint", "test_plan"],
    data: GenerateInput,
    db: DB,
    user: User,
):
    project = project_access(db, user, project_id)
    db.scalar(select(Project).where(Project.id == project_id).with_for_update())
    if high_conflicts(db, project_id):
        raise HTTPException(409, "Resolve high-priority conflicts before generating outputs")
    approved = approved_set(db, project_id)
    if not approved:
        raise HTTPException(409, "No customer-confirmed, staff-validated requirements are approved")
    approved_ids = {v.id for v in approved}
    exclusions = exclusions_for(db, project_id, approved_ids)
    if exclusions and not data.acknowledge_exclusions:
        raise HTTPException(409, "Acknowledge unresolved issues and exclusions before generating")
    number = (
        db.scalar(
            select(func.max(ArtifactVersion.version)).where(
                ArtifactVersion.project_id == project_id,
                ArtifactVersion.kind == kind,
            )
        )
        or 0
    ) + 1
    structured = build_structured(db, project, kind, number, approved, exclusions)
    row = ArtifactVersion(
        project_id=project_id,
        kind=kind,
        version=number,
        markdown=render_markdown(kind, structured),
        structured=structured,
        exclusions=exclusions,
    )
    db.add(row)
    db.flush()
    for version in approved:
        db.add(
            ArtifactRequirement(
                project_id=project_id, artifact_id=row.id, requirement_version_id=version.id
            )
        )
    record(
        db,
        project_id,
        user,
        "artifact.generated",
        row.id,
        {
            "kind": kind,
            "version": number,
            "approved_count": len(approved),
            "exclusion_count": len(exclusions),
        },
    )
    db.commit()
    return artifact_json(db, row, approved_ids)


@router.get("/projects/{project_id}/artifacts")
def list_artifacts(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    approved_ids = {v.id for v in approved_set(db, project_id)}
    rows = db.scalars(
        select(ArtifactVersion)
        .where(ArtifactVersion.project_id == project_id)
        .order_by(ArtifactVersion.created_at.desc(), ArtifactVersion.id)
    ).all()
    return [artifact_json(db, row, approved_ids) for row in rows]


@router.get("/projects/{project_id}/artifacts/{artifact_id}")
def artifact_detail(project_id: str, artifact_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    row = scoped_object(db, ArtifactVersion, project_id, artifact_id)
    return {
        **artifact_json(db, row, {v.id for v in approved_set(db, project_id)}),
        "structured": row.structured,
        "markdown": row.markdown,
    }


@router.get("/projects/{project_id}/artifacts/{artifact_id}/export/{format}")
def export_artifact(
    project_id: str, artifact_id: str, format: Literal["md", "json"], db: DB, user: User
):
    project_access(db, user, project_id)
    row = scoped_object(db, ArtifactVersion, project_id, artifact_id)
    content = row.markdown if format == "md" else json.dumps(row.structured, indent=2)
    record(
        db,
        project_id,
        user,
        "artifact.exported",
        row.id,
        {"format": format, "version": row.version},
    )
    db.commit()
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8" if format == "md" else "application/json",
        headers={
            # Cache-Control: no-store and X-Content-Type-Options: nosniff come from the middleware.
            "Content-Disposition": f'attachment; filename="{row.kind}-v{row.version}.{format}"',
        },
    )


@router.get("/projects/{project_id}/audit")
def audit_trail(
    project_id: str,
    db: DB,
    user: User,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Who did what and when, newest first: staff decisions, customer replies, artifact exports."""
    project_access(db, user, project_id)
    total = db.scalar(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.project_id == project_id)
    )
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.project_id == project_id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id)
        .offset(offset)
        .limit(limit)
    ).all()
    emails = dict(
        db.execute(
            select(InternalUser.id, InternalUser.email).where(
                InternalUser.id.in_({e.actor_reference for e in events})
            )
        ).all()
    )
    labels = {"customer_link": "customer link (unverified)", "system": "system"}
    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "action": e.action,
                "actor_type": e.actor_type,
                "actor": emails.get(e.actor_reference)
                or labels.get(e.actor_type, e.actor_reference),
                "target_id": e.target_id,
                "detail": e.detail,
                "created_at": e.created_at,
            }
            for e in events
        ],
    }
