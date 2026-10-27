"""Login-free customer review routes. The bearer token is the only credential.

Access is scoped by token to exactly the items selected at send time. The raw token is never
stored or logged by the application: only its SHA-256 hash is looked up. A customer-link actor in
the audit trail is an unverified capability holder, not a verified person.
"""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api import Input
from app.auth import DB
from app.invitations import customer_view, item_locked, now, status
from app.models import (
    AuditEvent,
    CustomerResponseVersion,
    InvitationItem,
    ReviewInvitation,
    ReviewRequestItem,
)
from app.ratelimit import throttle
from app.tokens import hash_token

router = APIRouter(prefix="/api/public", tags=["customer review (public)"])
UNAVAILABLE = "This review link is not available."
WITHDRAWN = (
    "This review link has expired or was withdrawn. Please contact your implementation team."
)


class AnswerIn(Input):
    choice: Annotated[str, Field(max_length=200)] | None = None
    choices: list[Annotated[str, Field(max_length=200)]] | None = Field(default=None, max_length=10)
    text: Annotated[str, Field(max_length=4000)] | None = None
    comment: Annotated[str, Field(max_length=2000)] | None = None
    corrected_statement: Annotated[str, Field(max_length=2000)] | None = None


class ResponseIn(Input):
    item_id: Annotated[str, Field(max_length=36)]
    response_type: Literal["answer", "confirm", "request_correction", "cannot_confirm"]
    answer: AnswerIn = Field(default_factory=AnswerIn)


class SubmitIn(Input):
    # Client-generated retry key: replaying the same submission never creates a second answer.
    submission_id: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")]
    responses: list[ResponseIn] = Field(min_length=1, max_length=50)


def resolve(db, token: str) -> ReviewInvitation:
    invitation = None
    if re.fullmatch(r"[A-Za-z0-9_-]{20,100}", token):
        invitation = db.scalar(
            select(ReviewInvitation).where(ReviewInvitation.token_hash == hash_token(token))
        )
    if invitation is None or status(invitation) == "draft":
        # Guessing is bounded globally; real tokens never reach this limiter.
        throttle(db, "public-invalid-token", 600, 15, "Too many attempts. Try again later.")
        raise HTTPException(404, UNAVAILABLE)
    throttle(db, f"public-token:{invitation.id}", 240, 15, "Too many requests. Try again shortly.")
    if status(invitation) != "active":
        raise HTTPException(410, WITHDRAWN)
    return invitation


def customer_audit(db, invitation, action, target, detail=None):
    db.add(
        AuditEvent(
            project_id=invitation.project_id,
            actor_type="customer_link",
            actor_reference=invitation.id,
            action=action,
            target_id=target,
            detail=detail,
        )
    )


@router.get("/review/{token}")
def view(token: str, response: Response, db: DB):
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    invitation = resolve(db, token)
    if invitation.opened_at is None:
        invitation.opened_at = now()
        customer_audit(db, invitation, "invitation.opened", invitation.id)
        db.commit()
    return customer_view(db, invitation)


def clean_answer(payload, response_type, answer: AnswerIn) -> dict:
    if response_type not in payload["allowed_responses"]:
        raise HTTPException(422, "That response is not available for this item")
    sent = answer.model_fields_set - {"comment"}
    allowed = {
        "answer": {
            "free_text": {"text"},
            "yes_no": {"choice"},
            "single_choice": {"choice"},
            "multiple_choice": {"choices"},
        }.get(payload["answer_type"], set()),
        "request_correction": {"corrected_statement"},
    }.get(response_type, set())
    if sent - allowed:
        raise HTTPException(422, "That answer does not fit this item")
    out = {}
    comment = (answer.comment or "").strip()
    if comment:
        out["comment"] = comment
    if response_type == "answer":
        kind = payload["answer_type"]
        if kind == "free_text":
            text = (answer.text or "").strip()
            if not text:
                raise HTTPException(422, "Please enter an answer")
            out["text"] = text
        elif kind in {"yes_no", "single_choice"}:
            options = ["yes", "no"] if kind == "yes_no" else payload["choices"]
            if answer.choice not in options:
                raise HTTPException(422, "Please choose one of the offered options")
            out["choice"] = answer.choice
        else:
            picked = list(dict.fromkeys(answer.choices or []))
            if not picked or any(c not in payload["choices"] for c in picked):
                raise HTTPException(422, "Please choose from the offered options")
            out["choices"] = picked
    elif response_type == "request_correction":
        corrected = (answer.corrected_statement or "").strip()
        if not corrected and not comment:
            raise HTTPException(422, "Please describe the correction")
        if corrected:
            out["corrected_statement"] = corrected
    return out


def save(db, invitation, data: SubmitIn):
    rows = {
        row.id: row
        for row in db.scalars(
            select(ReviewRequestItem)
            .join(InvitationItem, InvitationItem.item_id == ReviewRequestItem.id)
            .where(InvitationItem.invitation_id == invitation.id)
        )
    }
    ids = [r.item_id for r in data.responses]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "Each item can appear once per submission")
    plan = []
    for response in data.responses:
        row = rows.get(response.item_id)
        if row is None:
            raise HTTPException(422, "Unknown item")
        existing = db.scalar(
            select(CustomerResponseVersion).where(
                CustomerResponseVersion.invitation_id == invitation.id,
                CustomerResponseVersion.item_id == row.id,
                CustomerResponseVersion.submission_id == data.submission_id,
            )
        )
        if existing:
            plan.append((row, existing, True))
            continue
        if item_locked(db, invitation.project_id, row.shared_payload):
            raise HTTPException(
                409, "An item was already confirmed and recorded by the implementation team"
            )
        cleaned = clean_answer(row.shared_payload, response.response_type, response.answer)
        number = (
            db.scalar(
                select(func.max(CustomerResponseVersion.version)).where(
                    CustomerResponseVersion.invitation_id == invitation.id,
                    CustomerResponseVersion.item_id == row.id,
                )
            )
            or 0
        ) + 1
        created = CustomerResponseVersion(
            project_id=invitation.project_id,
            invitation_id=invitation.id,
            item_id=row.id,
            submission_id=data.submission_id,
            version=number,
            response_type=response.response_type,
            answer=cleaned,
        )
        db.add(created)
        db.flush()
        customer_audit(
            db,
            invitation,
            "response.submitted",
            created.id,
            {"item_id": row.id, "version": number, "response_type": response.response_type},
        )
        plan.append((row, created, False))
    db.commit()
    return plan


@router.post("/review/{token}/responses")
def submit(token: str, data: SubmitIn, response: Response, db: DB):
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    invitation = resolve(db, token)
    for attempt in range(3):
        try:
            plan = save(db, invitation, data)
            break
        except IntegrityError:  # a concurrent retry or amendment won the race; re-evaluate
            db.rollback()
            invitation = db.get(ReviewInvitation, invitation.id)
            if attempt == 2:
                raise HTTPException(409, "Please try again") from None
    view_after = customer_view(db, invitation)
    return {
        "saved": [
            {
                "item_id": row.id,
                "version": saved.version,
                "response_type": saved.response_type,
                "duplicate": duplicate,
            }
            for row, saved, duplicate in plan
        ],
        "submitted_at": now(),
        "total": view_after["total"],
        "answered": view_after["answered"],
        "outstanding": view_after["outstanding"],
        "outstanding_items": [
            i["item_id"] for i in view_after["items"] if i["current_response"] is None
        ],
    }
