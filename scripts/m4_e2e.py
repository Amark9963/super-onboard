"""Live fictional M4 flow: customer-backed conflict resolution -> approved-only blueprint and test
plan with source references -> exports -> revision keeps the baseline -> audit trail.

Requires .local/demo-login.txt and the Compose stack. It builds on the walkthrough project that
m2_e2e.py and m3_e2e.py populate (run those first). Fictional data only; safe to re-run.
"""

import json
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
email, password = Path(".local/demo-login.txt").read_text().splitlines()[:2]
staff = build_opener(HTTPCookieProcessor(CookieJar()))
customer = build_opener(HTTPCookieProcessor(CookieJar()))


def call(opener, path, data=None, csrf=None, method=None, raw=False):
    headers = {"Origin": BASE} if data is not None or method else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    request = Request(BASE + "/api" + path, data=data, headers=headers, method=method)
    with opener.open(request, timeout=30) as response:
        payload = response.read()
        if raw:
            return payload.decode(), {k.lower(): v for k, v in response.headers.items()}
        return json.loads(payload) if payload else None


def expect(code, *args, **kwargs):
    try:
        call(*args, **kwargs)
    except HTTPError as error:
        assert error.code == code, (error.code, error.read()[:200])
        return
    raise AssertionError(f"expected HTTP {code}")


login = call(staff, "/auth/login", {"email": email, "password": password})
csrf = login["csrf_token"]
S = lambda path, data=None, method=None: call(staff, path, data, csrf, method)  # noqa: E731
pid = next(p for p in S("/projects") if p["name"] == "Fictional M2 walkthrough")["id"]
contact = S(f"/projects/{pid}/contacts")[0]["id"]


def open_high():
    return [
        g
        for g in S(f"/projects/{pid}/conflicts?kind=conflict")
        if g["severity"] == "high" and not g["resolved"] and g["triage_state"] != "dismissed"
    ]


# 1. A customer answer backs the resolution of a high-severity conflict.
resolved_here = False
for group in open_high():
    members = group["members"]
    assert all(m["customer_confirmation_state"] == "confirmed" for m in members), (
        "run scripts/m3_e2e.py first so the conflicting rules have validated confirmations"
    )
    choices = [m["statement"][:90] for m in members]
    created = S(
        f"/projects/{pid}/review-requests",
        {
            "title": "Fictional weekend routing clarification",
            "contact_id": contact,
            "items": [
                {
                    "kind": "question",
                    "question": "Which of these rules applies?",
                    "answer_type": "single_choice",
                    "choices": choices,
                    "conflict_id": group["id"],
                }
            ],
        },
    )
    sent = S(
        f"/projects/{pid}/review-requests/{created['request_id']}/invitations/{created['invitation']['id']}/send",
        {"deliver_email": False},
    )
    token = sent["link"].rsplit("/", 1)[1]
    page = call(customer, f"/public/review/{token}")
    item_id = page["items"][0]["item_id"]
    call(customer, f"/public/review/{token}/responses", {
        "submission_id": "m4-e2e-" + created["request_id"][:12],
        "responses": [{"item_id": item_id, "response_type": "answer", "answer": {"choice": choices[0]}}],
    })
    answer = next(r for r in S(f"/projects/{pid}/responses") if r["conflict_id"] == group["id"])
    blocked = S(f"/projects/{pid}/readiness")
    assert blocked["state"] == "blocked" and blocked["open_high_conflict_count"] >= 1
    expect(409, staff, f"/projects/{pid}/artifacts/blueprint/generate", {"acknowledge_exclusions": True}, csrf)
    expect(422, staff, f"/projects/{pid}/conflicts/{group['id']}/resolve",
           {"response_id": answer["response_id"], "chosen_version_id": members[0]["id"], "rationale": "short"}, csrf)
    done = S(f"/projects/{pid}/conflicts/{group['id']}/resolve", {
        "response_id": answer["response_id"], "chosen_version_id": members[0]["id"],
        "rationale": "The customer answered which fictional rule applies",
    })
    assert done["resolved"] is True
    expect(409, staff, f"/projects/{pid}/conflicts/{group['id']}/resolve", {
        "response_id": answer["response_id"], "chosen_version_id": members[0]["id"],
        "rationale": "The customer answered which fictional rule applies",
    }, csrf)
    resolved_here = True
