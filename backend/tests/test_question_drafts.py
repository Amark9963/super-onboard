"""AI-assisted clarification wording stays scoped, bounded, and staff-controlled."""

import json

import pytest
from sqlalchemy import func, select

from app import question_drafts
from app.ai import ProviderError
from app.config import settings
from app.models import AuditEvent, ClarificationQuestion, ReviewRequest
from app.question_drafts import SuggestedQuestion, suggest_question
from tests.support import PID


def path(project_id=PID):
    return f"/api/projects/{project_id}/question-suggestions"


def test_conflict_suggestion_is_scoped_and_not_customer_visible(staff, monkeypatch):
    staff.extract()
    group = next(g for g in staff.conflicts() if g["kind"] == "conflict")
    monkeypatch.setattr(settings, "ai_api_key", "fictional-test-key")
    captured = {}

    def fake(context):
        captured.update(context)
        return SuggestedQuestion(
            question="For Birch Court weekend emergencies, should calls go to the front desk or on-call supervisor?"
        )

    monkeypatch.setattr(question_drafts, "suggest_question", fake)
    request = {"conflict_id": group["id"], "acknowledge_external_processing": True}
    response = staff.req("POST", path(), request)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["review_required"] is True and result["answer_type"] == "free_text"
    assert result["conflict_id"] == group["id"] and result["requirement_version_id"] is None
    assert captured["kind"] == "conflict" and len(captured["rules"]) == 2
    assert all(rule["verified_excerpts"] for rule in captured["rules"])
    assert "example.invalid" not in json.dumps(captured)
    with staff.factory() as db:
        assert db.scalar(select(func.count()).select_from(ReviewRequest)) == 0
        assert db.scalar(select(func.count()).select_from(ClarificationQuestion)) == 0
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.action == "clarification.suggested")
            )
            == 1
        )

    # Staff can submit the suggestion through the composer; this still only creates a draft.
    contact = staff.req("GET", f"/api/projects/{PID}/contacts").json()[0]
    composed = staff.req(
        "POST",
        f"/api/projects/{PID}/review-requests",
        {
            "title": "Fictional weekend routing clarification",
            "contact_id": contact["id"],
            "items": [
                {
                    "kind": "question",
                    "question": result["question"],
                    "answer_type": result["answer_type"],
                    "conflict_id": result["conflict_id"],
                }
            ],
        },
    )
    assert composed.status_code == 201, composed.text
    assert composed.json()["preview"]["items"][0]["question"] == result["question"]
    assert composed.json()["invitation"]["status"] == "draft"
    with staff.factory() as db:
        assert (
            db.scalar(
                select(ClarificationQuestion.conflict_id).where(
                    ClarificationQuestion.text == result["question"]
                )
            )
            == group["id"]
        )


def test_suggestion_rejects_unscoped_or_unapproved_inputs(staff, monkeypatch):
    staff.extract()
    monkeypatch.setattr(settings, "ai_api_key", "fictional-test-key")
    group = next(g for g in staff.conflicts() if g["kind"] == "conflict")
    variant = next(g for g in staff.conflicts() if g["kind"] == "variant")
    item = staff.items()[0]
    assert staff.req("POST", path(), {}).status_code == 422
    assert (
        staff.req(
            "POST", path(), {"conflict_id": group["id"], "requirement_version_id": item["id"]}
        ).status_code
        == 422
    )
    assert staff.req("POST", path(), {"conflict_id": group["id"]}).status_code == 422
    assert (
        staff.req(
            "POST", path(), {"conflict_id": variant["id"], "acknowledge_external_processing": True}
        ).status_code
        == 422
    )
    assert (
        staff.req(
            "POST",
            path("another-project"),
            {"conflict_id": group["id"], "acknowledge_external_processing": True},
        ).status_code
        == 404
    )
    assert (
        staff.req(
            "POST",
            path(),
            {"conflict_id": "another-project-record", "acknowledge_external_processing": True},
        ).status_code
        == 404
    )
    monkeypatch.setattr(settings, "ai_api_key", None)
    assert (
        staff.req(
            "POST", path(), {"conflict_id": group["id"], "acknowledge_external_processing": True}
        ).status_code
        == 503
    )


def test_live_question_adapter_uses_strict_schema_and_hides_failures(monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "fictional-test-key")
    monkeypatch.setattr(settings, "ai_model", "gpt-6.1-sol")
    seen = {}

    def transport(url, headers, body, timeout):
        seen.update(url=url, headers=headers, body=json.loads(body), timeout=timeout)
        return 200, json.dumps(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"question": "Which weekend route applies to Birch Court?"}
                            )
                        }
                    }
                ]
            }
        ).encode()

    result = suggest_question({"kind": "conflict", "rules": []}, transport)
    assert result.question == "Which weekend route applies to Birch Court?"
    assert seen["body"]["model"] == "gpt-6.1-sol"
    assert seen["body"]["response_format"]["json_schema"]["strict"] is True
    assert "temperature" not in seen["body"]
    assert "fictional-test-key" not in json.dumps(seen["body"])
    assert seen["headers"]["Authorization"] == "Bearer fictional-test-key"
    with pytest.raises(ProviderError, match="provider_invalid_output"):
        suggest_question({}, lambda *args: (200, b'{"choices":[{"message":{"content":"{}"}}]}'))
    with pytest.raises(ProviderError, match="provider_auth_failed"):
        suggest_question({}, lambda *args: (401, b"should not be logged"))
