"""M2: extraction jobs, citation verification, internal candidate review, conflicts and gaps."""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select, update

from app import worker
from app.ai import (
    BlockInput,
    Candidate,
    Citation,
    Extraction,
    ExtractionRequest,
    ModelOutput,
    OpenAICompatibleProvider,
    ProviderError,
    get_provider,
    provider_options,
    wire_schema,
)
from app.citations import verify_quote
from app.config import settings
from app.conflicts import detect
from app.models import (
    AuditEvent,
    CandidateProvenance,
    ConflictGroup,
    Job,
    RequirementDuplicate,
    RequirementEvidence,
    RequirementVersion,
    SourceBlock,
    SourceVersion,
    StaffReview,
)
from app.seed import key
from tests.support import call, post, sign_in

PID = key("project")
SOURCES = [
    "Aster House policy",
    "Birch Court old SOP",
    "Birch Court transcript",
    "Contact roster",
    "Website snapshot",
]


def vid(name):
    return key(name + ":v1")


class Staff:
    def __init__(self, web, factory, memory, csrf):
        self.web, self.factory, self.memory, self.csrf = web, factory, memory, csrf

    def req(self, method, path, data=None):
        return call(self.web, method, path, data, self.csrf)

    def queue(self, name, provider="mock", **extra):
        return self.req(
            "POST",
            f"/api/projects/{PID}/extraction-jobs",
            {"source_version_id": vid(name), "provider": provider, **extra},
        )

    def drain(self, factory=get_provider):
        while worker.run_extraction_once(factory):
            pass

    def extract(self, names=SOURCES):
        for name in names:
            response = self.queue(name)
            assert response.status_code == 201, response.text
        self.drain()

    def items(self, **params):
        query = "&".join(f"{k}={v}" for k, v in params.items())
        response = self.req("GET", f"/api/projects/{PID}/requirements?{query}")
        assert response.status_code == 200, response.text
        return response.json()["items"]

    def find(self, topic, scope, action, conditions=None):
        matches = [
            i
            for i in self.items()
            if i["topic"] == topic
            and i["scope"]["name"].endswith(scope)
            and i["proposed_action"] == action
            and (conditions is None or i["conditions"] == conditions)
        ]
        assert len(matches) == 1, (topic, scope, action, matches)
        return matches[0]

    def conflicts(self, **params):
        query = "&".join(f"{k}={v}" for k, v in params.items())
        response = self.req("GET", f"/api/projects/{PID}/conflicts?{query}")
        assert response.status_code == 200, response.text
        return response.json()

    def detail(self, version_id):
        response = self.req("GET", f"/api/projects/{PID}/requirements/{version_id}")
        assert response.status_code == 200, response.text
        return response.json()

    def path(self, version_id, action=""):
        return f"/api/projects/{PID}/requirements/{version_id}{action}"


@pytest.fixture
def staff(client, monkeypatch):
    web, factory, memory = client
    monkeypatch.setattr(worker, "SessionLocal", factory)
    return Staff(web, factory, memory, sign_in(web))


def stub_factory(candidates, provider="stub", simulated=False):
    class Stub:
        id, label, external, model = "stub", "stub", False, "stub-1"

        def extract(self, request):
            return Extraction(
                provider=provider, model="stub-1", simulated=simulated, candidates=candidates
            )

    Stub.simulated = simulated
    return lambda name: Stub()


def failing_factory(error):
    class Failing:
        id, label, external, model, simulated = "stub", "stub", False, None, False

        def extract(self, request):
            raise error

    return lambda name: Failing()


def candidate(block_id, quote, **over):
    fields = dict(
        category="emergencies",
        title="Rule",
        statement="Statement",
        topic="emergency_routing",
        scope_type="company",
        scope_ids=[],
        conditions=[],
        proposed_action="transfer_to_x",
        requires_live_lookup=False,
        missing_information=[],
        citations=[Citation(block_id=block_id, quoted_text=quote)],
    )
    return Candidate(**{**fields, **over})


def block_of(factory, name):
    with factory() as db:
        return db.scalar(select(SourceBlock).where(SourceBlock.source_version_id == vid(name)))


# ---------------------------------------------------------------------------- provider contract


def test_schema_has_no_state_fields_and_rejects_injected_ones():
    names = set(Candidate.model_fields)
    assert not names & {"staff_review_state", "customer_confirmation_state", "review_state"}
    good = candidate("b", "A long enough quote").model_dump()
    for field in ("staff_review_state", "customer_confirmation_state", "approved"):
        with pytest.raises(ValidationError):
            Candidate(**{**good, field: "accepted"})
    with pytest.raises(ValidationError):
        Candidate(**{**good, "category": "made_up"})
    with pytest.raises(ValidationError):
        Candidate(**{**good, "citations": []})
    assert (
        candidate("b", "A long enough quote", topic="Weekend Routing!").topic == "weekend_routing"
    )


def test_wire_schema_is_strict_mode_compatible():
    forbidden = {"minLength", "maxLength", "minItems", "maxItems", "default"}

    def walk(node, in_properties=False):
        if isinstance(node, dict):
            if "properties" in node and not in_properties:
                assert node.get("additionalProperties") is False
                assert set(node["required"]) == set(node["properties"])
            for k, v in node.items():
                assert in_properties or k not in forbidden
                walk(v, k == "properties")
        elif isinstance(node, list):
            for item in node:
                walk(item)

    schema = wire_schema()
    walk(schema)
    assert "title" in schema["$defs"]["Candidate"]["properties"]  # field kept, keyword stripped


