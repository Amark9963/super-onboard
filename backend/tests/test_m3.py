"""M3: composer, scoped hashed links, email states, public responses, confirmation workflow."""

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app import mailer, main
from app.mailer import get_mailer
from app.models import (
    AuditEvent,
    CustomerConfirmation,
    CustomerResponseVersion,
    LoginThrottle,
    RequirementVersion,
    ReviewInvitation,
    StaffReview,
)
from app.ratelimit import throttle
from tests.support import PID, call, post, sign_in


class Outbox:
    def __init__(self):
        self.sent = []
        self.result = ("smtp_accepted", None)

    def __call__(self, to, subject, body):
        self.sent.append((to, subject, body))
        return self.result


@pytest.fixture
def outbox(client):
    box = Outbox()
    main.app.dependency_overrides[get_mailer] = lambda: box
    return box


@pytest.fixture
def anon(client):
    """A browser with no cookies: the customer."""
    return TestClient(main.app)


class Flow:
    def __init__(self, staff):
        self.staff = staff
        self.base = f"/api/projects/{PID}/review-requests"

    def contact(self):
        return self.staff.req("GET", f"/api/projects/{PID}/contacts").json()[0]["id"]

    def accept(self, topic, scope, action):
        item = self.staff.find(topic, scope, action)
        response = self.staff.req(
            "POST", self.staff.path(item["id"], "/accept"), {"confirm_scope": True}
        )
        assert response.status_code == 200, response.text
        return item

    def compose(self, items, **extra):
        payload = {"title": "Fictional review", "contact_id": self.contact(), "items": items}
        return self.staff.req("POST", self.base, {**payload, **extra})

    def send(self, created, **body):
        path = f"{self.base}/{created['request_id']}/invitations/{created['invitation']['id']}"
        return self.staff.req("POST", path + "/send", body)

    def action(self, request_id, invitation_id, name, body=None):
        return self.staff.req(
            "POST", f"{self.base}/{request_id}/invitations/{invitation_id}/{name}", body or {}
        )

    def rule(self, item, **extra):
        return {"kind": "confirm_rule", "requirement_version_id": item["id"], **extra}

    def live(self, items, **extra):
        created = self.compose(items, **extra)
        assert created.status_code == 201, created.text
        sent = self.send(created.json())
        assert sent.status_code == 200, sent.text
        return created.json(), sent.json(), sent.json()["link"].rsplit("/", 1)[1]


@pytest.fixture
def flow(staff, outbox):
    staff.extract()
    return Flow(staff)


def respond(
    anon, token, item_id, response_type="confirm", answer=None, submission="submission-0001"
):
    return anon.post(
        f"/api/public/review/{token}/responses",
        json={
            "submission_id": submission,
            "responses": [
                {"item_id": item_id, "response_type": response_type, "answer": answer or {}}
            ],
        },
    )


def count(staff, model, *where):
    with staff.factory() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


# ---------------------------------------------------------------------------- composer


