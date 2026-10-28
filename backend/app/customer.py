"""M3 internal routes: compose, preview, send, revoke and resend review links; response inbox;
staff validation of customer confirmations; revisions after correction requests.

A customer's "confirm" never changes a requirement by itself. A staff member must validate it, and
only validation records the customer confirmation and freezes the version. Staff cannot create a
confirmation without a customer "confirm" response for the exact wording that was shown.
"""

from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import func, select

from app import question_drafts
from app.ai import ProviderError
from app.api import Input, project_access, scoped_object
from app.auth import DB, User
from app.config import settings
from app.conflicts import refresh_conflicts
from app.invitations import (
    CONFIRMATION_NOTE,
    QUESTION_RESPONSES,
    RULE_RESPONSES,
    chain_ids,
    customer_view,
    item_locked,
    latest_response,
    now,
    snapshot_matches,
    snapshot_of,
    status,
    utc,
    words,
)
from app.mailer import get_mailer
from app.models import (
    AuditEvent,
    ClarificationQuestion,
    ConflictGroup,
    ConflictMember,
    CustomerConfirmation,
    CustomerContact,
    CustomerResponseVersion,
    InvitationItem,
    Organization,
    Project,
    Requirement,
    RequirementEvidence,
    RequirementVersion,
    ReviewInvitation,
    ReviewRequest,
    ReviewRequestItem,
    SourceDocument,
    SourceVersion,
    StaffReview,
)
from app.review import candidate_response, lock_candidate, record, scope_names
from app.tokens import hash_token, new_token

router = APIRouter(prefix="/api", tags=["customer review (internal)"])


class ItemInput(Input):
    kind: Literal["confirm_rule", "question"]
    requirement_version_id: str | None = None
    conflict_id: str | None = None
    question: Annotated[str, Field(max_length=1000)] = ""
    answer_type: Literal["free_text", "yes_no", "single_choice", "multiple_choice"] = "free_text"
    choices: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(
        default_factory=list, max_length=10
    )
    excerpt_evidence_ids: list[str] = Field(default_factory=list, max_length=5)


class RequestInput(Input):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    contact_id: str
    message: Annotated[str, Field(max_length=2000)] = ""
    expires_in_days: int | None = Field(default=None, ge=1, le=30)
    items: list[ItemInput] = Field(min_length=1, max_length=25)


class SendInput(Input):
    deliver_email: bool = True


class ReviewResponseInput(Input):
    decision: Literal["validate_confirmation", "reject_confirmation", "acknowledge"]
    rationale: Annotated[str, Field(max_length=2000)] = ""


class ReviseInput(Input):
    response_id: str
    statement: Annotated[str, Field(min_length=1, max_length=2000)] | None = None


class SuggestQuestionInput(Input):
    conflict_id: str | None = None
    requirement_version_id: str | None = None
    acknowledge_external_processing: bool = False


def base_url() -> str:
    return (settings.public_base_url or settings.app_origin).rstrip("/")


def invitation_json(db, invitation, contact=None):
    contact = contact or db.get(CustomerContact, invitation.contact_id)
    ids = chain_ids(db, invitation)
    items = db.scalars(
        select(InvitationItem.item_id).where(InvitationItem.invitation_id == invitation.id)
    ).all()
    answered = sum(latest_response(db, ids, item_id) is not None for item_id in items)
    return {
        "id": invitation.id,
        "request_id": invitation.request_id,
        "status": status(invitation),
        "contact": {"id": contact.id, "name": contact.name, "email": contact.email},
        "expires_at": invitation.expires_at,
        "activated_at": invitation.activated_at,
        "revoked_at": invitation.revoked_at,
        "opened_at": invitation.opened_at,
        "sent_at": invitation.sent_at,
        "delivery_state": invitation.delivery_state,
        "delivery_error": invitation.delivery_error,
        "replaces_id": invitation.replaces_id,
        "items": len(items),
        "answered": answered,
    }


# ---------------------------------------------------------------- composing