def test_provider_options_hide_live_provider_without_key(monkeypatch):
    options = provider_options()
    assert [o["id"] for o in options] == ["mock"]
    assert options[0]["simulated"] and not options[0]["external_processing"]
    monkeypatch.setattr(settings, "ai_api_key", "test-key")
    live = {o["id"]: o for o in provider_options()}["openai_compatible"]
    assert live["external_processing"] and not live["simulated"]
    monkeypatch.setattr(settings, "ai_api_key", None)
    with pytest.raises(ValueError):
        get_provider("openai_compatible")


def test_provider_endpoint_requires_sign_in(client):
    web, _, _ = client
    assert web.get("/api/ai/providers").status_code == 401
    sign_in(web)
    assert web.get("/api/ai/providers").json()[0]["simulated"] is True


# ---------------------------------------------------------------------------- citation checks


def test_quote_verification_exact_normalized_and_invented():
    text = "Weekend calls—go to the  Supervisor.\nPlease “confirm” first."
    exact = verify_quote(text, "go to the  Supervisor.")
    assert exact.state == "exact" and text[exact.start : exact.end] == "go to the  Supervisor."
    loose = verify_quote(text, 'WEEKEND calls-go to the supervisor.   please "confirm"')
    assert loose.state == "normalized"
    # Offsets are real positions in the original text, not positions in the normalized copy.
    assert text[loose.start : loose.end] == text[: text.index(" first")]
    # Spacing that the source does not have is a different quote, not a loose match.
    assert verify_quote(text, "Weekend calls - go to the supervisor.").state == "invalid"
    assert verify_quote(text, "Weekend calls go to the backup manager").state == "invalid"
    assert verify_quote(text, "go to").notes == "quote_too_short_to_verify"
    assert verify_quote("Yes", "Yes").state == "exact"  # a whole short block may be quoted
    assert verify_quote(text, "Supervisor goes to the weekend calls").state == "invalid"


# ---------------------------------------------------------------------------- end-to-end mock


def test_mock_extraction_end_to_end_is_simulated_unreviewed_and_verified(staff):
    queued = staff.queue("Aster House policy")
    assert queued.status_code == 201 and queued.json()["provider"] == "mock"
    assert staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]["status"] == "pending"
    staff.drain()
    for name in SOURCES[1:]:
        assert staff.queue(name).status_code == 201
    staff.drain()
    jobs = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()
    assert {j["status"] for j in jobs} == {"succeeded"}
    assert all(j["summary"]["simulated"] for j in jobs)

    listing = staff.req("GET", f"/api/projects/{PID}/requirements").json()
    assert listing["total"] == 9 and listing["counts"]["pending"] == 9
    for item in listing["items"]:
        assert item["simulated"] is True and "SIMULATED" in item["provider"]
        assert item["staff_review_state"] == "pending"
        assert item["customer_confirmation_state"] == "not_confirmed"
        assert item["approval_status"] == "not_approved"
        assert item["evidence_status"] == "verified"
        assert item["scope"]["confirmed_by_staff"] is False

    birch = staff.find("emergency_routing", "Birch Court", "transfer_to_maintenance_supervisor")
    detail = staff.detail(birch["id"])
    assert detail["ai_proposal"]["simulated"] is True
    assert detail["ai_proposal"]["candidate"]["citations"][0]["block_id"]
    evidence = detail["evidence"][0]
    block = evidence["block"]
    assert evidence["quote_match_state"] == "exact"
    assert block["text"][evidence["char_start"] : evidence["char_end"]] == evidence["quoted_text"]
    assert evidence["source"]["document"] == "Birch Court transcript"
    assert block["locator"]  # anchors come from the stored block, never invented
    assert detail["audit"][0]["action"] == "candidate.proposed"

    with staff.factory() as db:
        assert db.scalar(select(func.count()).select_from(CandidateProvenance)) == 9
        assert (
            db.scalar(
                select(func.count())
                .select_from(RequirementVersion)
                .where(RequirementVersion.customer_confirmation_state != "not_confirmed")
            )
            == 0
        )


def test_conflicts_variants_and_gaps_from_the_fictional_fixture(staff):
    staff.extract()
    groups = staff.conflicts()
    by_kind = {k: [g for g in groups if g["kind"] == k] for k in ("conflict", "variant", "gap")}
    assert sorted(g["severity"] for g in by_kind["conflict"]) == ["high", "low", "medium"]
    high = next(g for g in by_kind["conflict"] if g["severity"] == "high")
    assert {m["scope"]["name"] for m in high["members"]} == {"Fictional Birch Court"}
    assert {m["proposed_action"] for m in high["members"]} == {
        "transfer_to_front_desk",
        "transfer_to_maintenance_supervisor",
    }
    assert high["scope_intersection"]["scope"]["name"] == "Fictional Birch Court"
    # Differing pet limits at two buildings are an allowed variation, not a contradiction.
    pets = [g for g in by_kind["variant"] if g["title"].startswith("Pet policy")]
    assert len(pets) == 1 and pets[0]["severity"] == "info"
    assert "not treated as a contradiction" in pets[0]["scope_intersection"]["explanation"].lower()
    assert len(by_kind["variant"]) == 2
    titles = " | ".join(g["title"] for g in by_kind["gap"])
    assert "phone missing" in titles and "tentative" in titles and "live system lookup" in titles
    assert all(g["resolved"] is False and g["triage_state"] == "open" for g in groups)


