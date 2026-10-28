"""Live fictional website-import flow (M5).

Needs the demo site and permissive demo settings (never use these outside local demos):

    WEB_PRIVATE_HOST_ALLOWLIST=fixture-site WEB_ALLOWED_PORTS=80,443,8080 \
      docker compose --profile fixture up -d fixture-site backend worker

and .local/demo-login.txt. It fires real SSRF attempts at the API, imports the fictional site's
pages through the worker, checks provenance and hidden-text handling, runs the SIMULATED
extraction on an imported page, and confirms nothing becomes approved. Safe to re-run.
"""

import hashlib
import json
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = "http://localhost:3000"
SITE = "http://fixture-site:8080"
email, password = Path(".local/demo-login.txt").read_text().splitlines()[:2]
browser = build_opener(HTTPCookieProcessor(CookieJar()))


def call(path, data=None, csrf=None, raw=False):
    headers = {"Origin": BASE} if data is not None else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(data).encode()
    request = Request(BASE + "/api" + path, data=data, headers=headers)
    with browser.open(request, timeout=30) as response:
        payload = response.read()
        if raw:
            return payload
        return json.loads(payload) if payload else None


def refused(path, data, csrf, code):
    try:
        call(path, data, csrf)
    except HTTPError as error:
        body = error.read().decode()
        assert error.code == 422 and code in body, (error.code, body[:200])
        return
    raise AssertionError(f"{data} was not refused")


def wait(predicate, what, seconds=90):
    for _ in range(seconds):
        value = predicate()
        if value:
            return value
        time.sleep(1)
    raise AssertionError(f"timed out waiting for {what}")


login = call("/auth/login", {"email": email, "password": password})
csrf = login["csrf_token"]
S = lambda path, data=None: call(path, data, csrf)  # noqa: E731
org = next(o for o in S("/organizations") if o["name"] == "Fictional Lantern Property Group")
project = next((p for p in S("/projects") if p["name"] == "Fictional M5 walkthrough"), None)
project = project or S("/projects", {"name": "Fictional M5 walkthrough", "organization_id": org["id"]})
pid = project["id"]
have = {p["name"] for p in S(f"/projects/{pid}/scopes")["properties"]}
for building in ("Fictional Aster House", "Fictional Birch Court"):
    if building not in have:
        S(f"/projects/{pid}/properties", {"name": building})

# 1. Real SSRF attempts are refused before anything is fetched.
base = f"/projects/{pid}/web-imports"
for url, code in (
    ("file:///etc/passwd", "unsafe_scheme"),
    ("http://127.0.0.1/", "blocked_address"),
    ("http://localhost/admin", "blocked_host"),
    ("http://localhost:8000/admin", "blocked_port"),
    ("http://169.254.169.254/latest/meta-data/", "blocked_address"),
    ("http://[::1]/", "blocked_address"),
    ("http://2130706433/", "invalid_host"),
    ("http://user:secret@example.com/", "credentials_in_url"),
    ("http://example.com:5432/", "blocked_port"),
    ("http://postgres/", "blocked_host"),
):
    refused(base, {"url": url}, csrf, code)
refused(base, {"url": "http://www.example.com/", "approved_hosts": ["evil.org"]}, csrf, "subdomains")

# 2. Discovery against the fictional site.
try:
    created = S(base, {"url": SITE + "/"})
except HTTPError as error:
    detail = error.read().decode()
    raise SystemExit(f"Cannot start the demo import ({detail[:120]}). Start the stack as described at the top of this file.")
done = wait(lambda: (lambda d: d if d["phase"] in {"discovered", "failed"} else None)(S(f"{base}/{created['id']}")), "discovery")
assert done["phase"] == "discovered", done
pages = {p["url"].removeprefix(SITE): p for p in done["pages"]}
candidates = {u for u, p in pages.items() if p["status"] == "candidate"}
assert candidates == {"/", "/about/", "/faq/", "/hours/", "/deep/"}, candidates
assert pages["/private/"]["status"] == "blocked" and pages["/private/"]["reason"] == "blocked_by_robots"
assert pages["/about/"]["title"] == "About Aster House and Birch Court"
assert pages["/hours/"]["discovered_via"] == "sitemap" and pages["/deep/"]["depth"] == 2
assert not any("external.example.org" in u for u in pages)