def test_composer_requires_accepted_verified_candidates_and_exact_excerpts(flow):
    staff = flow.staff
    pet = staff.find("pet_policy", "Aster House", "allow_2_cat")
    pending = flow.compose([flow.rule(pet)])
    assert pending.status_code == 422 and "not been accepted" in pending.text
    flow.accept("pet_policy", "Aster House", "allow_2_cat")
    other = staff.find("pet_policy", "Birch Court", "allow_1_cat")
    foreign_evidence = staff.detail(other["id"])["evidence"][0]["id"]
    assert (
        flow.compose([flow.rule(pet, excerpt_evidence_ids=[foreign_evidence])]).status_code == 422
    )
    evidence = staff.detail(pet["id"])["evidence"][0]
    created = flow.compose(
        [flow.rule(pet, excerpt_evidence_ids=[evidence["id"]])], message="Fictional note"
    )
    assert created.status_code == 201, created.text
    preview = created.json()["preview"]
    assert preview["preview"] is True and preview["status"] == "draft" and preview["total"] == 1
    item = preview["items"][0]
    assert item["proposed_rule"]["statement"] == pet["statement"]
    assert item["excerpts"] == [{"text": evidence["quoted_text"], "source": "Aster House policy"}]
    assert item["allowed_responses"] == ["confirm", "request_correction", "cannot_confirm"]
    dump = json.dumps(preview)
    for hidden in (
        PID,
        pet["id"],
        evidence["id"],
        "ai_proposal",
        "specialist@example.invalid",
        "SIMULATED",
    ):
        assert hidden not in dump  # the customer payload carries no internal ids or annotations
    assert flow.compose([flow.rule(pet), flow.rule(pet)]).status_code == 422  # one entry per rule
    assert flow.compose([{"kind": "question"}]).status_code == 422
    two = {
        "kind": "question",
        "question": "Which?",
        "answer_type": "single_choice",
        "choices": ["a"],
    }
    assert flow.compose([two]).status_code == 422
    assert (
        flow.compose([{"kind": "question", "question": "Free?", "choices": ["x"]}]).status_code
        == 422
    )
    assert (
        flow.compose(
            [{"kind": "question", "question": "Q?", "excerpt_evidence_ids": [evidence["id"]]}]
        ).status_code
        == 422
    )
    assert flow.compose([flow.rule(pet)], contact_id="nobody").status_code == 404
    assert (
        flow.compose([{"kind": "confirm_rule", "requirement_version_id": "nope"}]).status_code
        == 404
    )
    preview_path = f"{flow.base}/{created.json()['request_id']}/invitations/{created.json()['invitation']['id']}/preview"
    assert staff.req("GET", preview_path).json()["items"] == preview["items"]


def test_candidates_with_unverified_evidence_cannot_be_sent(flow):
    # A flagged (unverifiable) candidate cannot be sent even if forced past staff acceptance.
    pet = flow.staff.find("pet_policy", "Aster House", "allow_2_cat")
    flow.accept("pet_policy", "Aster House", "allow_2_cat")
    with flow.staff.factory.begin() as db:
        db.execute(
            update(RequirementVersion)
            .where(RequirementVersion.id == pet["id"])
            .values(evidence_status="flagged")
        )
    refused = flow.compose([flow.rule(pet)])
    assert refused.status_code == 422 and "not fully verified" in refused.text


# ---------------------------------------------------------------------------- sending


def test_link_is_hashed_at_rest_and_email_states_are_honest(flow, outbox):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created = flow.compose([flow.rule(pet)], title="Pet rules\nBcc: evil@example.invalid").json()
    assert created["invitation"]["status"] == "draft" and not outbox.sent
    sent = flow.send(created)
    assert sent.status_code == 200
    body = sent.json()
    token = body["link"].rsplit("/", 1)[1]
    assert body["link"].startswith("http://localhost:3000/review/") and len(token) >= 40
    assert body["invitation"]["delivery_state"] == "smtp_accepted"
    assert "does not confirm" in body["delivery_note"]
    to, subject, text = outbox.sent[0]
    assert to == "alex@example.invalid" and "\n" not in subject and body["link"] in text
    assert pet["statement"] not in text and "Fictional Lantern Property Group" in text
    with staff.factory() as db:
        invitation = db.get(ReviewInvitation, created["invitation"]["id"])
        assert invitation.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in json.dumps([a.detail for a in db.scalars(select(AuditEvent))])
        assert invitation.delivery_state == "smtp_accepted" and invitation.sent_at
    # The link is never retrievable again.
    listing = json.dumps(staff.req("GET", flow.base).json())
    assert token not in listing
    again = flow.send(created)
    assert again.status_code == 409 and "draft" in again.text

    outbox.result = ("failed", "smtp_unavailable")
    second = flow.accept("pet_policy", "Birch Court", "allow_1_cat")
    failed = flow.live([flow.rule(second)])[1]
    assert failed["invitation"]["delivery_state"] == "failed"
    assert failed["invitation"]["delivery_error"] == "smtp_unavailable"
    assert failed["link"] and "failed" in failed["delivery_note"]  # copy-link fallback

    emergency = flow.accept(
        "emergency_routing", "Aster House", "transfer_to_maintenance_supervisor"
    )
    quiet = flow.compose([flow.rule(emergency)]).json()
    link_only = flow.send(quiet, deliver_email=False).json()
    assert link_only["invitation"]["delivery_state"] == "link_only" and len(outbox.sent) == 2