def test_reextraction_is_idempotent(staff):
    staff.extract(SOURCES[:3])
    before = staff.req("GET", f"/api/projects/{PID}/requirements").json()["total"]
    groups_before = len(staff.conflicts())
    staff.extract(SOURCES[:3])
    rerun = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[:3]
    assert sum(j["summary"]["created"] for j in rerun) == 0
    assert sum(j["summary"]["skipped_duplicates"] for j in rerun) == before
    assert staff.req("GET", f"/api/projects/{PID}/requirements").json()["total"] == before
    assert len(staff.conflicts()) == groups_before


# ---------------------------------------------------------------------------- citation handling


def test_invented_and_misplaced_citations_are_flagged_never_trusted(staff):
    aster = block_of(staff.factory, "Aster House policy")
    birch = block_of(staff.factory, "Birch Court old SOP")
    quote = "Fictional Aster House permits two cats."
    candidates = [
        candidate(aster.id, quote, statement="verified exactly"),
        candidate(aster.id, "FICTIONAL  aster house permits TWO cats.", statement="loose match"),
        candidate(aster.id, "Pets are never allowed anywhere", statement="invented quote"),
        candidate(birch.id, "Birch Court weekend emergencies", statement="other source's block"),
        candidate("block-that-does-not-exist", "Anything at all here", statement="ghost block"),
        candidate(
            aster.id,
            quote,
            statement="one good one bad",
            citations=[
                Citation(block_id=aster.id, quoted_text=quote),
                Citation(block_id=aster.id, quoted_text="This sentence was never written"),
            ],
        ),
        candidate(
            aster.id,
            quote,
            statement="foreign property id",
            scope_type="property",
            scope_ids=["not-a-property-of-this-project"],
        ),
    ]
    assert staff.queue("Aster House policy").status_code == 201
    staff.drain(stub_factory(candidates))
    by_statement = {i["statement"]: i for i in staff.items()}
    assert by_statement["verified exactly"]["evidence_status"] == "verified"
    assert by_statement["loose match"]["evidence_status"] == "verified"
    assert by_statement["invented quote"]["evidence_status"] == "unverifiable"
    assert by_statement["other source's block"]["evidence_status"] == "unverifiable"
    assert by_statement["ghost block"]["evidence_status"] == "unverifiable"
    assert by_statement["one good one bad"]["evidence_status"] == "flagged"

    loose = staff.detail(by_statement["loose match"]["id"])["evidence"][0]
    assert loose["quote_match_state"] == "normalized" and loose["quoted_text"] == quote
    invented = staff.detail(by_statement["invented quote"]["id"])
    assert invented["evidence"][0]["quote_match_state"] == "invalid"
    assert invented["evidence"][0]["char_start"] is None  # no manufactured coordinates
    assert invented["citation_report"][0]["claimed_quote"] == "Pets are never allowed anywhere"
    assert staff.detail(by_statement["ghost block"]["id"])["evidence"] == []
    assert staff.detail(by_statement["other source's block"]["id"])["evidence"] == []

    foreign = staff.detail(by_statement["foreign property id"]["id"])
    assert foreign["scope"]["type"] == "company" and foreign["scope"]["confirmed_by_staff"] is False
    assert "not valid for this project" in foreign["ai_proposal"]["scope_note"]
    assert foreign["ai_proposal"]["simulated"] is False

    for statement in ("invented quote", "ghost block", "one good one bad"):
        refused = staff.req(
            "POST",
            staff.path(by_statement[statement]["id"], "/accept"),
            {"confirm_scope": True},
        )
        assert refused.status_code == 409 and "not fully verified" in refused.text
    assert (
        staff.req("GET", f"/api/projects/{PID}/requirements?evidence_status=flagged").json()[
            "total"
        ]
        == 1
    )
    assert staff.conflicts() == []  # unverified claims never drive conflict suggestions
    with staff.factory() as db:
        states = set(db.scalars(select(RequirementEvidence.quote_match_state)))
        assert states == {"exact", "normalized", "invalid"}


# ---------------------------------------------------------------------------- jobs and the worker


def test_job_validation_and_external_processing_acknowledgement(staff, monkeypatch):
    assert staff.queue("Aster House policy", provider="nonexistent").status_code == 422
    assert staff.queue("Aster House policy", provider="openai_compatible").status_code == 422
    assert staff.queue("Aster House policy").status_code == 201
    assert staff.queue("Aster House policy").status_code == 409  # already active
    monkeypatch.setattr(settings, "ai_api_key", "test-key")
    bare = staff.queue("Birch Court old SOP", provider="openai_compatible")
    assert bare.status_code == 422 and "third-party" in bare.text
    acknowledged = staff.queue(
        "Birch Court old SOP", provider="openai_compatible", acknowledge_external_processing=True
    )
    assert acknowledged.status_code == 201
    with staff.factory.begin() as db:
        pending = SourceVersion(
            project_id=PID,
            document_id=db.get(SourceVersion, vid("Contact roster")).document_id,
            version=2,
            content_hash="0" * 64,
            parse_status="failed",
        )
        db.add(pending)
        empty = SourceVersion(
            project_id=PID,
            document_id=pending.document_id,
            version=3,
            content_hash="1" * 64,
            parse_status="parsed",
        )
        db.add(empty)
        db.flush()
        ids = (pending.id, empty.id)
    for source_version_id in ids:
        response = staff.req(
            "POST",
            f"/api/projects/{PID}/extraction-jobs",
            {"source_version_id": source_version_id, "provider": "mock"},
        )
        assert response.status_code == 409
    missing = staff.req(
        "POST",
        f"/api/projects/{PID}/extraction-jobs",
        {"source_version_id": "no-such-version", "provider": "mock"},
    )
    assert missing.status_code == 404


