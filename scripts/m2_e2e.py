"""Live fictional extraction -> citation check -> staff review -> conflict flow (M2).

Requires .local/demo-login.txt and the Compose stack. Uses the SIMULATED mock provider only, so
this verifies the pipeline and its safeguards, not real AI extraction quality. Safe to re-run: it
reuses the "Fictional M2 walkthrough" project and relies on extraction de-duplication.
"""

import json
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
email, password = Path(".local/demo-login.txt").read_text().splitlines()[:2]
browser = build_opener(HTTPCookieProcessor(CookieJar()))


def call(path, data=None, csrf=None, method=None, content_type="application/json"):
    headers = {"Origin": BASE} if data is not None or method else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = content_type
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
    request = Request(BASE + "/api" + path, data=data, headers=headers, method=method)
    with browser.open(request, timeout=30) as response:
        payload = response.read()
        if not payload:
            return None
        return json.loads(payload) if response.headers.get_content_type() == "application/json" else payload


def expect_error(code, *args, **kwargs):
    try:
        call(*args, **kwargs)
    except HTTPError as error:
        assert error.code == code, (error.code, error.read()[:200])
        return error.read()
    raise AssertionError(f"expected HTTP {code}")


def upload(pid, csrf, name, content):
    boundary = "super-onboard-m2-fixture"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
        "Content-Type: text/plain\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return call(f"/projects/{pid}/sources/upload", body, csrf, content_type=f"multipart/form-data; boundary={boundary}")


def wait(predicate, what, seconds=60):
    for _ in range(seconds):
        value = predicate()
        if value:
            return value
        time.sleep(1)
    raise AssertionError(f"timed out waiting for {what}")


login = call("/auth/login", {"email": email, "password": password})
csrf = login["csrf_token"]
org = next(o for o in call("/organizations") if o["name"] == "Fictional Lantern Property Group")
project = next((p for p in call("/projects") if p["name"] == "Fictional M2 walkthrough"), None)
if project is None:
    project = call("/projects", {"name": "Fictional M2 walkthrough", "organization_id": org["id"]}, csrf)
pid = project["id"]

scopes = call(f"/projects/{pid}/scopes")
existing = {p["name"] for p in scopes["properties"]}
for building in ("Fictional Aster House", "Fictional Birch Court"):
    if building not in existing:
        call(f"/projects/{pid}/properties", {"name": building}, csrf)

fixtures = {
    "Fictional Aster rules.txt": b"Fictional Aster House permits two cats.\nFictional Aster House emergencies route to the on-call maintenance supervisor.",
    "Fictional Birch old SOP.txt": b"Fictional obsolete SOP: Fictional Birch Court weekend emergencies go to the front desk.",
}
sources = call(f"/projects/{pid}/sources")
known = {s["name"] for s in sources}
for name, content in fixtures.items():
    if name not in known:
        upload(pid, csrf, name, content)
if "Fictional Birch call.txt" not in known:
    call(
        f"/projects/{pid}/sources/transcript",
        {
            "name": "Fictional Birch call",
            "text": "00:12 Fictional Birch Court allows one cat.\n01:03 Fictional Birch Court weekend emergencies may go to the supervisor; please confirm.",
        },
        csrf,
    )


def parsed_versions():
    versions = [v for s in call(f"/projects/{pid}/sources") for v in s["versions"]]
    if len(versions) >= 3 and all(v["parse_status"] == "parsed" for v in versions):
        return versions


versions = wait(parsed_versions, "source parsing")

providers = call("/ai/providers")
assert providers[0]["id"] == "mock" and providers[0]["simulated"] is True
for version in versions:
    try:
        call(
            f"/projects/{pid}/extraction-jobs",
            {"source_version_id": version["id"], "provider": "mock"},
            csrf,
        )
    except HTTPError as error:
        assert error.code == 409  # already queued on a previous run


def jobs_done():
    jobs = call(f"/projects/{pid}/extraction-jobs")
    if jobs and all(j["status"] in {"succeeded", "failed"} for j in jobs):
        return jobs


jobs = wait(jobs_done, "extraction jobs")
assert all(j["status"] == "succeeded" for j in jobs), jobs
assert all(j["summary"]["simulated"] for j in jobs)

listing = call(f"/projects/{pid}/requirements?limit=200")
items = listing["items"]
assert listing["total"] == 5, listing["total"]
for item in items:
    assert item["simulated"] is True
    assert item["evidence_status"] == "verified"
    assert item["customer_confirmation_state"] == "not_confirmed"
    assert item["approval_status"] == "not_approved"

transcript_rule = next(
    i for i in items
    if i["scope"]["name"] == "Fictional Birch Court" and i["proposed_action"] == "transfer_to_maintenance_supervisor"
)
detail = call(f"/projects/{pid}/requirements/{transcript_rule['id']}")
evidence = detail["evidence"][0]
assert evidence["quote_match_state"] == "exact"
assert evidence["block"]["text"][evidence["char_start"] : evidence["char_end"]] == evidence["quoted_text"]
assert evidence["block"]["locator"].get("timestamp_start") == 63, evidence["block"]["locator"]
assert detail["ai_proposal"]["simulated"] is True

groups = call(f"/projects/{pid}/conflicts")
high = [g for g in groups if g["kind"] == "conflict" and g["severity"] == "high"]
assert len(high) == 1 and {m["scope"]["name"] for m in high[0]["members"]} == {"Fictional Birch Court"}
variants = [g for g in groups if g["kind"] == "variant"]
assert any(g["title"].startswith("Pet policy") for g in variants), "pet limits must be a variant"
assert not any("Pet policy" in g["title"] for g in groups if g["kind"] == "conflict")

# Staff review: acceptance needs a verified citation and an explicit scope confirmation.
target = detail
if target["staff_review_state"] == "pending":
    expect_error(409, f"/projects/{pid}/requirements/{target['id']}/accept", {}, csrf)
    accepted = call(f"/projects/{pid}/requirements/{target['id']}/accept", {"confirm_scope": True}, csrf)
else:
    accepted = call(f"/projects/{pid}/requirements/{target['id']}")
assert accepted["staff_review_state"] == "accepted"
assert accepted["customer_confirmation_state"] == "not_confirmed"
assert accepted["approval_status"] == "not_approved"
assert call(f"/projects/{pid}/requirements/{target['id']}")["ai_proposal"] == detail["ai_proposal"]

triaged = call(f"/projects/{pid}/conflicts/{high[0]['id']}/triage", {"state": "confirmed", "rationale": "Ask the customer"}, csrf)
assert triaged["triage_state"] == "confirmed" and triaged["resolved"] is False

call("/auth/logout", b"{}", csrf)
expect_error(401, f"/projects/{pid}/requirements")
print("PASS: SIMULATED extraction, verified citations, staff review (not approval), conflict/variant grouping, triage, logout")
