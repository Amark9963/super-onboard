"""Shared helpers for HTTP-level tests."""

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