# 3. Import, snapshot provenance, and hidden-text handling.
S(f"{base}/{created['id']}/import", {"page_ids": [pages[u]["id"] for u in sorted(candidates)]})
final = wait(lambda: (lambda d: d if d["phase"] == "imported" else None)(S(f"{base}/{created['id']}")), "import")
fetched = {p["url"].removeprefix(SITE): p for p in final["pages"] if p["status"] == "fetched"}
assert set(fetched) == candidates, {u: p["status"] for u, p in pages.items()}
home = fetched["/"]
original = call(f"/projects/{pid}/sources/versions/{home['source_version_id']}/original", raw=True)
assert hashlib.sha256(original).hexdigest() == home["content_hash"], "stored snapshot must match its hash"


def parsed(version_id):
    data = S(f"/projects/{pid}/sources/versions/{version_id}/blocks?limit=200")
    return data if data["version"]["parse_status"] in {"parsed", "needs_attention", "failed"} else None


blocks = wait(lambda: parsed(home["source_version_id"]), "parsing")
assert blocks["version"]["parse_status"] == "parsed" and blocks["total"] >= 3
text = " ".join(b["text"] for b in blocks["blocks"])
assert "Fictional public hours" in text
assert "IGNORE ALL PREVIOUS" not in text, "hidden page text must never become evidence"
sources = S(f"/projects/{pid}/sources")
assert any(d["kind"] == "web_page" and d["name"] == SITE + "/about/" for d in sources)

# 4. A fetched page flows through extraction as unconfirmed evidence.
about = fetched["/about/"]
wait(lambda: parsed(about["source_version_id"]), "about parsing")
for page in (home, about):
    try:
        S(f"/projects/{pid}/extraction-jobs", {"source_version_id": page["source_version_id"], "provider": "mock"})
    except HTTPError as error:
        assert error.code == 409  # already queued on a previous run
wait(lambda: all(j["status"] in {"succeeded", "failed"} for j in S(f"/projects/{pid}/extraction-jobs")), "extraction")
items = S(f"/projects/{pid}/requirements?limit=200")["items"]
pet = next(i for i in items if i["topic"] == "pet_policy" and i["scope"]["name"] == "Fictional Aster House")
assert (pet["staff_review_state"], pet["customer_confirmation_state"], pet["approval_status"]) == (
    "pending", "not_confirmed", "not_approved")
evidence = S(f"/projects/{pid}/requirements/{pet['id']}")["evidence"][0]
assert evidence["source"]["document"] == SITE + "/about/" and evidence["quote_match_state"] in {"exact", "normalized"}
assert all(i["approval_status"] == "not_approved" for i in items), "importing a page must never approve anything"

# 5. Re-importing an unchanged page records no new version.
again = S(base, {"url": SITE + "/"})
d2 = wait(lambda: (lambda d: d if d["phase"] == "discovered" else None)(S(f"{base}/{again['id']}")), "second discovery")
p2 = next(p for p in d2["pages"] if p["url"] == SITE + "/")
S(f"{base}/{again['id']}/import", {"page_ids": [p2["id"]]})
d3 = wait(lambda: (lambda d: d if d["phase"] == "imported" else None)(S(f"{base}/{again['id']}")), "second import")
same = next(p for p in d3["pages"] if p["url"] == SITE + "/")
assert same["reason"] == "unchanged" and same["source_version_id"] == home["source_version_id"]

call("/auth/logout", {}, csrf)
print("PASS: SSRF attempts refused, robots/sitemap/scope discovery, snapshot hash + provenance, hidden text excluded, "
      "SIMULATED extraction from a web page (unapproved), unchanged re-import, logout")