def test_transient_failures_retry_then_fail_and_can_be_retried_manually(staff):
    assert staff.queue("Aster House policy").status_code == 201
    outage = failing_factory(ProviderError("provider_http_503", True))
    for attempt in (1, 2):
        assert worker.run_extraction_once(outage)
        job = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]
        assert (job["status"], job["attempts"]) == ("pending", attempt)
        assert job["error_code"] == "provider_http_503"
    assert worker.run_extraction_once(outage)
    job = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]
    assert (job["status"], job["attempts"]) == ("failed", 3)
    assert not worker.run_extraction_once(outage)  # exhausted jobs are not claimed again
    assert staff.req("GET", f"/api/projects/{PID}/requirements").json()["total"] == 0

    retried = staff.req("POST", f"/api/projects/{PID}/extraction-jobs/{job['id']}/retry", {})
    assert retried.status_code == 201 and retried.json()["id"] != job["id"]
    staff.drain()
    jobs = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()
    assert [j["status"] for j in jobs] == ["succeeded", "failed"]
    again = staff.req("POST", f"/api/projects/{PID}/extraction-jobs/{jobs[0]['id']}/retry", {})
    assert again.status_code == 409  # only failed jobs can be retried


def test_permanent_and_unexpected_failures_do_not_leak_content(staff):
    assert staff.queue("Aster House policy").status_code == 201
    assert worker.run_extraction_once(failing_factory(ProviderError("provider_auth_failed", False)))
    job = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]
    assert (job["status"], job["attempts"], job["error_code"]) == (
        "failed",
        1,
        "provider_auth_failed",
    )
    assert staff.queue("Birch Court old SOP").status_code == 201
    secret = "Fictional secret document text sk-test-123"
    for _ in range(3):  # unexpected errors are retried, then fail with a content-free code
        assert worker.run_extraction_once(failing_factory(RuntimeError(secret)))
    assert staff.queue("Contact roster").status_code == 201
    assert worker.run_extraction_once(lambda name: (_ for _ in ()).throw(ValueError("x")))
    text = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").text
    assert secret not in text and "sk-test" not in text
    codes = {j["error_code"] for j in json.loads(text)}
    assert codes == {"provider_auth_failed", "extraction_failed", "provider_unavailable"}
    with staff.factory() as db:
        audits = db.scalars(select(AuditEvent).where(AuditEvent.action.like("extraction.%")))
        assert secret not in json.dumps([a.detail for a in audits])


def test_abandoned_extraction_job_is_recovered(staff):
    queued = staff.queue("Aster House policy").json()
    with staff.factory.begin() as db:
        job = db.get(Job, queued["id"])
        job.status, job.attempts = "running", 1
        job.claimed_at = datetime.now(timezone.utc) - timedelta(minutes=11)
    staff.drain()
    with staff.factory() as db:
        job = db.get(Job, queued["id"])
        assert (job.status, job.attempts) == ("succeeded", 2)


# ---------------------------------------------------------------------------- live adapter


def live_reply(candidates, status=200):
    body = {
        "choices": [{"message": {"content": ModelOutput(candidates=candidates).model_dump_json()}}]
    }
    seen = []

    def transport(url, headers, body_bytes, timeout):
        seen.append((url, headers, json.loads(body_bytes), timeout))
        return status, json.dumps(body).encode()

    return transport, seen


def test_live_adapter_request_shape_and_end_to_end_via_worker(staff, monkeypatch):
    monkeypatch.setattr(settings, "ai_api_key", "test-key-do-not-leak")
    aster = block_of(staff.factory, "Aster House policy")
    transport, seen = live_reply(
        [candidate(aster.id, "Fictional Aster House permits two cats.", statement="live rule")]
    )
    factory = lambda name: OpenAICompatibleProvider(transport=transport)  # noqa: E731
    queued = staff.queue(
        "Aster House policy", provider="openai_compatible", acknowledge_external_processing=True
    )
    assert queued.status_code == 201
    staff.drain(factory)
    url, headers, body, _ = seen[0]
    assert (
        url.endswith("/chat/completions")
        and headers["Authorization"] == "Bearer test-key-do-not-leak"
    )
    assert "test-key-do-not-leak" not in json.dumps(body)
    assert body["response_format"]["json_schema"]["strict"] is True
    assert "untrusted data" in body["messages"][0]["content"]
    payload = json.loads(body["messages"][1]["content"])
    assert payload["blocks"][0]["block_id"] == aster.id
    assert [p["id"] for p in payload["properties"]] == [key("Aster House"), key("Birch Court")]
    item = staff.items()[0]
    assert item["simulated"] is False and item["provider"].startswith("openai_compatible:")
    assert item["evidence_status"] == "verified" and item["staff_review_state"] == "pending"
    job = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]
    assert job["summary"]["simulated"] is False and "test-key" not in json.dumps(job)


@pytest.mark.parametrize(
    "status, code, retryable",
    [
        (401, "provider_auth_failed", False),
        (429, "provider_http_429", True),
        (503, "provider_http_503", True),
        (400, "provider_http_400", False),
    ],
)
def test_live_adapter_error_mapping(monkeypatch, status, code, retryable):
    monkeypatch.setattr(settings, "ai_api_key", "k")
    provider = OpenAICompatibleProvider(transport=lambda *a: (status, b"secret body"))
    with pytest.raises(ProviderError) as caught:
        provider.extract(ExtractionRequest([BlockInput("b", "text", "")]))
    assert (caught.value.code, caught.value.retryable) == (code, retryable)
    assert "secret body" not in str(caught.value)


