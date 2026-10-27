"""Read-only HTTP startup checks for the running M1 Compose stack."""

import json
from urllib.error import HTTPError
from urllib.request import urlopen


def get(url):
    with urlopen(url, timeout=10) as response:
        assert response.status == 200
        return response.read().decode()


assert json.loads(get("http://localhost:8000/health/live"))["milestone"] == 2
assert json.loads(get("http://localhost:8000/health/ready"))["status"] == "ready"
assert json.loads(get("http://localhost:3000/api/health"))["status"] == "ok"
assert "Loading workspace" in get("http://localhost:3000")
get("http://localhost:9000/minio/health/live")
get("http://localhost:8025/api/v1/messages")
try:
    get("http://localhost:3000/api/projects")
except HTTPError as error:
    assert error.code == 401, error.code
else:
    raise AssertionError("Project list unexpectedly permits anonymous access")
try:
    get("http://localhost:9000/onboard-private/")
except HTTPError as error:
    assert error.code == 403, error.code
else:
    raise AssertionError("Bucket unexpectedly permits anonymous listing")
print("PASS: web, API, database readiness, MinIO, Mailpit, and private bucket")
