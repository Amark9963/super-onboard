"""Live fictional customer-review flow (M3): compose -> email via Mailpit -> login-free review
link -> partial and idempotent answers -> staff validation -> revoke/resend.

Requires .local/demo-login.txt and the Compose stack (Mailpit on :8025). Fictional data only.
Safe to re-run: it picks an unconfirmed accepted candidate, or creates a fresh fictional source.
"""

import json
import re
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

BASE = "http://localhost:3000"
MAIL = "http://localhost:8025/api/v1"
email, password = Path(".local/demo-login.txt").read_text().splitlines()[:2]
staff = build_opener(HTTPCookieProcessor(CookieJar()))
customer = build_opener(HTTPCookieProcessor(CookieJar()))  # no staff session: just the link


def call(opener, path, data=None, csrf=None, method=None, content_type="application/json"):
    headers = {"Origin": BASE} if data is not None or method else {}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    if data is not None:
        headers["Content-Type"] = content_type
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
    request = Request(BASE + "/api" + path, data=data, headers=headers, method=method)
    with opener.open(request, timeout=30) as response:
        payload = response.read()
        if not payload:
            return None
        return json.loads(payload) if response.headers.get_content_type() == "application/json" else payload


def expect(code, *args, **kwargs):
    try:
        call(*args, **kwargs)
    except HTTPError as error:
        assert error.code == code, (error.code, error.read()[:200])
        return
    raise AssertionError(f"expected HTTP {code}")


def wait(predicate, what, seconds=60):
    for _ in range(seconds):
        value = predicate()
        if value:
            return value
        time.sleep(1)
    raise AssertionError(f"timed out waiting for {what}")


login = call(staff, "/auth/login", {"email": email, "password": password})
csrf = login["csrf_token"]
S = lambda path, data=None, method=None: call(staff, path, data, csrf, method)  # noqa: E731
project = next(p for p in S("/projects") if p["name"] == "Fictional M2 walkthrough")
pid = project["id"]

contacts = S(f"/projects/{pid}/contacts")
alex = next((c for c in contacts if c["email"] == "alex@example.invalid"), None)
if alex is None:
    alex = S(f"/projects/{pid}/contacts", {"name": "Fictional Alex", "email": "alex@example.invalid", "role": "Property manager"})


def eligible():
    items = S(f"/projects/{pid}/requirements?state=accepted&evidence_status=verified&limit=200")["items"]
    return [i for i in items if i["customer_confirmation_state"] == "not_confirmed" and i["scope"]["confirmed_by_staff"]]


candidates = eligible()
if not candidates:
    pending = S(f"/projects/{pid}/requirements?state=pending&evidence_status=verified&limit=200")["items"]
    if not pending:  # earlier runs consumed everything: add a fresh fictional source
        stamp = int(time.time())
        boundary = "super-onboard-m3-fixture"
        content = f"Fictional Aster House permits {stamp % 3 + 1} birds.".encode()
        body = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="Fictional M3 {stamp}.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
        ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
        version = call(staff, f"/projects/{pid}/sources/upload", body, csrf, content_type=f"multipart/form-data; boundary={boundary}")
        wait(lambda: any(v["id"] == version["id"] and v["parse_status"] == "parsed" for s in S(f"/projects/{pid}/sources") for v in s["versions"]), "parsing")
        S(f"/projects/{pid}/extraction-jobs", {"source_version_id": version["id"], "provider": "mock"})
        pending = wait(lambda: S(f"/projects/{pid}/requirements?state=pending&evidence_status=verified&limit=200")["items"], "extraction")
    S(f"/projects/{pid}/requirements/{pending[0]['id']}/accept", {"confirm_scope": True})
    candidates = eligible()
rule = candidates[0]
evidence = S(f"/projects/{pid}/requirements/{rule['id']}")["evidence"]
share = [e["id"] for e in evidence if e["quote_match_state"] != "invalid"][:1]

