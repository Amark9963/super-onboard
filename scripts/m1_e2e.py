"""Live fictional sign-in -> project -> source -> evidence smoke flow.

Requires .local/demo-login.txt, provisioned through the operator CLI. Leaves a
fictional walkthrough project in the local development database for inspection.
"""

import hashlib
import json
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
email, password = Path(".local/demo-login.txt").read_text().splitlines()[:2]
browser = build_opener(HTTPCookieProcessor(CookieJar()))


def call(path, data=None, csrf=None, content_type="application/json"):
    headers = {"Origin": BASE} if data is not None else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = content_type
    request = Request(BASE + "/api" + path, data=data, headers=headers)
    with browser.open(request, timeout=20) as response:
        payload = response.read()
        if not payload:
            return None
        return json.loads(payload) if response.headers.get_content_type() == "application/json" else payload


login = call("/auth/login", json.dumps({"email": email, "password": password}).encode())
csrf = login["csrf_token"]
assert login["email"] == email
organizations = call("/organizations")
org = next(o for o in organizations if o["name"] == "Fictional Lantern Property Group")
projects = call("/projects")
project = next((p for p in projects if p["name"] == "Fictional M1 walkthrough"), None)
if project is None:
    project = call("/projects", json.dumps({"name": "Fictional M1 walkthrough", "organization_id": org["id"]}).encode(), csrf)
pid = project["id"]
scopes = call(f"/projects/{pid}/scopes")
if not scopes["properties"]:
    call(f"/projects/{pid}/properties", json.dumps({"name": "Fictional Alder House"}).encode(), csrf)
source_list = call(f"/projects/{pid}/sources")
source = next((d for d in source_list if d["name"] == "Fictional rules.txt"), None)
if source is None:
    content = b"Fictional Alder House permits two cats.\nWeekend calls route to the fictional supervisor."
    boundary = "super-onboard-fixture-boundary"
    upload_body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"Fictional rules.txt\"\r\nContent-Type: text/plain\r\n\r\n".encode()
                   + content + f"\r\n--{boundary}--\r\n".encode())
    version = call(f"/projects/{pid}/sources/upload", upload_body, csrf,
                   f"multipart/form-data; boundary={boundary}")
    assert version["content_hash"] == hashlib.sha256(content).hexdigest()
else:
    version = source["versions"][0]
    content = call(f"/projects/{pid}/sources/versions/{version['id']}/original")

for _ in range(30):
    evidence = call(f"/projects/{pid}/sources/versions/{version['id']}/blocks")
    if evidence["version"]["parse_status"] in {"parsed", "needs_attention", "failed"}:
        break
    time.sleep(1)
assert evidence["version"]["parse_status"] == "parsed", evidence["version"]
assert evidence["total"] == 2
assert evidence["blocks"][0]["locator"]["line_start"] == 1
assert call(f"/projects/{pid}/sources/versions/{version['id']}/original") == content
call("/auth/logout", b"{}", csrf)
try:
    call(f"/projects/{pid}/sources/versions/{version['id']}/blocks")
except HTTPError as error:
    assert error.code == 401
else:
    raise AssertionError("Logout did not revoke source access")
print("PASS: sign-in, project, property, private upload, worker parse, evidence, original, logout")
