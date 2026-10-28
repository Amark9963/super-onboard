"""M4: approval gate, customer-backed conflict resolution, exports, revisions, readiness, audit."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app import main
from app.mailer import get_mailer
from app.models import ArtifactVersion, ConflictResolution
from tests.support import PID, call, post, sign_in
from tests.test_m3 import Flow, Outbox


def path(suffix):
    return f"/api/projects/{PID}{suffix}"


@pytest.fixture
def anon(client):
    return TestClient(main.app)


@pytest.fixture
def flow(staff, client):
    main.app.dependency_overrides[get_mailer] = lambda: Outbox()
    return Flow(staff)


def submit(anon, token, build, submission="m4-submission-0001"):
    page = anon.get(f"/api/public/review/{token}").json()
    body = {"submission_id": submission, "responses": [build(i) for i in page["items"]]}
    response = anon.post(f"/api/public/review/{token}/responses", json=body)
    assert response.status_code == 200, response.text
    return page["items"]


def confirm_rules(item):
    return {"item_id": item["item_id"], "response_type": "confirm", "answer": {}}


def validate_pending(staff):
    rows = staff.req("GET", path("/responses")).json()
    for row in rows:
        if row["response_type"] == "confirm" and row["state"] == "awaiting_staff_review":
            result = staff.req(
                "POST",
                path(f"/responses/{row['response_id']}/review"),
                {
                    "decision": "validate_confirmation",
                    "rationale": "Checked against fictional notes",
                },
            )
            assert result.status_code == 200, result.text


def confirmed_pet(staff, flow, anon):
    """Aster pet rule: accepted, sent, confirmed by the customer, validated by staff."""
    staff.extract(["Aster House policy"])
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    _, _, token = flow.live([flow.rule(pet)])
    submit(anon, token, confirm_rules)
    validate_pending(staff)
    return pet


def generate(staff, kind, **body):
    return staff.req(
        "POST", path(f"/artifacts/{kind}/generate"), {"acknowledge_exclusions": True, **body}
    )


def blockers(staff, version_id):
    rows = staff.req("GET", path("/approvals")).json()
    return next(r for r in rows if r["requirement_version_id"] == version_id)


# ---------------------------------------------------------------------------- approval gate


def test_approval_needs_every_condition_and_a_customer_confirmation_alone_is_not_enough(
    staff, flow, anon
):
    staff.extract(["Aster House policy"])
    pet = staff.find("pet_policy", "Aster House", "allow_2_cat")
    start = blockers(staff, pet["id"])
    assert not start["approved"]
    assert {"staff_candidate_review", "scope_review", "customer_confirmation"} <= set(
        start["blockers"]
    )
    assert staff.detail(pet["id"])["approval_status"] == "not_approved"

    flow.accept("pet_policy", "Aster House", "allow_2_cat")
    assert blockers(staff, pet["id"])["blockers"] == ["customer_confirmation"]
    _, _, token = flow.live([flow.rule(pet)])
    submit(anon, token, confirm_rules)
    # The customer said yes, but no staff validation has happened: still not approved.
    assert blockers(staff, pet["id"])["blockers"] == ["customer_confirmation"]
    assert staff.detail(pet["id"])["approval_status"] == "not_approved"
    assert generate(staff, "blueprint").status_code == 409

    validate_pending(staff)
    done = blockers(staff, pet["id"])
    assert done["approved"] and done["blockers"] == []
    assert staff.detail(pet["id"])["approval_status"] == "approved"
    listing = {i["id"]: i for i in staff.items()}
    assert listing[pet["id"]]["approval_status"] == "approved"
    other = staff.find("emergency_routing", "Aster House", "transfer_to_maintenance_supervisor")
    assert listing[other["id"]]["approval_status"] == "not_approved"


def test_readiness_follows_the_workflow_and_describes_documents_only(staff, flow, anon):
    state = lambda: staff.req("GET", path("/readiness")).json()  # noqa: E731
    assert state()["state"] == "in_review"  # sources exist, nothing approved yet
    assert staff.queue("Aster House policy").status_code == 201
    assert state()["state"] == "extracting"
    staff.drain()
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    assert state()["state"] == "awaiting_customer" and state()["pending_confirmation_count"] == 1
    _, _, token = flow.live([flow.rule(pet)])
    submit(anon, token, confirm_rules)
    validate_pending(staff)
    ready = state()
    assert ready["state"] == "drafting_artifacts" and ready["approved_count"] == 1
    assert "no live agent" in ready["note"].lower()
    assert generate(staff, "blueprint").status_code == 201
    assert state()["state"] == "drafting_artifacts"  # the test plan is still missing
    assert generate(staff, "test_plan").status_code == 201
    assert state()["state"] == "artifacts_current"
    assert staff.req("GET", path("")).json()["readiness"] == "artifacts_current"


# ---------------------------------------------------------------------------- exports


def test_exports_are_sectioned_traceable_audited_and_immutable(staff, flow, anon):
    pet = confirmed_pet(staff, flow, anon)
    assert (
        staff.req("POST", path("/artifacts/blueprint/generate"), {}).status_code == 409
    )  # exclusions
    made = {}
    for kind in ("blueprint", "test_plan"):
        result = generate(staff, kind)
        assert result.status_code == 201, result.text
        made[kind] = result.json()
        assert made[kind]["version"] == 1 and not made[kind]["stale"]
        assert made[kind]["requirement_version_ids"] == [pet["id"]]
        assert made[kind]["exclusions"]  # unresolved items are listed, not hidden
    blueprint = staff.req("GET", path(f"/artifacts/{made['blueprint']['id']}")).json()
    structured = blueprint["structured"]
    rule = structured["approved_rules"][0]
    assert rule["requirement_version_id"] == pet["id"] and rule["scope"] == "Fictional Aster House"
    assert [s["key"] for s in structured["sections"]] == ["restrictions"]
    assert structured["sections"][0]["requirement_version_ids"] == [pet["id"]]
    assert "Business hours and after-hours logic" in structured["sections_without_approved_data"]
    source = rule["evidence"][0]
    assert source["document"] == "Aster House policy" and source["document_version"] == 1
    assert source["quoted_text"] == "Fictional Aster House permits two cats."
    assert source["locator_text"] and source["block_id"] and len(source["document_sha256"]) == 64
    assert "bearer review link" in rule["customer_confirmation"]["basis"]
    assert rule["customer_confirmation"]["validated_at"]
    markdown = blueprint["markdown"]
    assert "# Fictional onboarding demo — Blueprint v1" in markdown
    assert "Aster House policy v1" in markdown and pet["id"] in markdown
    assert (
        "Not covered by approved data" in markdown
        and "Unresolved issues and exclusions" in markdown
    )
    assert "No live" in markdown or "Not a live agent" in markdown

    plan = staff.req("GET", path(f"/artifacts/{made['test_plan']['id']}")).json()["structured"]
    ids = {c["id"] for c in plan["cases"]}
    assert {"T-001-N", "T-001-X", "T-001-B"} <= ids and any(i.startswith("U-") for i in ids)
    covered = [c for c in plan["cases"] if c["id"].startswith("T-")]
    assert all(c["source_references"] for c in covered)
    assert all(c["requirement_version_id"] == pet["id"] for c in covered)

    for artifact in made.values():
        exported = staff.req("GET", path(f"/artifacts/{artifact['id']}/export/json"))
        assert (
            exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
        )
        assert json.loads(exported.text)["version"] == 1
        md = staff.req("GET", path(f"/artifacts/{artifact['id']}/export/md"))
        assert md.headers["content-type"].startswith("text/markdown")
        assert md.headers["x-content-type-options"] == "nosniff"
    assert (
        staff.req("GET", path(f"/artifacts/{made['blueprint']['id']}/export/pdf")).status_code
        == 422
    )

    trail = staff.req("GET", path("/audit")).json()
    actions = [e["action"] for e in trail["items"]]
    assert actions.count("artifact.exported") == 4 and actions.count("artifact.generated") == 2
    assert "confirmation.validated" in actions and "response.submitted" in actions
    exported_event = next(e for e in trail["items"] if e["action"] == "artifact.exported")
    assert exported_event["actor"] == "specialist@example.invalid"
    assert next(e for e in trail["items"] if e["action"] == "response.submitted")["actor"] == (
        "customer link (unverified)"
    )
    assert staff.req("GET", path("/audit?limit=1")).json()["items"].__len__() == 1

    # Regenerating creates a new immutable version; the old one is never rewritten.
    again = generate(staff, "blueprint").json()
    assert again["version"] == 2
    with staff.factory() as db:
        first = db.get(ArtifactVersion, made["blueprint"]["id"])
        assert first.markdown == markdown
        with pytest.raises(Exception, match="[Ii]mmutable"):
            db.execute(
                update(ArtifactVersion).where(ArtifactVersion.id == first.id).values(markdown="x")
            )
            db.commit()


# ---------------------------------------------------------------------------- revisions


def test_a_revision_keeps_the_approved_baseline_until_it_is_confirmed_and_validated(
    staff, flow, anon
):
    pet = confirmed_pet(staff, flow, anon)
    first = {k: generate(staff, k).json() for k in ("blueprint", "test_plan")}
    state = lambda: staff.req("GET", path("/readiness")).json()  # noqa: E731
    assert state()["state"] == "artifacts_current"

    revise = lambda text: staff.req(  # noqa: E731
        "POST",
        path(f"/requirements/{pet['id']}/revisions"),
        {"statement": text, "reason": "Fictional policy changed after confirmation"},
    )
    assert revise(pet["statement"]).status_code == 422  # must change the wording
    revision = revise(pet["statement"] + " No dogs are permitted.")
    assert revision.status_code == 201, revision.text
    new_id = revision.json()["id"]
    assert (
        revision.json()["fresh_confirmation_required"]
        and revision.json()["supersedes_id"] == pet["id"]
    )
    assert revise("Another wording").status_code == 409  # one revision at a time

    # The confirmed baseline is untouched and still approved; the outputs are still current.
    assert blockers(staff, pet["id"])["approved"]
    assert staff.detail(pet["id"])["customer_confirmation_state"] == "confirmed"
    ready = state()
    assert ready["state"] == "artifacts_current" and ready["pending_revision_count"] == 1
    assert not any(a["stale"] for a in staff.req("GET", path("/artifacts")).json())
    assert staff.detail(new_id)["approval_status"] == "not_approved"

    # Fresh confirmation of the new wording, then staff validation.
    assert staff.req("POST", path(f"/requirements/{new_id}/accept"), {}).status_code == 200
    assert state()["state"] == "awaiting_customer"
    _, _, token = flow.live([flow.rule({"id": new_id})])
    submit(anon, token, confirm_rules, "m4-submission-0002")
    assert blockers(staff, pet["id"])["approved"]  # still the baseline until validation
    validate_pending(staff)

    # Now the revision supersedes the baseline and the earlier outputs are stale.
    approvals = {
        r["requirement_version_id"]: r for r in staff.req("GET", path("/approvals")).json()
    }
    assert approvals[new_id]["approved"] and pet["id"] not in approvals
    assert state()["state"] == "artifacts_stale"
    old_blueprint = staff.req("GET", path(f"/artifacts/{first['blueprint']['id']}")).json()
    assert old_blueprint["stale"] and old_blueprint["requirement_version_ids"] == [pet["id"]]
    assert "No dogs" not in old_blueprint["markdown"]  # earlier outputs are never rewritten
    assert staff.detail(pet["id"])["statement"] == pet["statement"]
    fresh = generate(staff, "blueprint").json()
    assert fresh["version"] == 2 and fresh["requirement_version_ids"] == [new_id]
    assert "No dogs" in staff.req("GET", path(f"/artifacts/{fresh['id']}")).json()["markdown"]
    generate(staff, "test_plan")
    assert state()["state"] == "artifacts_current"
    actions = [e["action"] for e in staff.req("GET", path("/audit")).json()["items"]]
    assert "requirement.revised_after_approval" in actions


# ---------------------------------------------------------------------------- conflicts


def test_a_high_conflict_blocks_outputs_until_a_customer_answer_backs_the_resolution(
    staff, flow, anon
):
    staff.extract(["Birch Court old SOP", "Birch Court transcript"])
    group = next(g for g in staff.conflicts() if g["severity"] == "high")
    old = staff.find("emergency_routing", "Birch Court", "transfer_to_front_desk")
    chosen = staff.find("emergency_routing", "Birch Court", "transfer_to_maintenance_supervisor")
    for item in (old, chosen):
        flow.accept("emergency_routing", "Birch Court", item["proposed_action"])
    question = {
        "kind": "question",
        "question": "Which route applies on weekends?",
        "answer_type": "single_choice",
        "choices": ["Front desk", "Supervisor"],
        "conflict_id": group["id"],
    }
    _, _, token = flow.live([flow.rule(old), flow.rule(chosen), question])

    def build(item):
        if item["kind"] == "question":
            return {
                "item_id": item["item_id"],
                "response_type": "answer",
                "answer": {"choice": "Supervisor"},
            }
        return confirm_rules(item)

    submit(anon, token, build)
    validate_pending(staff)
    for item in (old, chosen):
        assert "high_conflict" in blockers(staff, item["id"])["blockers"]
    ready = staff.req("GET", path("/readiness")).json()
    assert ready["state"] == "blocked" and ready["open_high_conflict_count"] == 1
    assert generate(staff, "blueprint").status_code == 409

    rows = staff.req("GET", path("/responses")).json()
    answer = next(r for r in rows if r["response_type"] == "answer")
    confirm = next(r for r in rows if r["response_type"] == "confirm")
    assert answer["conflict_id"] == group["id"]
    resolve = lambda **body: staff.req(  # noqa: E731
        "POST",
        path(f"/conflicts/{group['id']}/resolve"),
        {
            "response_id": answer["response_id"],
            "chosen_version_id": chosen["id"],
            "rationale": "The customer answered that the supervisor takes weekend calls",
            **body,
        },
    )
    assert resolve(rationale="short").status_code == 422
    assert resolve(response_id=confirm["response_id"]).status_code == 409  # not an answer
    assert resolve(chosen_version_id="not-a-member").status_code in (404, 409)
    done = resolve()
    assert done.status_code == 200 and done.json()["resolved"] is True
    assert resolve().status_code == 409  # already resolved

    assert blockers(staff, chosen["id"])["approved"]
    assert blockers(staff, old["id"])["blockers"] == ["conflict_selected_other_rule"]
    blueprint = generate(staff, "blueprint")
    assert blueprint.status_code == 201, blueprint.text
    structured = staff.req("GET", path(f"/artifacts/{blueprint.json()['id']}")).json()["structured"]
    assert [r["requirement_version_id"] for r in structured["approved_rules"]] == [chosen["id"]]
    resolution = structured["approved_rules"][0]["conflict_resolutions"][0]
    assert resolution["customer_response_id"] == answer["response_id"]
    assert any(e["requirement_version_id"] == old["id"] for e in structured["exclusions"])
    actions = [e["action"] for e in staff.req("GET", path("/audit")).json()["items"]]
    assert "conflict.resolved" in actions
    with staff.factory() as db:
        assert db.scalar(select(ConflictResolution)).chosen_version_id == chosen["id"]
        with pytest.raises(Exception, match="[Ii]mmutable"):
            db.execute(update(ConflictResolution).values(rationale="rewritten history"))
            db.commit()


# ---------------------------------------------------------------------------- isolation


def test_every_m4_route_is_isolated_by_project(staff, flow, anon):
    pet = confirmed_pet(staff, flow, anon)
    artifact = generate(staff, "blueprint").json()
    group = staff.conflicts()[0]["id"] if staff.conflicts() else "no-group"
    attacks = [
        ("GET", path("/readiness"), None),
        ("GET", path("/approvals"), None),
        ("GET", path("/audit"), None),
        ("GET", path("/artifacts"), None),
        ("GET", path(f"/artifacts/{artifact['id']}"), None),
        ("GET", path(f"/artifacts/{artifact['id']}/export/md"), None),
        ("GET", path(f"/artifacts/{artifact['id']}/export/json"), None),
        ("POST", path("/artifacts/blueprint/generate"), {"acknowledge_exclusions": True}),
        ("POST", path("/artifacts/test_plan/generate"), {"acknowledge_exclusions": True}),
        (
            "POST",
            path(f"/conflicts/{group}/resolve"),
            {"response_id": "x", "chosen_version_id": pet["id"], "rationale": "x" * 12},
        ),
        (
            "POST",
            path(f"/requirements/{pet['id']}/revisions"),
            {"statement": "Changed", "reason": "A long enough reason"},
        ),
    ]
    staff.req("POST", "/api/auth/logout")
    outsider = sign_in(staff.web, "outsider@example.invalid", "another-fictional-passphrase")
    for method, url, data in attacks:
        assert call(staff.web, method, url, data, outsider).status_code == 404, (method, url)
    org = post(staff.web, "/api/organizations", {"name": "Other"}, outsider).json()
    own = post(
        staff.web, "/api/projects", {"name": "Own", "organization_id": org["id"]}, outsider
    ).json()["id"]
    mine = f"/api/projects/{own}"
    for suffix in (f"/artifacts/{artifact['id']}", f"/artifacts/{artifact['id']}/export/json"):
        assert call(staff.web, "GET", mine + suffix, None, outsider).status_code == 404
    assert call(staff.web, "GET", mine + "/artifacts", None, outsider).json() == []
    assert (
        call(staff.web, "GET", mine + "/audit", None, outsider).json()["total"] == 1
    )  # only its own
    refused = call(
        staff.web,
        "POST",
        mine + "/artifacts/blueprint/generate",
        {"acknowledge_exclusions": True},
        outsider,
    )
    assert refused.status_code == 409  # nothing approved in the caller's own project
    assert call(staff.web, "GET", f"/api/projects/{own}", None, outsider).json()["readiness"] in {
        "intake",
        "in_review",
    }