def test_smtp_adapter_maps_failures_without_leaking(monkeypatch):
    sent = []

    class Fake:
        def __init__(self, host, port, timeout):
            self.args = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr(mailer.smtplib, "SMTP", Fake)
    assert mailer.send_email("a@example.invalid", "Subject", "Body") == ("smtp_accepted", None)
    assert sent[0]["To"] == "a@example.invalid" and "Implementation team" in sent[0]["From"]

    class Down(Fake):
        def send_message(self, message):
            raise OSError("connection refused: secret-host")

    monkeypatch.setattr(mailer.smtplib, "SMTP", Down)
    assert mailer.send_email("a@example.invalid", "S", "B") == ("failed", "smtp_unavailable")

    class Refused(Fake):
        def send_message(self, message):
            raise mailer.smtplib.SMTPRecipientsRefused({})

    monkeypatch.setattr(mailer.smtplib, "SMTP", Refused)
    assert mailer.send_email("a@example.invalid", "S", "B")[1] == "smtp_recipient_refused"


# ---------------------------------------------------------------------------- public scope


def test_public_page_exposes_only_invited_items_and_sets_safe_headers(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    other = flow.accept("pet_policy", "Birch Court", "allow_1_cat")
    first = flow.live([flow.rule(pet)])
    second = flow.live([flow.rule(other), {"kind": "question", "question": "Backup phone?"}])
    view = anon.get(f"/api/public/review/{first[2]}")
    assert view.status_code == 200
    assert view.headers["referrer-policy"] == "no-referrer"
    assert view.headers["cache-control"] == "no-store"
    assert "noindex" in view.headers["x-robots-tag"]
    page = view.json()
    assert page["organization"] == "Fictional Lantern Property Group" and page["total"] == 1
    assert [i["proposed_rule"]["statement"] for i in page["items"]] == [pet["statement"]]
    dump = json.dumps(page)
    for hidden in (PID, pet["id"], other["statement"], "ai_proposal", "specialist@example.invalid"):
        assert hidden not in dump
    other_page = anon.get(f"/api/public/review/{second[2]}").json()
    assert other_page["total"] == 2 and pet["statement"] not in json.dumps(other_page)
    # An item that belongs to a different invitation cannot be answered with this token.
    foreign_item = other_page["items"][0]["item_id"]
    assert respond(anon, first[2], foreign_item).status_code == 422
    assert count(staff, CustomerResponseVersion) == 0
    # Opening is audited once, by a customer-link actor that references the invitation, not the token.
    anon.get(f"/api/public/review/{first[2]}")
    with staff.factory() as db:
        opened = db.scalars(
            select(AuditEvent).where(AuditEvent.action == "invitation.opened")
        ).all()
        mine = [a for a in opened if a.actor_reference == first[0]["invitation"]["id"]]
        assert len(mine) == 1 and mine[0].actor_type == "customer_link"
    # No credentials are needed or accepted beyond the token; unknown or malformed ones are 404.
    for bad in (
        "x" * 43,
        "short",
        "a" * 300,
        first[2][:-1] + ("A" if first[2][-1] != "A" else "B"),
    ):
        assert anon.get(f"/api/public/review/{bad}").status_code == 404
    assert anon.get("/api/projects").status_code == 401  # a token is not an internal session


def test_rate_limiter_counts_and_resets(staff):
    with staff.factory() as db:
        throttle(db, "unit", 2, 15)
        throttle(db, "unit", 2, 15)
        with pytest.raises(HTTPException) as caught:
            throttle(db, "unit", 2, 15)
        assert caught.value.status_code == 429
        db.execute(
            update(LoginThrottle).values(
                window_start=datetime.now(timezone.utc) - timedelta(minutes=16)
            )
        )
        db.commit()
        throttle(db, "unit", 2, 15)  # a new window starts


# ---------------------------------------------------------------------------- lifecycle


def test_revoke_expire_and_resend_invalidate_links(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created, sent, token = flow.live([flow.rule(pet)])
    item_id = anon.get(f"/api/public/review/{token}").json()["items"][0]["item_id"]
    assert (
        respond(anon, token, item_id, "cannot_confirm", {"comment": "Not sure"}).status_code == 200
    )
    ids = (created["request_id"], created["invitation"]["id"])

    resent = flow.action(*ids, "resend")
    assert resent.status_code == 200, resent.text
    fresh_token = resent.json()["link"].rsplit("/", 1)[1]
    assert fresh_token != token
    assert anon.get(f"/api/public/review/{token}").status_code == 410
    assert "expired or was withdrawn" in anon.get(f"/api/public/review/{token}").json()["detail"]
    page = anon.get(f"/api/public/review/{fresh_token}").json()
    assert page["items"][0]["current_response"]["response_type"] == "cannot_confirm"  # carried over
    assert page["answered"] == 1 and page["outstanding"] == 0
    assert respond(anon, token, item_id, "confirm", submission="stale-link-0001").status_code == 410
    listing = staff.req("GET", flow.base).json()[0]["invitations"]
    assert [i["status"] for i in listing] == ["active", "revoked"]
    assert listing[0]["replaces_id"] == created["invitation"]["id"]

    revoked = flow.action(created["request_id"], resent.json()["invitation"]["id"], "revoke")
    assert revoked.json()["status"] == "revoked"
    assert (
        flow.action(created["request_id"], resent.json()["invitation"]["id"], "revoke").status_code
        == 200
    )
    assert anon.get(f"/api/public/review/{fresh_token}").status_code == 410

    # Expiry is enforced server-side by the stored timestamp.
    again = flow.action(created["request_id"], resent.json()["invitation"]["id"], "resend").json()
    expiring = again["link"].rsplit("/", 1)[1]
    assert anon.get(f"/api/public/review/{expiring}").status_code == 200
    with staff.factory.begin() as db:
        db.execute(
            update(ReviewInvitation)
            .where(ReviewInvitation.id == again["invitation"]["id"])
            .values(expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        )
    assert anon.get(f"/api/public/review/{expiring}").status_code == 410
    assert flow.send({"request_id": ids[0], "invitation": {"id": ids[1]}}).status_code == 409


def test_sending_refuses_wording_that_changed_after_composing(flow):
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created = flow.compose([flow.rule(pet)]).json()
    # A draft does not lock the wording (staff may still edit); sending re-checks the snapshot.
    edited = flow.staff.req(
        "PATCH", flow.staff.path(pet["id"]), {"statement": "Two cats, no dogs."}
    )
    assert edited.status_code == 200
    stale = flow.send(created)
    assert stale.status_code == 422 or stale.status_code == 409
    assert flow.staff.req("GET", flow.base).json()[0]["invitations"][0]["status"] == "draft"


# ---------------------------------------------------------------------------- responses


def test_partial_idempotent_versioned_and_validated_responses(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    question = {
        "kind": "question",
        "question": "Is the backup phone known?",
        "answer_type": "yes_no",
    }
    multi = {
        "kind": "question",
        "question": "Which days?",
        "answer_type": "multiple_choice",
        "choices": ["Sat", "Sun", "Mon"],
    }
    created, _, token = flow.live([flow.rule(pet), question, multi])
    items = anon.get(f"/api/public/review/{token}").json()["items"]
    rule_item, yes_no, days = (i["item_id"] for i in items)

    first = respond(
        anon, token, rule_item, "confirm", {"comment": "Looks right"}, "submission-0001"
    )
    assert first.status_code == 200
    saved = first.json()
    assert saved["saved"] == [
        {"item_id": rule_item, "version": 1, "response_type": "confirm", "duplicate": False}
    ]
    assert (saved["answered"], saved["outstanding"]) == (1, 2)
    assert set(saved["outstanding_items"]) == {yes_no, days}
    # A retry with the same key creates nothing new, even if the replay differs.
    replay = respond(anon, token, rule_item, "cannot_confirm", {}, "submission-0001").json()
    assert (
        replay["saved"][0]["duplicate"] is True and replay["saved"][0]["response_type"] == "confirm"
    )
    assert count(staff, CustomerResponseVersion) == 1
    # A new submission amends: version 2, history kept.
    amended = respond(
        anon, token, rule_item, "cannot_confirm", {"comment": "Need to ask"}, "submission-0002"
    )
    assert amended.json()["saved"][0]["version"] == 2
    assert count(staff, CustomerResponseVersion) == 2
    current = anon.get(f"/api/public/review/{token}").json()["items"][0]["current_response"]
    assert current["response_type"] == "cannot_confirm" and current["version"] == 2

    # Invalid content is rejected without saving anything from the same request.
    mixed = anon.post(
        f"/api/public/review/{token}/responses",
        json={
            "submission_id": "submission-0003",
            "responses": [
                {"item_id": rule_item, "response_type": "confirm", "answer": {}},
                {"item_id": yes_no, "response_type": "answer", "answer": {"choice": "maybe"}},
            ],
        },
    )
    assert mixed.status_code == 422 and count(staff, CustomerResponseVersion) == 2
    invalid = [
        (yes_no, "confirm", {}),  # not offered for a question
        (rule_item, "answer", {"text": "x"}),  # not offered for a rule
        (yes_no, "answer", {"text": "yes"}),  # wrong field for the answer type
        (yes_no, "answer", {"bogus": 1}),  # unknown field
        (days, "answer", {"choices": ["Fri"]}),  # not an offered choice
        (days, "answer", {"choices": []}),
        (rule_item, "request_correction", {}),  # needs wording or a comment
        (rule_item, "cannot_confirm", {"comment": "x" * 2001}),
        (rule_item, "cannot_confirm", {"corrected_statement": "nope"}),
    ]
    for item_id, kind, answer in invalid:
        assert respond(anon, token, item_id, kind, answer, "submission-bad1").status_code == 422, (
            kind,
            answer,
        )
    ok = anon.post(
        f"/api/public/review/{token}/responses",
        json={
            "submission_id": "submission-0004",
            "responses": [
                {
                    "item_id": yes_no,
                    "response_type": "answer",
                    "answer": {"choice": "no", "comment": "Missing"},
                },
                {
                    "item_id": days,
                    "response_type": "answer",
                    "answer": {"choices": ["Sat", "Sat", "Sun"]},
                },
            ],
        },
    )
    assert ok.status_code == 200 and ok.json()["outstanding"] == 0
    for bad in (
        {"submission_id": "short", "responses": []},
        {
            "submission_id": "bad id with spaces!",
            "responses": [{"item_id": rule_item, "response_type": "confirm"}],
        },
    ):
        assert anon.post(f"/api/public/review/{token}/responses", json=bad).status_code == 422
    dup = anon.post(
        f"/api/public/review/{token}/responses",
        json={
            "submission_id": "submission-0005",
            "responses": [{"item_id": rule_item, "response_type": "confirm"}] * 2,
        },
    )
    assert dup.status_code == 422

    inbox = staff.req("GET", f"/api/projects/{PID}/responses").json()
    assert len(inbox) == 3  # latest response per invitation item
    row = next(r for r in inbox if r["kind"] == "confirm_rule")
    assert row["version"] == 2 and row["previous"]["response_type"] == "confirm"
    assert (
        row["recipient"]["verified"] is False and "bearer review link" in row["confirmation_note"]
    )
    assert row["state"] == "awaiting_staff_review" and row["next_action"]
    answered = next(r for r in inbox if r["question"] == "Is the backup phone known?")
    assert answered["answer"] == {"choice": "no", "comment": "Missing"}
    with staff.factory() as db:
        actors = set(
            db.scalars(
                select(AuditEvent.actor_type).where(AuditEvent.action == "response.submitted")
            )
        )
        assert actors == {"customer_link"}


# ---------------------------------------------------------------------------- confirmation


def test_customer_confirmation_needs_staff_validation_and_freezes_the_version(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created, _, token = flow.live(
        [flow.rule(pet), {"kind": "question", "question": "Anything else?"}]
    )
    rule_item, question_item = (
        i["item_id"] for i in anon.get(f"/api/public/review/{token}").json()["items"]
    )
    assert respond(anon, token, rule_item, "confirm").status_code == 200
    assert (
        respond(anon, token, question_item, "answer", {"text": "No"}, "submission-0009").status_code
        == 200
    )

    # The customer's confirmation alone changes nothing about the requirement.
    assert staff.detail(pet["id"])["customer_confirmation_state"] == "not_confirmed"
    assert count(staff, CustomerConfirmation) == 0
    inbox = {r["kind"]: r for r in staff.req("GET", f"/api/projects/{PID}/responses").json()}
    review = lambda rid, decision, why="": staff.req(  # noqa: E731
        "POST",
        f"/api/projects/{PID}/responses/{rid}/review",
        {"decision": decision, "rationale": why},
    )
    # Staff cannot "validate" an answer that is not a confirmation of a rule.
    assert review(inbox["question"]["response_id"], "validate_confirmation").status_code == 409
    assert (
        review(inbox["question"]["response_id"], "acknowledge", "Noted").json()["state"]
        == "acknowledged"
    )

    rule_response = inbox["confirm_rule"]["response_id"]
    assert review(rule_response, "reject_confirmation").status_code == 422  # reason required
    # A revoked link cannot add new responses, but the staff decision does not depend on it.
    validated = review(rule_response, "validate_confirmation", "Checked against the call notes")
    assert validated.status_code == 200 and validated.json()["state"] == "confirmation_validated"
    detail = staff.detail(pet["id"])
    assert detail["customer_confirmation_state"] == "confirmed"
    assert (
        detail["staff_review_state"] == "accepted" and detail["approval_status"] == "not_approved"
    )
    with staff.factory() as db:
        confirmation = db.scalar(select(CustomerConfirmation))
        assert confirmation.confirmed_statement == pet["statement"]
        assert confirmation.response_id == rule_response
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "confirmation.validated"))
        assert "bearer review link" in event.detail["note"] and event.actor_type == "internal_user"
        decisions = list(
            db.scalars(select(StaffReview.decision).where(StaffReview.response_id == rule_response))
        )
        assert decisions == ["confirmation_validated"]
        with pytest.raises(Exception, match="[Ii]mmutable"):
            db.execute(
                update(RequirementVersion)
                .where(RequirementVersion.id == pet["id"])
                .values(statement="changed")
            )
            db.commit()
        db.rollback()
    assert review(rule_response, "validate_confirmation").status_code == 409
    assert staff.req("PATCH", staff.path(pet["id"]), {"statement": "x"}).status_code == 409
    assert (
        respond(anon, token, rule_item, "cannot_confirm", {}, "submission-0010").status_code == 409
    )
    assert flow.compose([flow.rule(pet)]).status_code == 422  # already confirmed
    # A resent link still works and shows the confirmed rule as locked and the rest as before.
    resent = flow.action(created["request_id"], created["invitation"]["id"], "resend")
    assert resent.status_code == 200, resent.text
    fresh = anon.get("/api/public/review/" + resent.json()["link"].rsplit("/", 1)[1]).json()
    assert fresh["items"][0]["locked"] is True and fresh["answered"] == 2
    rows = staff.req("GET", f"/api/projects/{PID}/responses").json()
    assert next(r for r in rows if r["kind"] == "confirm_rule")["locked"] is True


def test_rejected_confirmation_can_be_replaced_by_an_amended_response(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Birch Court", "allow_1_cat")
    _, _, token = flow.live([flow.rule(pet)])
    item_id = anon.get(f"/api/public/review/{token}").json()["items"][0]["item_id"]
    respond(anon, token, item_id, "confirm", {}, "submission-0001")
    first = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]["response_id"]
    path = f"/api/projects/{PID}/responses/{first}/review"
    rejected = staff.req(
        "POST", path, {"decision": "reject_confirmation", "rationale": "Unexpected sender"}
    )
    assert rejected.json()["state"] == "confirmation_rejected"
    assert staff.detail(pet["id"])["customer_confirmation_state"] == "not_confirmed"
    respond(anon, token, item_id, "confirm", {"comment": "Yes, confirmed"}, "submission-0002")
    # The earlier response is superseded and cannot be validated any more.
    assert staff.req("POST", path, {"decision": "validate_confirmation"}).status_code == 409
    latest = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]
    assert latest["version"] == 2 and latest["state"] == "awaiting_staff_review"
    ok = staff.req(
        "POST",
        f"/api/projects/{PID}/responses/{latest['response_id']}/review",
        {"decision": "validate_confirmation"},
    )
    assert (
        ok.status_code == 200
        and staff.detail(pet["id"])["customer_confirmation_state"] == "confirmed"
    )


def test_validation_refuses_wording_that_changed_since_it_was_sent(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created, _, token = flow.live([flow.rule(pet)])
    item_id = anon.get(f"/api/public/review/{token}").json()["items"][0]["item_id"]
    respond(anon, token, item_id, "confirm")
    flow.action(created["request_id"], created["invitation"]["id"], "revoke")
    with staff.factory.begin() as db:  # simulate drift that bypassed the API guards
        db.execute(
            update(RequirementVersion)
            .where(RequirementVersion.id == pet["id"])
            .values(statement="Different wording")
        )
    row = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]
    assert row["wording_changed"] is True
    result = staff.req(
        "POST",
        f"/api/projects/{PID}/responses/{row['response_id']}/review",
        {"decision": "validate_confirmation"},
    )
    assert result.status_code == 409 and "fresh confirmation request" in result.text
    assert count(staff, CustomerConfirmation) == 0


def test_active_link_freezes_the_wording_until_revoked(flow):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    other = flow.accept("pet_policy", "Birch Court", "allow_1_cat")
    created, _, _ = flow.live([flow.rule(pet)])
    path = staff.path(pet["id"])
    assert staff.req("PATCH", path, {"statement": "x"}).status_code == 409
    assert staff.req("POST", path + "/reject", {"reason": "x"}).status_code == 409
    assert staff.req("POST", path + "/reopen", {}).status_code == 409
    assert staff.req("POST", path + "/duplicate", {"canonical_id": other["id"]}).status_code == 409
    assert (
        staff.req(
            "POST", staff.path(other["id"], "/duplicate"), {"canonical_id": pet["id"]}
        ).status_code
        == 409
    )
    assert (
        flow.action(created["request_id"], created["invitation"]["id"], "revoke").status_code == 200
    )
    assert staff.req("PATCH", path, {"statement": "Two cats, no dogs."}).status_code == 200


def test_correction_request_becomes_a_new_revision_needing_fresh_confirmation(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created, _, token = flow.live([flow.rule(pet)])
    item_id = anon.get(f"/api/public/review/{token}").json()["items"][0]["item_id"]
    respond(
        anon,
        token,
        item_id,
        "request_correction",
        {"corrected_statement": "Aster House permits up to two cats and no dogs."},
    )
    row = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]
    assert row["response_type"] == "request_correction" and row["revised"] is False
    # Corrections are not confirmations.
    review_path = f"/api/projects/{PID}/responses/{row['response_id']}/review"
    assert staff.req("POST", review_path, {"decision": "validate_confirmation"}).status_code == 409
    revise_path = staff.path(pet["id"], "/revise")
    assert staff.req("POST", revise_path, {"response_id": "nope"}).status_code == 404
    revised = staff.req("POST", revise_path, {"response_id": row["response_id"]})
    assert revised.status_code == 201, revised.text
    new = revised.json()
    assert new["version"] == 2 and new["statement"].endswith("no dogs.")
    assert (
        new["staff_review_state"] == "pending"
        and new["customer_confirmation_state"] == "not_confirmed"
    )
    assert new["simulated"] is True  # the original proposal's labels carry over
    detail = staff.detail(new["id"])
    assert (
        len(detail["evidence"]) == 1
        and detail["ai_proposal"] == staff.detail(pet["id"])["ai_proposal"]
    )
    old = staff.detail(pet["id"])
    assert old["review_state"] == "rejected" and old["statement"] == pet["statement"]
    with staff.factory() as db:
        supersedes = db.scalar(
            select(RequirementVersion.supersedes_id).where(RequirementVersion.id == new["id"])
        )
        assert supersedes == pet["id"]
        assert "candidate_superseded" in set(db.scalars(select(StaffReview.decision)))
    assert staff.req("POST", revise_path, {"response_id": row["response_id"]}).status_code == 409
    # Another response confirming the old wording can no longer be validated.
    respond(anon, token, item_id, "confirm", {}, "submission-0002")
    latest = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]
    stale = staff.req(
        "POST",
        f"/api/projects/{PID}/responses/{latest['response_id']}/review",
        {"decision": "validate_confirmation"},
    )
    assert stale.status_code == 409

    # The revision must be accepted and confirmed afresh before it counts.
    assert flow.compose([flow.rule(new)]).status_code == 422
    assert staff.req("POST", staff.path(new["id"], "/accept"), {}).status_code == 200
    flow.action(created["request_id"], created["invitation"]["id"], "revoke")
    _, _, token2 = flow.live([flow.rule(new)])
    item2 = anon.get(f"/api/public/review/{token2}").json()["items"][0]
    assert item2["proposed_rule"]["statement"] == new["statement"]
    respond(anon, token2, item2["item_id"], "confirm", {}, "submission-1001")
    latest = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]
    done = staff.req(
        "POST",
        f"/api/projects/{PID}/responses/{latest['response_id']}/review",
        {"decision": "validate_confirmation"},
    )
    assert done.status_code == 200
    assert staff.detail(new["id"])["customer_confirmation_state"] == "confirmed"
    assert staff.detail(pet["id"])["customer_confirmation_state"] == "not_confirmed"


