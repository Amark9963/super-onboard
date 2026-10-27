"""Shared helpers for HTTP-level tests."""

from app import worker
from app.ai import get_provider
from app.seed import key

ORIGIN = {"origin": "http://localhost:3000"}


class MemoryStore:
    def __init__(self):
        self.objects = {}

    def put(self, key, data):
        self.objects[key] = data

    def get(self, key):
        return self.objects[key]


def call(client, method, path, data=None, csrf=None):
    headers = {**ORIGIN, **({"x-csrf-token": csrf} if csrf else {})}
    return client.request(method, path, json=data, headers=headers)


def post(client, path, data, csrf=None, **kwargs):
    headers = {**ORIGIN, **({"x-csrf-token": csrf} if csrf else {})}
    return client.post(path, json=data, headers=headers, **kwargs)


def sign_in(client, email="specialist@example.invalid", password="fictional-passphrase-2026"):
    response = post(client, "/api/auth/login", {"email": email, "password": password})
    assert response.status_code == 200, response.text
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=strict" in response.headers["set-cookie"].lower()
    return response.json()["csrf_token"]


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
