"""Invitation lifecycle and the exact customer-visible payload.

The same `customer_view` serves the staff preview and the public page, so staff preview what the
customer will actually receive. It is built only from the frozen item snapshots chosen at
composition time, never from live project data.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.models import (
    ClarificationQuestion,
    CustomerConfirmation,
    CustomerContact,
    CustomerResponseVersion,
    InvitationItem,
    Organization,
    Project,
    ReviewInvitation,
    ReviewRequest,
    ReviewRequestItem,
)

RULE_RESPONSES = ["confirm", "request_correction", "cannot_confirm"]
QUESTION_RESPONSES = ["answer", "cannot_confirm"]
CONFIRMATION_NOTE = "Confirmed via bearer review link; recipient identity not verified."


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def words(value):
    return (value or "").replace("_", " ")


def status(invitation) -> str:
    if invitation.revoked:
        return "revoked"
    if invitation.activated_at is None:
        return "draft"
    if utc(invitation.expires_at) <= now():
        return "expired"
    return "active"


def chain_ids(db, invitation) -> list[str]:
    """This invitation plus any it replaced, so a resent link shows earlier answers."""
    ids, current = [invitation.id], invitation
    while current.replaces_id and len(ids) < 20:
        current = db.get(ReviewInvitation, current.replaces_id)
        if current is None:
            break
        ids.append(current.id)
    return ids


def snapshot_of(version) -> dict:
    return {
        "statement": version.statement,
        "scope_type": version.scope_type,
        "property_id": version.property_id,
        "portfolio_id": version.portfolio_id,
        "conditions": sorted(version.conditions or []),
        "proposed_action": version.proposed_action,
    }


def snapshot_matches(version, payload) -> bool:
    return snapshot_of(version) == (payload or {}).get("snapshot")


def latest_response(db, invitation_ids, item_id):
    return db.scalar(
        select(CustomerResponseVersion)
        .where(
            CustomerResponseVersion.invitation_id.in_(invitation_ids),
            CustomerResponseVersion.item_id == item_id,
        )
        .order_by(CustomerResponseVersion.created_at.desc(), CustomerResponseVersion.version.desc())
        .limit(1)
    )


def item_locked(db, project_id, payload) -> bool:
    version_id = (payload or {}).get("requirement_version_id")
    if (payload or {}).get("kind") != "confirm_rule" or not version_id:
        return False
    return (
        db.scalar(
            select(CustomerConfirmation.id).where(
                CustomerConfirmation.project_id == project_id,
                CustomerConfirmation.requirement_version_id == version_id,
            )
        )
        is not None
    )


def open_invitation_lock(db, project_id, version_id):
    """An active invitation freezes the wording a customer was asked to confirm."""
    return db.scalar(
        select(ReviewInvitation.id)
        .join(InvitationItem, InvitationItem.invitation_id == ReviewInvitation.id)
        .join(ReviewRequestItem, ReviewRequestItem.id == InvitationItem.item_id)
        .join(ClarificationQuestion, ClarificationQuestion.id == ReviewRequestItem.question_id)
        .where(
            ReviewInvitation.project_id == project_id,
            ClarificationQuestion.requirement_version_id == version_id,
            ClarificationQuestion.answer_type == "confirm",
            ReviewInvitation.revoked.is_(False),
            ReviewInvitation.activated_at.is_not(None),
            ReviewInvitation.expires_at > now(),
        )
        .limit(1)
    )


PUBLIC_RULE_KEYS = ("title", "statement", "scope", "conditions", "action")


def customer_view(db, invitation, *, preview=False) -> dict:
    """Everything a token holder may see. No internal ids, project data or staff annotations."""
    request = db.get(ReviewRequest, invitation.request_id)
    project = db.get(Project, invitation.project_id)
    organization = db.get(Organization, project.organization_id)
    contact = db.get(CustomerContact, invitation.contact_id)
    rows = db.scalars(
        select(ReviewRequestItem)
        .join(InvitationItem, InvitationItem.item_id == ReviewRequestItem.id)
        .where(InvitationItem.invitation_id == invitation.id)
    ).all()
    rows.sort(key=lambda r: r.shared_payload.get("position", 0))
    ids = chain_ids(db, invitation)
    items, answered = [], 0
    for row in rows:
        payload = row.shared_payload
        latest = latest_response(db, ids, row.id)
        answered += latest is not None
        rule = payload.get("proposed_rule")
        items.append(
            {
                "item_id": row.id,
                "kind": payload["kind"],
                "question": payload["question"],
                "answer_type": payload["answer_type"],
                "choices": payload.get("choices", []),
                "proposed_rule": {k: rule[k] for k in PUBLIC_RULE_KEYS} if rule else None,
                "excerpts": [
                    {"text": e["text"], "source": e["source"]} for e in payload.get("excerpts", [])
                ],
                "allowed_responses": payload["allowed_responses"],
                "locked": item_locked(db, invitation.project_id, payload),
                "current_response": (
                    {
                        "response_type": latest.response_type,
                        "answer": latest.answer,
                        "version": latest.version,
                        "submitted_at": latest.created_at,
                    }
                    if latest
                    else None
                ),
            }
        )
    return {
        "preview": preview,
        "organization": organization.name,
        "sender": "Implementation team",
        "recipient": {"name": contact.name, "role": contact.role},
        "title": request.title,
        "message": request.message,
        "expires_at": invitation.expires_at,
        "status": status(invitation),
        "total": len(items),
        "answered": answered,
        "outstanding": len(items) - answered,
        "items": items,
        "notice": (
            "Your answers are recorded for the implementation team. This link is not a verified "
            "signature; please do not forward it."
        ),
    }
