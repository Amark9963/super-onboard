"""One live extraction through the app using only fictional text.

Requires a configured OpenAI-compatible provider, running Compose stack, and the ignored
`.local/demo-login.txt`. Creates a fresh fictional project on each run and never prints secrets.
"""

import json
import time
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
EMAIL, PASSWORD = Path(".local/demo-login.txt").read_text().splitlines()[:2]
client = build_opener(HTTPCookieProcessor(CookieJar()))


def call(path, data=None, csrf=None, content_type="application/json"):
    headers = {"Origin": BASE} if data is not None else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = content_type
    if isinstance(data, dict):
        data = json.dumps(data).encode()
    request = Request(BASE + "/api" + path, data=data, headers=headers)
    with client.open(request, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None


def wait_for(check, label, seconds=150):
    for _ in range(seconds):
        result = check()
        if result is not None:
            return result
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for {label}")


login = call("/auth/login", {"email": EMAIL, "password": PASSWORD})
csrf = login["csrf_token"]
try:
    provider = next(p for p in call("/ai/providers") if p["id"] == "openai_compatible")
    assert provider["model"] == "gpt-6.1-sol", provider["model"]
    assert not provider["simulated"] and provider["external_processing"]

    organizations = call("/organizations")
    organization = next(
        (o for o in organizations if o["name"] == "Fictional Lantern Property Group"), None
    )
    if organization is None:
        organization = call("/organizations", {"name": "Fictional Lantern Property Group"}, csrf)
    suffix = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    project = call(
        "/projects",
        {"name": f"Fictional live AI check {suffix}", "organization_id": organization["id"]},
        csrf,
    )
    project_id = project["id"]
    call(f"/projects/{project_id}/properties", {"name": "Fictional Alder House"}, csrf)

    content = (
        "Fictional Alder House permits up to two cats per apartment.\n"
        "Fictional Alder House maintenance emergencies go to the on-call supervisor.\n"
        "Fictional Alder House office hours are Monday through Friday, 9:00 a.m. to 5:00 p.m."
    ).encode()
    boundary = "super-onboard-live-fictional"
    upload = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="Fictional live policy.txt"\r\nContent-Type: text/plain\r\n\r\n'
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    version = call(
        f"/projects/{project_id}/sources/upload",
        upload,
        csrf,
        f"multipart/form-data; boundary={boundary}",
    )

    def parsed():
        result = call(f"/projects/{project_id}/sources/versions/{version['id']}/blocks")
        status = result["version"]["parse_status"]
        if status in {"parsed", "failed", "needs_attention"}:
            assert status == "parsed", status
            return result

    evidence = wait_for(parsed, "fictional source parsing")
    assert evidence["total"] == 3
    job = call(
        f"/projects/{project_id}/extraction-jobs",
        {
            "source_version_id": version["id"],
            "provider": "openai_compatible",
            "acknowledge_external_processing": True,
        },
        csrf,
    )

    def finished():
        current = next(
            j for j in call(f"/projects/{project_id}/extraction-jobs") if j["id"] == job["id"]
        )
        return current if current["status"] in {"succeeded", "failed"} else None

    job = wait_for(finished, "live extraction job")
    assert job["status"] == "succeeded", job.get("error_code")
    assert job["summary"]["simulated"] is False
    listing = call(f"/projects/{project_id}/requirements?limit=200")
    candidates = listing["items"]
    assert candidates, "Live extraction created no candidate requirements"
    assert all(not candidate["simulated"] for candidate in candidates)
    assert all(candidate["approval_status"] == "not_approved" for candidate in candidates)
    verified = sum(candidate["evidence_status"] == "verified" for candidate in candidates)
    assert verified > 0, "No candidate has a verified citation"
    print(
        f"PASS: model={provider['model']}, live job={job['status']}, "
        f"candidates={len(candidates)}, verified_citations={verified}, "
        f"simulated=False, approved=0"
    )
finally:
    call("/auth/logout", b"{}", csrf)
