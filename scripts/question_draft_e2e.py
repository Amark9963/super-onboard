"""Check live AI clarification wording against a fictional M2 conflict; never send a link."""

import json
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
EMAIL, PASSWORD = Path(".local/demo-login.txt").read_text().splitlines()[:2]
client = build_opener(HTTPCookieProcessor(CookieJar()))


def call(path, data=None, csrf=None):
    headers = {"Origin": BASE} if data is not None else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(
        BASE + "/api" + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
    )
    try:
        with client.open(request, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else None
    except HTTPError as error:
        raise AssertionError(
            f"{path}: HTTP {error.code}: {error.read(500).decode(errors='replace')}"
        ) from None


login = call("/auth/login", {"email": EMAIL, "password": PASSWORD})
csrf = login["csrf_token"]
try:
    projects = call("/projects")
    project = next(p for p in projects if p["name"] == "Fictional M2 walkthrough")
    project_id = project["id"]
    before = len(call(f"/projects/{project_id}/review-requests"))
    conflicts = call(f"/projects/{project_id}/conflicts")
    conflict = next(g for g in conflicts if g["kind"] == "conflict" and g["severity"] == "high")
    suggestion = call(
        f"/projects/{project_id}/question-suggestions",
        {"conflict_id": conflict["id"], "acknowledge_external_processing": True},
        csrf,
    )
    assert suggestion["model"] == "gpt-6.1-sol"
    assert suggestion["review_required"] is True
    assert suggestion["conflict_id"] == conflict["id"]
    assert 10 <= len(suggestion["question"]) <= 500
    assert len(call(f"/projects/{project_id}/review-requests")) == before
    print("PASS: live AI suggested an editable question; no customer request or email was created")
    print("Suggested wording: " + suggestion["question"])
finally:
    call("/auth/logout", {}, csrf)