# ---------------------------------------------------------------------------- isolation


def test_every_m3_staff_route_is_isolated_by_project(flow, anon):
    staff = flow.staff
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    created, _, token = flow.live([flow.rule(pet)])
    item_id = anon.get(f"/api/public/review/{token}").json()["items"][0]["item_id"]
    respond(anon, token, item_id, "request_correction", {"comment": "No"})
    response_id = staff.req("GET", f"/api/projects/{PID}/responses").json()[0]["response_id"]
    rid, iid = created["request_id"], created["invitation"]["id"]
    base = f"/api/projects/{PID}"
    attacks = [
        ("GET", f"{base}/review-requests", None),
        (
            "POST",
            f"{base}/review-requests",
            {"title": "x", "contact_id": flow.contact(), "items": [flow.rule(pet)]},
        ),
        ("GET", f"{base}/review-requests/{rid}/invitations/{iid}/preview", None),
        ("POST", f"{base}/review-requests/{rid}/invitations/{iid}/send", {}),
        ("POST", f"{base}/review-requests/{rid}/invitations/{iid}/resend", {}),
        ("POST", f"{base}/review-requests/{rid}/invitations/{iid}/revoke", {}),
        ("GET", f"{base}/responses", None),
        ("POST", f"{base}/responses/{response_id}/review", {"decision": "acknowledge"}),
        ("POST", f"{base}/requirements/{pet['id']}/revise", {"response_id": response_id}),
    ]
    staff.req("POST", "/api/auth/logout")
    outsider = sign_in(staff.web, "outsider@example.invalid", "another-fictional-passphrase")
    for method, path, data in attacks:
        assert call(staff.web, method, path, data, outsider).status_code == 404, (method, path)
    org = post(staff.web, "/api/organizations", {"name": "Other"}, outsider).json()
    own = post(
        staff.web, "/api/projects", {"name": "Own", "organization_id": org["id"]}, outsider
    ).json()["id"]
    mine = f"/api/projects/{own}"
    contact = post(
        staff.web,
        f"{mine}/contacts",
        {"name": "O", "email": "o@example.invalid", "role": "r"},
        outsider,
    ).json()["id"]
    cross = [
        (
            "POST",
            f"{mine}/review-requests",
            {"title": "x", "contact_id": contact, "items": [flow.rule(pet)]},
        ),
        ("POST", f"{mine}/review-requests/{rid}/invitations/{iid}/revoke", {}),
        ("POST", f"{mine}/review-requests/{rid}/invitations/{iid}/send", {}),
        ("GET", f"{mine}/review-requests/{rid}/invitations/{iid}/preview", None),
        ("POST", f"{mine}/responses/{response_id}/review", {"decision": "acknowledge"}),
        ("POST", f"{mine}/requirements/{pet['id']}/revise", {"response_id": response_id}),
    ]
    for method, path, data in cross:
        assert call(staff.web, method, path, data, outsider).status_code == 404, (method, path)
    assert call(staff.web, "GET", f"{mine}/responses", None, outsider).json() == []
    assert anon.get(f"/api/public/review/{token}").status_code == 200  # untouched