created = S(
    f"/projects/{pid}/review-requests",
    {
        "title": "Fictional weekend rules check",
        "contact_id": alex["id"],
        "message": "Fictional walkthrough only.",
        "items": [
            {"kind": "confirm_rule", "requirement_version_id": rule["id"], "excerpt_evidence_ids": share},
            {"kind": "question", "question": "Is the backup phone number known?", "answer_type": "yes_no"},
        ],
    },
)
preview = created["preview"]
assert preview["preview"] is True and preview["total"] == 2
assert pid not in json.dumps(preview) and rule["id"] not in json.dumps(preview)
before = {m["ID"] for m in json.load(urlopen(MAIL + "/messages", timeout=10))["messages"]}
sent = S(f"/projects/{pid}/review-requests/{created['request_id']}/invitations/{created['invitation']['id']}/send", {})
assert sent["invitation"]["delivery_state"] == "smtp_accepted", sent["invitation"]
assert "does not confirm" in sent["delivery_note"]
link = sent["link"]
token = link.rsplit("/", 1)[1]


def mail():
    for message in json.load(urlopen(MAIL + "/messages", timeout=10))["messages"]:
        if message["ID"] not in before and any(t["Address"] == "alex@example.invalid" for t in message["To"]):
            return json.load(urlopen(f"{MAIL}/message/{message['ID']}", timeout=10))


delivered = wait(mail, "invitation email in Mailpit")
assert link in delivered["Text"], "the emailed link must match the issued link"
assert rule["statement"] not in delivered["Text"], "rule text must not be emailed"

page = call(customer, f"/public/review/{token}")  # no session cookies, only the token
assert page["total"] == 2 and page["organization"] == "Fictional Lantern Property Group"
assert pid not in json.dumps(page) and "specialist" not in json.dumps(page)
rule_item, question_item = (i["item_id"] for i in page["items"])


def answer(item, kind, content, submission):
    return call(customer, f"/public/review/{token}/responses",
                {"submission_id": submission, "responses": [{"item_id": item, "response_type": kind, "answer": content}]})


stamp = str(int(time.time()))
first = answer(rule_item, "confirm", {"comment": "Fictional confirmation"}, "e2e-" + stamp + "-1")
assert first["outstanding"] == 1 and first["saved"][0]["version"] == 1
replay = answer(rule_item, "confirm", {"comment": "Fictional confirmation"}, "e2e-" + stamp + "-1")
assert replay["saved"][0]["duplicate"] is True
second = answer(question_item, "answer", {"choice": "no"}, "e2e-" + stamp + "-2")
assert second["outstanding"] == 0
expect(404, customer, f"/public/review/{'z' * 43}")

inbox = S(f"/projects/{pid}/responses")
row = next(r for r in inbox if r["response_type"] == "confirm" and r["requirement_version_id"] == rule["id"])
assert row["state"] == "awaiting_staff_review" and row["recipient"]["verified"] is False
assert S(f"/projects/{pid}/requirements/{rule['id']}")["customer_confirmation_state"] == "not_confirmed"
done = S(f"/projects/{pid}/responses/{row['response_id']}/review", {"decision": "validate_confirmation", "rationale": "Fictional check"})
assert done["state"] == "confirmation_validated"
confirmed = S(f"/projects/{pid}/requirements/{rule['id']}")
assert confirmed["customer_confirmation_state"] == "confirmed" and confirmed["approval_status"] == "not_approved"
expect(409, customer, f"/public/review/{token}/responses",
       {"submission_id": "e2e-" + stamp + "-3", "responses": [{"item_id": rule_item, "response_type": "cannot_confirm", "answer": {}}]})

resent = S(f"/projects/{pid}/review-requests/{created['request_id']}/invitations/{created['invitation']['id']}/resend", {})
fresh = resent["link"].rsplit("/", 1)[1]
assert fresh != token
expect(410, customer, f"/public/review/{token}")
carried = call(customer, f"/public/review/{fresh}")
assert carried["answered"] == 2 and carried["items"][0]["locked"] is True
S(f"/projects/{pid}/review-requests/{created['request_id']}/invitations/{resent['invitation']['id']}/revoke", {})
expect(410, customer, f"/public/review/{fresh}")

call(staff, "/auth/logout", b"{}", csrf)
expect(401, staff, f"/projects/{pid}/responses")
print("PASS: composed draft + preview, Mailpit email with matching link, login-free page, partial + idempotent answers, "
      "staff validation, locked item, resend/revoke invalidation, logout")