assert not open_high(), "high-severity conflicts must be resolved before outputs"

# 2. Only approved, confirmed-and-validated rules reach the outputs.
approvals = S(f"/projects/{pid}/approvals")
approved = [a for a in approvals if a["approved"]]
assert approved, "no approved rules: run scripts/m3_e2e.py first"
assert all(a["blockers"] == [] for a in approved)
blueprint = S(f"/projects/{pid}/artifacts/blueprint/generate", {"acknowledge_exclusions": True})
plan = S(f"/projects/{pid}/artifacts/test_plan/generate", {"acknowledge_exclusions": True})
assert sorted(blueprint["requirement_version_ids"]) == sorted(a["requirement_version_id"] for a in approved)
assert not blueprint["stale"] and not plan["stale"]
detail = S(f"/projects/{pid}/artifacts/{blueprint['id']}")
structured = detail["structured"]
for rule in structured["approved_rules"]:
    source = rule["evidence"][0]  # every approved rule carries a verified source reference
    assert source["quoted_text"] and source["document"] and source["locator_text"]
    assert rule["customer_confirmation"]["basis"].startswith("Confirmed via bearer review link")
assert structured["sections"] and "Source:" in detail["markdown"] and "Not a live agent" in detail["markdown"]
test_plan = S(f"/projects/{pid}/artifacts/{plan['id']}")["structured"]["cases"]
ids = {c["id"] for c in test_plan}
assert any(i.endswith("-N") for i in ids) and any(i.endswith("-X") for i in ids) and any(i.endswith("-B") for i in ids)
md, headers = call(staff, f"/projects/{pid}/artifacts/{blueprint['id']}/export/md", raw=True)
assert md == detail["markdown"] and "attachment" in headers["content-disposition"]
exported, _ = call(staff, f"/projects/{pid}/artifacts/{plan['id']}/export/json", raw=True)
assert json.loads(exported)["kind"] == "test_plan"
assert S(f"/projects/{pid}/readiness")["state"] == "artifacts_current"

# 3. A revision never displaces the approved baseline until it is confirmed and validated.
revised = None
for candidate in approved:
    try:
        revised = S(
            f"/projects/{pid}/requirements/{candidate['requirement_version_id']}/revisions",
            {"statement": candidate["statement"] + " (fictional revision)", "reason": "Fictional policy change check"},
        )
        base = candidate
        break
    except HTTPError as error:
        assert error.code == 409  # a revision is already in progress for this rule
assert revised is None or revised["fresh_confirmation_required"]
if revised:
    still = {a["requirement_version_id"]: a for a in S(f"/projects/{pid}/approvals")}
    assert still[base["requirement_version_id"]]["approved"], "baseline must stay approved"
    ready = S(f"/projects/{pid}/readiness")
    assert ready["pending_revision_count"] >= 1 and ready["state"] == "artifacts_current"
    assert S(f"/projects/{pid}/requirements/{revised['id']}")["approval_status"] == "not_approved"

# 4. The audit trail shows who did what.
trail = S(f"/projects/{pid}/audit?limit=50")
actions = {e["action"] for e in trail["items"]}
assert {"artifact.generated", "artifact.exported"} <= actions, actions
assert any(e["actor"] == "customer link (unverified)" for e in trail["items"]) or trail["total"] > 50

S("/auth/logout", {})
expect(401, staff, f"/projects/{pid}/approvals")
print(
    "PASS: customer-backed conflict resolution"
    + (" recorded" if resolved_here else " (already resolved)")
    + ", approved-only blueprint/test plan with source references, exports, revision keeps baseline, audit trail, logout"
)