def test_live_adapter_rejects_malformed_refused_and_unconfigured_output(monkeypatch):
    request = ExtractionRequest([BlockInput("b", "text", "")])
    monkeypatch.setattr(settings, "ai_api_key", None)
    with pytest.raises(ProviderError, match="provider_not_configured"):
        OpenAICompatibleProvider(transport=lambda *a: (200, b"{}")).extract(request)
    monkeypatch.setattr(settings, "ai_api_key", "k")

    def reply(message):
        return lambda *a: (200, json.dumps({"choices": [{"message": message}]}).encode())

    for message in (
        {"content": "not json"},
        {"content": json.dumps({"candidates": [{"statement": "missing fields"}]})},
        {"content": json.dumps({"candidates": [], "approved": True})},
    ):
        with pytest.raises(ProviderError) as caught:
            OpenAICompatibleProvider(transport=reply(message)).extract(request)
        assert caught.value.code == "provider_invalid_output" and caught.value.retryable
    with pytest.raises(ProviderError) as caught:
        OpenAICompatibleProvider(transport=reply({"refusal": "no", "content": None})).extract(
            request
        )
    assert caught.value.code == "provider_refused" and not caught.value.retryable


# ---------------------------------------------------------------------------- isolation


def test_every_m2_route_is_isolated_by_project_membership(staff):
    staff.extract()
    version = staff.items()[0]["id"]
    other = staff.items()[1]["id"]
    group = staff.conflicts()[0]["id"]
    job = staff.req("GET", f"/api/projects/{PID}/extraction-jobs").json()[0]["id"]
    base = f"/api/projects/{PID}"
    attacks = [
        ("GET", f"{base}/requirements", None),
        ("GET", f"{base}/requirements/{version}", None),
        ("PATCH", f"{base}/requirements/{version}", {"statement": "tampered"}),
        ("POST", f"{base}/requirements/{version}/accept", {"confirm_scope": True}),
        ("POST", f"{base}/requirements/{version}/reject", {"reason": "no"}),
        ("POST", f"{base}/requirements/{version}/reopen", {}),
        ("POST", f"{base}/requirements/{version}/duplicate", {"canonical_id": other}),
        ("POST", f"{base}/requirements/{version}/merge", {"canonical_id": other}),
        ("GET", f"{base}/conflicts", None),
        ("POST", f"{base}/conflicts/{group}/triage", {"state": "confirmed"}),
        ("GET", f"{base}/extraction-jobs", None),
        ("POST", f"{base}/extraction-jobs", {"source_version_id": vid("Contact roster")}),
        ("POST", f"{base}/extraction-jobs/{job}/retry", {}),
    ]
    assert staff.req("POST", "/api/auth/logout", {}).status_code == 204
    assert staff.req("GET", f"{base}/requirements").status_code == 401
    outsider = sign_in(staff.web, "outsider@example.invalid", "another-fictional-passphrase")
    for method, path, data in attacks:
        assert call(staff.web, method, path, data, outsider).status_code == 404, (method, path)
    # The same ids are unreachable through the outsider's own project.
    org = post(staff.web, "/api/organizations", {"name": "Outsider group"}, outsider).json()
    own = post(
        staff.web, "/api/projects", {"name": "Own", "organization_id": org["id"]}, outsider
    ).json()["id"]
    for method, suffix, data in (
        ("GET", f"/requirements/{version}", None),
        ("PATCH", f"/requirements/{version}", {"statement": "tampered"}),
        ("POST", f"/requirements/{version}/accept", {"confirm_scope": True}),
        ("POST", f"/conflicts/{group}/triage", {"state": "confirmed"}),
        ("POST", f"/extraction-jobs/{job}/retry", {}),
    ):
        response = call(staff.web, method, f"/api/projects/{own}{suffix}", data, outsider)
        assert response.status_code == 404, (method, suffix)
    cross = call(
        staff.web,
        "POST",
        f"/api/projects/{own}/extraction-jobs",
        {"source_version_id": vid("Contact roster"), "provider": "mock"},
        outsider,
    )
    assert cross.status_code == 404
    with staff.factory() as db:
        assert (
            db.scalar(select(RequirementVersion.statement).where(RequirementVersion.id == version))
            != "tampered"
        )
        assert (
            db.scalar(select(ConflictGroup.triage_state).where(ConflictGroup.id == group)) == "open"
        )


def test_cross_project_references_are_rejected(staff):
    staff.extract(["Aster House policy"])
    mine = staff.items()[0]
    org = staff.req("GET", "/api/organizations").json()[0]["id"]
    second = staff.req("POST", "/api/projects", {"name": "Second", "organization_id": org}).json()
    sid = second["id"]
    upload = staff.web.post(
        f"/api/projects/{sid}/sources/upload",
        files={"file": ("rules.txt", b"Fictional Alder House permits one cat.", "text/plain")},
        headers={"origin": "http://localhost:3000", "x-csrf-token": staff.csrf},
    )
    assert upload.status_code == 201
    from app.parsing import parse_document

    assert worker.run_once(staff.memory, parse_document)
    job = staff.req(
        "POST",
        f"/api/projects/{sid}/extraction-jobs",
        {"source_version_id": upload.json()["id"], "provider": "mock"},
    )
    assert job.status_code == 201
    worker.run_extraction_once(get_provider)
    theirs = staff.req("GET", f"/api/projects/{sid}/requirements").json()["items"]
    assert len(theirs) == 1
    prop = staff.req("POST", f"/api/projects/{sid}/properties", {"name": "Second building"}).json()
    base = f"/api/projects/{sid}/requirements/{theirs[0]['id']}"
    assert staff.req("POST", base + "/duplicate", {"canonical_id": mine["id"]}).status_code == 404
    assert staff.req("POST", base + "/merge", {"canonical_id": mine["id"]}).status_code == 404
    foreign_property = mine["scope"]["property_id"]
    assert (
        staff.req(
            "PATCH", base, {"scope_type": "property", "property_id": foreign_property}
        ).status_code
        == 404
    )
    assert (
        staff.req("PATCH", base, {"scope_type": "property", "property_id": prop["id"]}).status_code
        == 200
    )
    # The evidence trail of one project never shows another project's source text.
    assert "Aster" not in json.dumps(staff.req("GET", base).json())
    with staff.factory() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(Job)
                .where(Job.project_id == sid, Job.kind == "extraction")
            )
            == 1
        )