def suggestion_rule(db, project_id, version_id, names):
    version = scoped_object(db, RequirementVersion, project_id, version_id)
    if version.evidence_status != "verified" or version.staff_review_state in {
        "rejected",
        "duplicate",
        "merged",
    }:
        raise HTTPException(
            422, "Only a live candidate with verified evidence can inform a question"
        )
    quotes = db.scalars(
        select(RequirementEvidence)
        .where(
            RequirementEvidence.project_id == project_id,
            RequirementEvidence.requirement_version_id == version_id,
            RequirementEvidence.quote_match_state.in_(("exact", "normalized")),
        )
        .order_by(RequirementEvidence.id)
        .limit(2)
    ).all()
    if not quotes:
        raise HTTPException(422, "No verified excerpt is available for this candidate")
    scope_id = version.property_id or version.portfolio_id
    return {
        "statement": version.statement[:800],
        "scope": "Company-wide" if version.scope_type == "company" else names.get(scope_id),
        "conditions": (version.conditions or [])[:5],
        "verified_excerpts": [quote.quoted_text[:350] for quote in quotes],
    }


@router.post("/projects/{project_id}/question-suggestions")
def suggest_clarification(project_id: str, data: SuggestQuestionInput, db: DB, user: User):
    """Suggest editable wording; this neither creates a review request nor sends a link."""
    project_access(db, user, project_id)
    if bool(data.conflict_id) == bool(data.requirement_version_id):
        raise HTTPException(422, "Select exactly one conflict or candidate")
    if not settings.ai_api_key:
        raise HTTPException(503, "Live AI question drafting is not configured")
    if not data.acknowledge_external_processing:
        raise HTTPException(422, "Acknowledge external AI processing before drafting")

    names = scope_names(db, project_id)
    if data.conflict_id:
        group = scoped_object(db, ConflictGroup, project_id, data.conflict_id)
        if group.kind not in {"conflict", "gap"} or group.triage_state in {
            "obsolete",
            "dismissed",
        }:
            raise HTTPException(422, "This suggestion is not an active clarification target")
        ids = db.scalars(
            select(ConflictMember.requirement_version_id)
            .where(ConflictMember.project_id == project_id, ConflictMember.conflict_id == group.id)
            .limit(5)
        ).all()
        if not ids:
            raise HTTPException(422, "This suggestion has no candidate rules")
        context = {
            "kind": group.kind,
            "title": (group.title or "Clarification")[:300],
            "scope_intersection": group.scope_intersection,
            "rules": [suggestion_rule(db, project_id, version_id, names) for version_id in ids],
        }
        target_id = group.id
    else:
        context = {
            "kind": "candidate",
            "rules": [suggestion_rule(db, project_id, data.requirement_version_id, names)],
        }
        target_id = data.requirement_version_id

    # Release the read transaction before waiting on a third-party network call.
    db.rollback()
    try:
        suggestion = question_drafts.suggest_question(context)
    except ProviderError as error:
        raise HTTPException(
            503 if error.code == "provider_not_configured" else 502,
            f"AI question drafting failed ({error.code})",
        ) from None
    record(
        db,
        project_id,
        user,
        "clarification.suggested",
        target_id,
        {"model": settings.ai_model, "target_kind": context["kind"]},
    )
    db.commit()
    return {
        "question": suggestion.question,
        "answer_type": "free_text",
        "conflict_id": data.conflict_id,
        "requirement_version_id": data.requirement_version_id,
        "model": settings.ai_model,
        "review_required": True,
    }


def eligible_rule(db, project_id, version_id):
    version = db.scalar(
        select(RequirementVersion).where(
            RequirementVersion.id == version_id, RequirementVersion.project_id == project_id
        )
    )
    if version is None:
        raise HTTPException(404, "Record not found")
    problems = []
    if version.staff_review_state != "accepted":
        problems.append("it has not been accepted for customer review")
    if version.customer_confirmation_state != "not_confirmed":
        problems.append("it already has a recorded customer confirmation")
    if version.evidence_status != "verified":
        problems.append("its evidence is not fully verified")
    if not version.scope_reviewed:
        problems.append("its scope is not confirmed")
    if db.scalar(
        select(CustomerConfirmation.id).where(
            CustomerConfirmation.project_id == project_id,
            CustomerConfirmation.requirement_version_id == version_id,
        )
    ):
        problems.append("a confirmation is already recorded")
    if problems:
        raise HTTPException(
            422, "This candidate cannot be sent for confirmation: " + "; ".join(problems)
        )
    return version