# ---------------------------------------------------------------------------- review workflow


def test_staff_review_never_approves_and_preserves_the_ai_proposal(staff):
    staff.extract()
    item = staff.find("emergency_routing", "Birch Court", "transfer_to_maintenance_supervisor")
    original = staff.detail(item["id"])["ai_proposal"]
    path = staff.path(item["id"])

    needs_scope = staff.req("POST", path + "/accept", {})
    assert needs_scope.status_code == 409 and "scope" in needs_scope.text
    accepted = staff.req("POST", path + "/accept", {"confirm_scope": True, "note": "Reviewed"})
    assert accepted.status_code == 200
    body = accepted.json()
    assert body["staff_review_state"] == "accepted"
    assert body["customer_confirmation_state"] == "not_confirmed"
    assert body["approval_status"] == "not_approved" and "not approved" in body["review_label"]
    assert body["scope"]["confirmed_by_staff"] is True
    assert staff.req("POST", path + "/accept", {"confirm_scope": True}).status_code == 409

    # Customer confirmation cannot be set through any staff route.
    assert staff.req("PATCH", path, {"customer_confirmation_state": "confirmed"}).status_code == 422
    assert staff.req("PATCH", path, {"staff_review_state": "accepted"}).status_code == 422

    edited = staff.req(
        "PATCH",
        path,
        {
            "statement": "Weekend emergencies go to the on-call supervisor.",
            "title": "Weekend route",
        },
    )
    assert edited.status_code == 200
    assert edited.json()["staff_review_state"] == "pending"  # an edit needs fresh review
    detail = staff.detail(item["id"])
    assert detail["ai_proposal"] == original
    assert detail["statement"].startswith("Weekend emergencies go to the on-call")
    audit = next(a for a in detail["audit"] if a["action"] == "candidate.edited")
    assert audit["detail"]["changes"]["statement"]["before"] == item["statement"]
    assert audit["detail"]["returned_to_pending"] is True
    assert audit["actor"] == "specialist@example.invalid"
    decisions = [r["decision"] for r in detail["reviews"]]
    assert decisions == ["candidate_accepted"]
    with staff.factory() as db, pytest.raises(Exception, match="[Ii]mmutable"):
        db.execute(
            update(RequirementVersion)
            .where(RequirementVersion.id == item["id"])
            .values(ai_proposal={"tampered": True})
        )
        db.commit()

    assert staff.req("POST", path + "/reject", {}).status_code == 422  # reason required
    rejected = staff.req("POST", path + "/reject", {"reason": "Superseded by the roster"})
    assert rejected.json()["review_state"] == "rejected"
    assert staff.req("PATCH", path, {"statement": "x"}).status_code == 409
    assert (
        staff.req("POST", path + "/reopen", {"reason": "Mistake"}).json()["staff_review_state"]
        == "pending"
    )
    assert staff.req("POST", path + "/reopen", {}).status_code == 409
    counts = staff.req("GET", f"/api/projects/{PID}/requirements").json()["counts"]
    assert counts["pending"] == 9 and counts["accepted"] == 0
    with staff.factory() as db:
        assert db.scalar(select(func.count()).select_from(StaffReview)) == 3


def test_scope_assignment_is_validated_and_marks_scope_reviewed(staff):
    staff.extract(["Website snapshot"])
    item = staff.find("emergency_routing", "Company-wide", "transfer_to_front_desk")
    path = staff.path(item["id"])
    bad = (
        {"scope_type": "property"},
        {"scope_type": "company", "property_id": key("Aster House")},
        {"scope_type": "portfolio", "property_id": key("Aster House")},
        {"property_id": key("Aster House")},
        {"scope_type": "weekly"},
    )
    for payload in bad:
        assert staff.req("PATCH", path, payload).status_code in {422}, payload
    ok = staff.req("PATCH", path, {"scope_type": "property", "property_id": key("Aster House")})
    assert ok.status_code == 200
    assert ok.json()["scope"]["name"] == "Fictional Aster House"
    assert ok.json()["scope"]["confirmed_by_staff"] is True
    accepted = staff.req("POST", path + "/accept", {})
    assert accepted.status_code == 200  # scope was already confirmed by the explicit assignment
    edited = staff.req(
        "PATCH", path, {"category": "maintenance", "conditions": ["Weekend", "weekend"]}
    )
    assert edited.status_code == 200
    detail = staff.detail(item["id"])
    assert detail["category"] == "maintenance" and detail["conditions"] == ["weekend"]


def test_duplicate_and_merge_are_final_and_keep_evidence(staff):
    staff.extract()
    old = staff.find("emergency_routing", "Birch Court", "transfer_to_front_desk")
    transcript = staff.find(
        "emergency_routing", "Birch Court", "transfer_to_maintenance_supervisor"
    )
    aster_em = staff.find("emergency_routing", "Aster House", "transfer_to_maintenance_supervisor")
    pet_a = staff.find("pet_policy", "Aster House", "allow_2_cat")
    pet_b = staff.find("pet_policy", "Birch Court", "allow_1_cat")

    assert (
        staff.req("POST", staff.path(old["id"], "/merge"), {"canonical_id": old["id"]}).status_code
        == 422
    )
    mismatch = staff.req(
        "POST", staff.path(aster_em["id"], "/merge"), {"canonical_id": transcript["id"]}
    )
    assert mismatch.status_code == 409 and "identical scope" in mismatch.text

    merged = staff.req(
        "POST",
        staff.path(old["id"], "/merge"),
        {"canonical_id": transcript["id"], "note": "Same rule"},
    )
    assert merged.status_code == 200 and merged.json()["review_state"] == "merged"
    assert merged.json()["duplicate_of"] == transcript["id"]
    target = staff.detail(transcript["id"])
    assert len(target["evidence"]) == 2 and target["duplicates_of_this"] == [old["id"]]
    assert {e["source"]["document"] for e in target["evidence"]} == {
        "Birch Court transcript",
        "Birch Court old SOP",
    }
    assert "candidate.merge_target" in [a["action"] for a in target["audit"]]
    # The merged-away candidate keeps its own proposal and evidence.
    assert len(staff.detail(old["id"])["evidence"]) == 1
    for action, payload in (
        ("/reopen", {}),
        ("/accept", {"confirm_scope": True}),
        ("/reject", {"reason": "x"}),
    ):
        assert staff.req("POST", staff.path(old["id"], action), payload).status_code == 409
    assert staff.req("PATCH", staff.path(old["id"]), {"statement": "x"}).status_code == 409

    dup = staff.req("POST", staff.path(pet_b["id"], "/duplicate"), {"canonical_id": pet_a["id"]})
    assert dup.status_code == 200 and dup.json()["review_state"] == "duplicate"
    into_dup = staff.req(
        "POST", staff.path(pet_a["id"], "/duplicate"), {"canonical_id": pet_b["id"]}
    )
    assert into_dup.status_code == 409  # cannot fold into a candidate that is itself a duplicate
    assert len(staff.items(state="duplicate")) == 2
    counts = staff.req("GET", f"/api/projects/{PID}/requirements").json()["counts"]
    assert counts["duplicate"] == 2 and counts["pending"] == 7
    # Merged and duplicate candidates no longer drive conflict suggestions.
    assert not [g for g in staff.conflicts() if g["severity"] == "high"]
    assert not [g for g in staff.conflicts(kind="variant") if g["title"].startswith("Pet policy")]
    with staff.factory() as db:
        assert db.scalar(select(func.count()).select_from(RequirementDuplicate)) == 2
        with pytest.raises(Exception, match="[Ii]mmutable"):
            db.execute(update(RequirementDuplicate).values(kind="duplicate"))
            db.commit()
        db.rollback()
        with pytest.raises(Exception, match="[Ii]mmutable"):
            db.execute(update(CandidateProvenance).values(fingerprint="0" * 64))
            db.commit()


def test_requirement_list_filters(staff):
    staff.extract()
    assert len(staff.items(category="emergencies")) == 4
    assert len(staff.items(scope_type="company")) == 4
    assert len(staff.items(property_id=key("Birch Court"))) == 3
    pet = staff.find("pet_policy", "Aster House", "allow_2_cat")
    assert (
        staff.req("POST", staff.path(pet["id"], "/reject"), {"reason": "Out of scope"}).status_code
        == 200
    )
    assert len(staff.items(state="rejected")) == 1 and len(staff.items(state="pending")) == 8
    page = staff.req("GET", f"/api/projects/{PID}/requirements?limit=2&offset=8").json()
    assert page["total"] == 9 and len(page["items"]) == 1
    assert staff.req("GET", f"/api/projects/{PID}/requirements?state=approved").status_code == 422


# ---------------------------------------------------------------------------- conflict triage


def test_conflict_triage_is_a_classification_that_survives_and_never_resolves(staff):
    staff.extract()
    high = next(g for g in staff.conflicts() if g["severity"] == "high")
    path = f"/api/projects/{PID}/conflicts/{high['id']}/triage"
    assert staff.req("POST", path, {"state": "dismissed"}).status_code == 422
    assert staff.req("POST", path, {"state": "resolved"}).status_code == 422
    confirmed = staff.req("POST", path, {"state": "confirmed", "rationale": "Ask the customer"})
    assert confirmed.json() == {"id": high["id"], "triage_state": "confirmed", "resolved": False}

    # An unrelated review decision recomputes suggestions but keeps the staff triage.
    other = staff.find("pet_policy", "Aster House", "allow_2_cat")
    assert (
        staff.req("POST", staff.path(other["id"], "/accept"), {"confirm_scope": True}).status_code
        == 200
    )
    survivor = next(g for g in staff.conflicts() if g["id"] == high["id"])
    assert survivor["triage_state"] == "confirmed" and survivor["resolved"] is False

    # Changing the substance of a member invalidates the triaged suggestion instead of reusing it.
    transcript = staff.find(
        "emergency_routing", "Birch Court", "transfer_to_maintenance_supervisor"
    )
    edit = staff.req(
        "PATCH", staff.path(transcript["id"]), {"proposed_action": "transfer_to_front_desk"}
    )
    assert edit.status_code == 200
    assert high["id"] not in {g["id"] for g in staff.conflicts()}
    obsolete = staff.conflicts(triage_state="obsolete")
    assert [g["id"] for g in obsolete] == [high["id"]]
    assert staff.req("POST", path, {"state": "open"}).status_code == 409
    assert not [g for g in staff.conflicts() if g["severity"] == "high"]

    dismissed = staff.conflicts(kind="conflict")[0]
    ok = staff.req(
        "POST",
        f"/api/projects/{PID}/conflicts/{dismissed['id']}/triage",
        {"state": "dismissed", "rationale": "Company default is intentionally overridden"},
    )
    assert ok.status_code == 200
    assert [g for g in staff.conflicts(triage_state="dismissed")][0]["triage_rationale"].startswith(
        "Company"
    )
    with staff.factory() as db:
        actions = list(
            db.scalars(select(AuditEvent.action).where(AuditEvent.action == "conflict.triaged"))
        )
        assert len(actions) == 2
        assert (
            db.scalar(
                select(func.count())
                .select_from(ConflictGroup)
                .where(ConflictGroup.resolved.is_(True))
            )
            == 0
        )