def build_item(db, project_id, item, position, names, seen):
    payload = {"position": position, "excerpts": []}
    version = None
    if item.kind == "confirm_rule":
        if not item.requirement_version_id:
            raise HTTPException(422, "A rule confirmation needs a requirement")
        if item.requirement_version_id in seen:
            raise HTTPException(422, "A requirement can appear only once in a request")
        seen.add(item.requirement_version_id)
        version = eligible_rule(db, project_id, item.requirement_version_id)
        title = db.scalar(select(Requirement.title).where(Requirement.id == version.requirement_id))
        scope_id = version.property_id or version.portfolio_id
        payload.update(
            kind="confirm_rule",
            question=item.question.strip() or "Is this rule correct as written?",
            answer_type="confirm",
            choices=[],
            allowed_responses=RULE_RESPONSES,
            requirement_version_id=version.id,
            snapshot=snapshot_of(version),
            proposed_rule={
                "title": title,
                "statement": version.statement,
                "scope": "Company-wide" if version.scope_type == "company" else names.get(scope_id),
                "conditions": [words(c) for c in version.conditions or []],
                "action": words(version.proposed_action) if version.proposed_action else None,
            },
        )
    else:
        if not item.question.strip():
            raise HTTPException(422, "A question needs its text")
        if item.answer_type in {"single_choice", "multiple_choice"} and len(item.choices) < 2:
            raise HTTPException(422, "Choice questions need at least two choices")
        if item.answer_type in {"free_text", "yes_no"} and item.choices:
            raise HTTPException(422, "Only choice questions take choices")
        if item.requirement_version_id:
            version = scoped_object(db, RequirementVersion, project_id, item.requirement_version_id)
        if item.conflict_id:
            group = scoped_object(db, ConflictGroup, project_id, item.conflict_id)
            if group.triage_state == "obsolete":
                raise HTTPException(422, "That suggestion is out of date")
        payload.update(
            kind="question",
            question=item.question.strip(),
            answer_type=item.answer_type,
            choices=item.choices,
            allowed_responses=QUESTION_RESPONSES,
            requirement_version_id=item.requirement_version_id,
            proposed_rule=None,
        )
    if item.excerpt_evidence_ids:
        if version is None:
            raise HTTPException(422, "Excerpts must come from a linked requirement")
        rows = db.execute(
            select(RequirementEvidence, SourceDocument.name)
            .join(SourceVersion, SourceVersion.id == RequirementEvidence.source_version_id)
            .join(SourceDocument, SourceDocument.id == SourceVersion.document_id)
            .where(
                RequirementEvidence.project_id == project_id,
                RequirementEvidence.requirement_version_id == version.id,
                RequirementEvidence.id.in_(item.excerpt_evidence_ids),
                RequirementEvidence.quote_match_state.in_(("exact", "normalized")),
            )
        ).all()
        if len(rows) != len(set(item.excerpt_evidence_ids)):
            raise HTTPException(422, "Excerpts must be verified evidence of the linked requirement")
        payload["excerpts"] = [{"text": e.quoted_text, "source": name} for e, name in rows]
    return payload


@router.post("/projects/{project_id}/review-requests", status_code=201)
def create_request(project_id: str, data: RequestInput, db: DB, user: User):
    project_access(db, user, project_id)
    contact = scoped_object(db, CustomerContact, project_id, data.contact_id)
    names, seen = scope_names(db, project_id), set()
    payloads = [build_item(db, project_id, i, n, names, seen) for n, i in enumerate(data.items)]
    request = ReviewRequest(
        project_id=project_id,
        title=data.title,
        message=data.message.strip() or None,
        created_by=user.id,
    )
    db.add(request)
    db.flush()
    item_ids = []
    for item, payload in zip(data.items, payloads):
        question = ClarificationQuestion(
            project_id=project_id,
            requirement_version_id=payload["requirement_version_id"],
            text=payload["question"],
            answer_type=payload["answer_type"],
            choices=payload["choices"],
            conflict_id=item.conflict_id,
        )
        db.add(question)
        db.flush()
        row = ReviewRequestItem(
            project_id=project_id,
            request_id=request.id,
            question_id=question.id,
            shared_payload=payload,
        )
        db.add(row)
        db.flush()
        item_ids.append(row.id)
    days = data.expires_in_days or settings.invitation_default_days
    created = now()
    invitation = ReviewInvitation(
        project_id=project_id,
        request_id=request.id,
        contact_id=contact.id,
        token_hash=hash_token(new_token()[0]),  # placeholder: no link exists until it is sent
        created_at=created,
        expires_at=created + timedelta(days=days),
        created_by=user.id,
    )
    db.add(invitation)
    db.flush()
    for item_id in item_ids:
        db.add(
            InvitationItem(
                project_id=project_id,
                request_id=request.id,
                invitation_id=invitation.id,
                item_id=item_id,
            )
        )
    record(db, project_id, user, "review_request.drafted", request.id, {"items": len(item_ids)})
    db.commit()
    return {
        "request_id": request.id,
        "invitation": invitation_json(db, invitation, contact),
        "preview": customer_view(db, invitation, preview=True),
    }