def test_rejecting_a_member_removes_the_open_suggestion(staff):
    staff.extract()
    high = next(g for g in staff.conflicts() if g["severity"] == "high")
    member = high["members"][0]["id"]
    assert (
        staff.req("POST", staff.path(member, "/reject"), {"reason": "Obsolete SOP"}).status_code
        == 200
    )
    assert high["id"] not in {g["id"] for g in staff.conflicts()}
    assert staff.req("POST", staff.path(member, "/reopen"), {}).status_code == 200
    assert any(g["severity"] == "high" for g in staff.conflicts())


# ---------------------------------------------------------------------------- pure detection


def rule(id_, action, scope=("company", None), conditions=(), topic="emergency_routing", **extra):
    kind, ident = scope
    return SimpleNamespace(
        id=id_,
        category="emergencies",
        topic=topic,
        proposed_action=action,
        scope_type=kind,
        property_id=ident if kind == "property" else None,
        portfolio_id=ident if kind == "portfolio" else None,
        conditions=list(conditions),
        missing_information=extra.get("missing", []),
        requires_live_lookup=extra.get("live", False),
        statement="Statement",
    )


PROPERTIES = [
    SimpleNamespace(id="p1", name="One", portfolio_id="pf"),
    SimpleNamespace(id="p2", name="Two", portfolio_id="pf"),
    SimpleNamespace(id="p3", name="Three", portfolio_id=None),
]
PORTFOLIOS = [SimpleNamespace(id="pf", name="East")]


def classify(*rules):
    """Conflict/variant suggestions only; coverage gaps are exercised separately."""
    groups = detect(list(rules), PROPERTIES, PORTFOLIOS)
    return [(g["kind"], g["severity"]) for g in groups if g["kind"] != "gap"]


def test_scope_and_condition_rules_for_conflicts_variants_and_noise():
    p1, p2, p3 = ("property", "p1"), ("property", "p2"), ("property", "p3")
    weekend = ["weekend"]
    assert classify(rule("a", "x", p1, weekend), rule("b", "y", p1, weekend)) == [
        ("conflict", "high")
    ]
    assert classify(rule("a", "x", p1, weekend), rule("b", "y", p1, [])) == [("conflict", "medium")]
    assert classify(rule("a", "x"), rule("b", "y", p1)) == [("conflict", "medium")]
    assert classify(rule("a", "x", conditions=weekend), rule("b", "y", p1)) == [("conflict", "low")]
    pf = ("portfolio", "pf")
    assert classify(rule("a", "x", pf), rule("b", "y", p1)) == [("conflict", "medium")]
    assert classify(rule("a", "x", pf), rule("b", "y", p3)) == [("variant", "info")]
    assert classify(rule("a", "x", p1), rule("b", "y", p2)) == [("variant", "info")]
    assert classify(rule("a", "x", p1, ["weekday"]), rule("b", "y", p1, weekend)) == []
    assert classify(rule("a", "x", p1), rule("b", "x", p1)) == []
    assert classify(rule("a", None, p1), rule("b", "y", p1)) == []
    assert classify(rule("a", "x", p1), rule("b", "y", p1, topic="pets")) == []
    twin = detect([rule("a", "x", p1), rule("b", "y", p1)], PROPERTIES, PORTFOLIOS)[0]
    assert (
        twin["signature"]
        == detect([rule("b", "y", p1), rule("a", "x", p1)], PROPERTIES, PORTFOLIOS)[0]["signature"]
    )
    changed = detect([rule("a", "z", p1), rule("b", "y", p1)], PROPERTIES, PORTFOLIOS)[0]
    assert changed["signature"] != twin["signature"]


def test_gap_detection_for_missing_information_live_lookup_and_coverage():
    gaps = detect(
        [rule("a", None, ("property", "p1"), missing=["backup phone"], live=True)],
        PROPERTIES,
        PORTFOLIOS,
    )
    kinds = sorted((g["kind"], g["severity"]) for g in gaps)
    assert kinds == [("gap", "low"), ("gap", "low"), ("gap", "medium")]  # missing, live, coverage
    coverage = next(g for g in gaps if "No emergency routing rule" in g["title"])
    assert coverage["scope_intersection"]["uncovered_property_ids"] == ["p2", "p3"]
    covered_by_portfolio = detect([rule("a", "x", ("portfolio", "pf"))], PROPERTIES, PORTFOLIOS)
    assert covered_by_portfolio[0]["scope_intersection"]["uncovered_property_ids"] == ["p3"]
    assert detect([rule("a", "x")], PROPERTIES, PORTFOLIOS) == []  # company-wide covers everyone