def get_invitation(db, project_id, request_id, invitation_id, *, lock=False):
    query = select(ReviewInvitation).where(
        ReviewInvitation.id == invitation_id,
        ReviewInvitation.request_id == request_id,
        ReviewInvitation.project_id == project_id,
    )
    invitation = db.scalar(query.with_for_update() if lock else query)
    if invitation is None:
        raise HTTPException(404, "Record not found")
    return invitation


@router.get(
    "/projects/{project_id}/review-requests/{request_id}/invitations/{invitation_id}/preview"
)
def preview(project_id: str, request_id: str, invitation_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    invitation = get_invitation(db, project_id, request_id, invitation_id)
    return customer_view(db, invitation, preview=True)


# ---------------------------------------------------------------- sending


def email_text(db, invitation, link):
    project = db.get(Project, invitation.project_id)
    organization = db.get(Organization, project.organization_id)
    contact = db.get(CustomerContact, invitation.contact_id)
    request = db.get(ReviewRequest, invitation.request_id)
    count = db.scalar(
        select(func.count())
        .select_from(InvitationItem)
        .where(InvitationItem.invitation_id == invitation.id)
    )
    title = " ".join(request.title.split())
    body = (
        f"Hello {contact.name},\n\n"
        f"The implementation team working with {organization.name} has asked you to review "
        f"{count} item(s) for: {title}.\n\n"
        f"Your private review link (valid until {utc(invitation.expires_at):%Y-%m-%d %H:%M} UTC):\n"
        f"{link}\n\n"
        "The link is personal. Please do not forward it. If you did not expect this message, "
        "you can ignore it.\n"
    )
    return f"Review request: {title}"[:150], body


def activate_and_deliver(db, user, invitation, deliver_email, mailer):
    contact = db.get(CustomerContact, invitation.contact_id)
    for row in db.scalars(
        select(ReviewRequestItem)
        .join(InvitationItem, InvitationItem.item_id == ReviewRequestItem.id)
        .where(InvitationItem.invitation_id == invitation.id)
    ):
        payload = row.shared_payload
        if payload["kind"] != "confirm_rule" or item_locked(db, invitation.project_id, payload):
            continue  # already-confirmed rules carry over to a resent link as locked items
        version = eligible_rule(db, invitation.project_id, payload["requirement_version_id"])
        if not snapshot_matches(version, payload):
            raise HTTPException(
                409,
                f"The wording of “{payload['proposed_rule']['title']}” changed after this draft "
                "was composed. Discard the draft and compose it again.",
            )
    token, digest = new_token()
    span = utc(invitation.expires_at) - utc(invitation.created_at)
    invitation.token_hash, invitation.activated_at = digest, now()
    invitation.expires_at = invitation.activated_at + span
    invitation.delivery_state, invitation.delivery_error = "not_sent", None
    link = f"{base_url()}/review/{token}"
    record(db, invitation.project_id, user, "invitation.activated", invitation.id)
    db.commit()
    if not deliver_email:
        invitation.delivery_state = "link_only"
        note = "No email was sent. Copy the link and share it through a channel you trust."
    else:
        subject, body = email_text(db, invitation, link)
        state, error = mailer(contact.email, subject, body)
        invitation.delivery_state, invitation.delivery_error = state, error
        if state == "smtp_accepted":
            invitation.sent_at = now()
            note = (
                "The SMTP server accepted the message. This does not confirm that it reached the "
                "inbox; copy the link as a fallback if needed."
            )
        else:
            note = "Email delivery failed. Copy the link and share it through a channel you trust."
    record(
        db,
        invitation.project_id,
        user,
        "invitation.delivery_recorded",
        invitation.id,
        {"delivery_state": invitation.delivery_state, "error": invitation.delivery_error},
    )
    db.commit()
    return {
        "invitation": invitation_json(db, invitation, contact),
        "link": link,  # shown once; only its hash is stored
        "delivery_note": note,
    }


@router.post("/projects/{project_id}/review-requests/{request_id}/invitations/{invitation_id}/send")
def send_invitation(
    project_id: str,
    request_id: str,
    invitation_id: str,
    data: SendInput,
    db: DB,
    user: User,
    mailer=Depends(get_mailer),
):
    project_access(db, user, project_id)
    invitation = get_invitation(db, project_id, request_id, invitation_id, lock=True)
    if invitation.revoked or invitation.activated_at is not None:
        raise HTTPException(409, "Only a draft can be sent; use resend for a fresh link")
    return activate_and_deliver(db, user, invitation, data.deliver_email, mailer)


@router.post(
    "/projects/{project_id}/review-requests/{request_id}/invitations/{invitation_id}/revoke"
)
def revoke_invitation(project_id: str, request_id: str, invitation_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    invitation = get_invitation(db, project_id, request_id, invitation_id, lock=True)
    if not invitation.revoked:
        invitation.revoked, invitation.revoked_at = True, now()
        record(db, project_id, user, "invitation.revoked", invitation.id)
        db.commit()
    return invitation_json(db, invitation)


@router.post(
    "/projects/{project_id}/review-requests/{request_id}/invitations/{invitation_id}/resend"
)
def resend_invitation(
    project_id: str,
    request_id: str,
    invitation_id: str,
    data: SendInput,
    db: DB,
    user: User,
    mailer=Depends(get_mailer),
):
    """Issue a fresh link and invalidate the old one in the same transaction."""
    project_access(db, user, project_id)
    old = get_invitation(db, project_id, request_id, invitation_id, lock=True)
    if old.activated_at is None:
        raise HTTPException(409, "Send the draft first")
    created = now()
    fresh = ReviewInvitation(
        project_id=project_id,
        request_id=old.request_id,
        contact_id=old.contact_id,
        token_hash=hash_token(new_token()[0]),
        created_at=created,
        expires_at=created + timedelta(days=settings.invitation_default_days),
        replaces_id=old.id,
        created_by=user.id,
    )
    db.add(fresh)
    db.flush()
    for item_id in db.scalars(
        select(InvitationItem.item_id).where(InvitationItem.invitation_id == old.id)
    ).all():
        db.add(
            InvitationItem(
                project_id=project_id,
                request_id=old.request_id,
                invitation_id=fresh.id,
                item_id=item_id,
            )
        )
    if not old.revoked:
        old.revoked, old.revoked_at = True, created
        record(db, project_id, user, "invitation.revoked", old.id, {"reason": "resent"})
    db.flush()
    return activate_and_deliver(db, user, fresh, data.deliver_email, mailer)


@router.get("/projects/{project_id}/review-requests")
def review_requests(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    result = []
    for request in db.scalars(
        select(ReviewRequest)
        .where(ReviewRequest.project_id == project_id)
        .order_by(ReviewRequest.created_at.desc())
        .limit(100)
    ):
        invitations = db.scalars(
            select(ReviewInvitation)
            .where(ReviewInvitation.request_id == request.id)
            .order_by(ReviewInvitation.created_at.desc())
        ).all()
        result.append(
            {
                "id": request.id,
                "title": request.title,
                "created_at": request.created_at,
                "invitations": [invitation_json(db, i) for i in invitations],
            }
        )
    return result


# ---------------------------------------------------------------- inbox and validation


def response_state(db, response):
    review = db.scalar(
        select(StaffReview)
        .where(StaffReview.response_id == response.id)
        .order_by(StaffReview.created_at.desc())
        .limit(1)
    )
    if review and review.decision in {"confirmation_validated", "confirmation_rejected"}:
        return review.decision
    acknowledged = db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.target_id == response.id, AuditEvent.action == "response.acknowledged"
        )
    )
    return "acknowledged" if acknowledged else "awaiting_staff_review"


NEXT_ACTIONS = {
    "confirm": "Validate the confirmation or reject it with a reason.",
    "request_correction": "Revise the requirement from the correction, then request fresh confirmation.",
    "cannot_confirm": "Follow up with the customer or acknowledge.",
    "answer": "Use the answer to update the requirement, then acknowledge.",
}


@router.get("/projects/{project_id}/responses")
def inbox(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    rows = db.execute(
        select(
            CustomerResponseVersion,
            ReviewInvitation,
            ReviewRequest,
            ReviewRequestItem,
            CustomerContact,
        )
        .join(ReviewInvitation, ReviewInvitation.id == CustomerResponseVersion.invitation_id)
        .join(ReviewRequest, ReviewRequest.id == ReviewInvitation.request_id)
        .join(ReviewRequestItem, ReviewRequestItem.id == CustomerResponseVersion.item_id)
        .join(CustomerContact, CustomerContact.id == ReviewInvitation.contact_id)
        .where(CustomerResponseVersion.project_id == project_id)
        .order_by(CustomerResponseVersion.created_at.desc())
        .limit(1000)
    ).all()
    by_key = {}
    for response, invitation, request, item, contact in rows:
        by_key.setdefault((response.invitation_id, response.item_id), []).append(
            (response, invitation, request, item, contact)
        )
    result = []
    for versions in by_key.values():
        versions.sort(key=lambda r: r[0].version, reverse=True)
        response, invitation, request, item, contact = versions[0]
        prior = versions[1][0] if len(versions) > 1 else None
        payload = item.shared_payload
        version = (
            db.get(RequirementVersion, payload["requirement_version_id"])
            if payload.get("requirement_version_id")
            else None
        )
        result.append(
            {
                "response_id": response.id,
                "request_title": request.title,
                "invitation_id": invitation.id,
                "invitation_status": status(invitation),
                "recipient": {"name": contact.name, "email": contact.email, "verified": False},
                "received_at": response.created_at,
                "version": response.version,
                "question": payload["question"],
                "kind": payload["kind"],
                "proposed_statement": (payload.get("proposed_rule") or {}).get("statement"),
                "requirement_version_id": payload.get("requirement_version_id"),
                "requirement_title": (payload.get("proposed_rule") or {}).get("title"),
                "response_type": response.response_type,
                "answer": response.answer,
                "previous": (
                    {
                        "response_type": prior.response_type,
                        "answer": prior.answer,
                        "version": prior.version,
                    }
                    if prior
                    else None
                ),
                "state": response_state(db, response),
                "wording_changed": bool(version and not snapshot_matches(version, payload)),
                "locked": item_locked(db, project_id, payload),
                "revised": bool(
                    version
                    and db.scalar(
                        select(RequirementVersion.id).where(
                            RequirementVersion.supersedes_id == version.id
                        )
                    )
                ),
                "next_action": (
                    NEXT_ACTIONS[response.response_type]
                    if response_state(db, response) == "awaiting_staff_review"
                    else None
                ),
                "confirmation_note": CONFIRMATION_NOTE,
            }
        )
    result.sort(key=lambda r: r["received_at"], reverse=True)
    return result


@router.post("/projects/{project_id}/responses/{response_id}/review")
def review_response(
    project_id: str, response_id: str, data: ReviewResponseInput, db: DB, user: User
):
    project_access(db, user, project_id)
    response = scoped_object(db, CustomerResponseVersion, project_id, response_id)
    newer = db.scalar(
        select(CustomerResponseVersion.id).where(
            CustomerResponseVersion.invitation_id == response.invitation_id,
            CustomerResponseVersion.item_id == response.item_id,
            CustomerResponseVersion.version > response.version,
        )
    )
    if newer:
        raise HTTPException(409, "The customer has since amended this response")
    item = scoped_object(db, ReviewRequestItem, project_id, response.item_id)
    payload = item.shared_payload
    if data.decision == "acknowledge":
        record(
            db,
            project_id,
            user,
            "response.acknowledged",
            response.id,
            {"note": data.rationale or None},
        )
        db.commit()
        return {"response_id": response.id, "state": "acknowledged"}
    if response.response_type != "confirm" or payload["kind"] != "confirm_rule":
        raise HTTPException(
            409, "Only a customer's confirmation of a proposed rule can be validated"
        )
    version = lock_candidate(db, project_id, payload["requirement_version_id"])
    if data.decision == "reject_confirmation":
        if not data.rationale.strip():
            raise HTTPException(422, "A reason is required to reject a confirmation")
        decision = "confirmation_rejected"
    else:
        if version.customer_confirmation_state != "not_confirmed":
            raise HTTPException(409, "A confirmation is already recorded for this requirement")
        if version.staff_review_state != "accepted":
            raise HTTPException(409, "The candidate is no longer accepted for customer review")
        if not snapshot_matches(version, payload):
            raise HTTPException(
                409,
                "The requirement changed after it was sent; the customer confirmed older wording. "
                "Send a fresh confirmation request.",
            )
        decision = "confirmation_validated"
        db.add(
            CustomerConfirmation(
                project_id=project_id,
                requirement_version_id=version.id,
                response_id=response.id,
                confirmed_statement=payload["snapshot"]["statement"],
            )
        )
        db.flush()
        version.customer_confirmation_state = "confirmed"  # freezes the version (DB trigger)
    db.add(
        StaffReview(
            project_id=project_id,
            requirement_version_id=version.id,
            reviewer_id=user.id,
            decision=decision,
            rationale=data.rationale,
            response_id=response.id,
        )
    )
    record(
        db,
        project_id,
        user,
        "confirmation." + decision.split("_")[1],
        response.id,
        {
            "requirement_version_id": version.id,
            "note": CONFIRMATION_NOTE,
            "rationale": data.rationale or None,
        },
    )
    db.commit()
    return {"response_id": response.id, "state": decision}


@router.post("/projects/{project_id}/requirements/{version_id}/revise", status_code=201)
def revise_from_correction(project_id: str, version_id: str, data: ReviseInput, db: DB, user: User):
    """Create a new proposed revision from a customer's correction. It needs fresh confirmation."""
    project_access(db, user, project_id)
    old = lock_candidate(db, project_id, version_id)
    response = scoped_object(db, CustomerResponseVersion, project_id, data.response_id)
    item = scoped_object(db, ReviewRequestItem, project_id, response.item_id)
    if (
        response.response_type != "request_correction"
        or item.shared_payload.get("requirement_version_id") != old.id
    ):
        raise HTTPException(409, "That response is not a correction request for this requirement")
    if db.scalar(
        select(CustomerResponseVersion.id).where(
            CustomerResponseVersion.invitation_id == response.invitation_id,
            CustomerResponseVersion.item_id == response.item_id,
            CustomerResponseVersion.version > response.version,
        )
    ):
        raise HTTPException(409, "The customer has since amended this response")
    if old.customer_confirmation_state != "not_confirmed":
        raise HTTPException(409, "Confirmed revisions are immutable")
    if db.scalar(select(RequirementVersion.id).where(RequirementVersion.supersedes_id == old.id)):
        raise HTTPException(409, "This requirement was already revised")
    statement = (data.statement or response.answer.get("corrected_statement") or "").strip()
    if not statement:
        raise HTTPException(422, "The customer gave no corrected wording; provide the statement")
    number = db.scalar(
        select(func.max(RequirementVersion.version)).where(
            RequirementVersion.requirement_id == old.requirement_id
        )
    )
    new = RequirementVersion(
        project_id=project_id,
        requirement_id=old.requirement_id,
        version=number + 1,
        supersedes_id=old.id,
        category=old.category,
        statement=statement,
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
        select(RequirementEvidence).where(RequirementEvidence.requirement_version_id == old.id)
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
    old.staff_review_state = "rejected"
    db.add(
        StaffReview(
            project_id=project_id,
            requirement_version_id=old.id,
            reviewer_id=user.id,
            decision="candidate_superseded",
            rationale=f"Superseded by version {new.version} after a customer correction request",
            response_id=response.id,
        )
    )
    record(
        db,
        project_id,
        user,
        "candidate.revised",
        new.id,
        {"supersedes": old.id, "response_id": response.id},
    )
    db.flush()
    refresh_conflicts(db, project_id)
    db.commit()
    return candidate_response(db, project_id, new.id)
