"""M5 hardening: client-address handling and per-client rate limits."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.clientip import client_ip
from app.config import settings
from app.mailer import get_mailer
from tests.support import post
from tests.test_m3 import Flow, Outbox


def request(peer="10.0.0.9", forwarded=None):
    headers = {"x-forwarded-for": forwarded} if forwarded is not None else {}
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers)


@pytest.mark.parametrize(
    "hops, forwarded, expected",
    [
        (0, "1.2.3.4", "10.0.0.9"),  # header ignored unless proxies are declared
        (0, None, "10.0.0.9"),
        (1, "198.51.100.7", "198.51.100.7"),
        (1, "6.6.6.6, 198.51.100.7", "198.51.100.7"),  # a spoofed left entry is never used
        (1, "6.6.6.6, 7.7.7.7, 198.51.100.7", "198.51.100.7"),
        (2, "198.51.100.7, 172.18.0.5", "198.51.100.7"),
        (2, "6.6.6.6, 198.51.100.7, 172.18.0.5", "198.51.100.7"),
        (2, "198.51.100.7", "10.0.0.9"),  # fewer entries than trusted proxies: not trusted
        (1, "not-an-ip", "10.0.0.9"),
        (1, "", "10.0.0.9"),
        (1, None, "10.0.0.9"),
        (1, "2001:db8::1", "2001:db8::1"),
    ],
)
def test_client_address_trusts_only_what_declared_proxies_appended(
    monkeypatch, hops, forwarded, expected
):
    monkeypatch.setattr(settings, "trusted_proxy_hops", hops)
    assert client_ip(request(forwarded=forwarded)) == expected


def test_missing_peer_does_not_crash(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    assert client_ip(SimpleNamespace(client=None, headers={})) == "unknown"


@pytest.fixture
def link(staff, client):
    staff.extract()
    main.app.dependency_overrides[get_mailer] = lambda: Outbox()
    flow = Flow(staff)
    pet = flow.accept("pet_policy", "Aster House", "allow_2_cat")
    return flow.live([flow.rule(pet)])[2]


def test_public_routes_are_limited_per_client_address(link, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_public_per_ip", 3)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    anon = TestClient(main.app)
    url = f"/api/public/review/{link}"
    assert [anon.get(url).status_code for _ in range(3)] == [200, 200, 200]
    blocked = anon.get(url)
    assert blocked.status_code == 429 and "Too many requests" in blocked.json()["detail"]
    # A client cannot dodge the limit by forging a forwarded address while no proxy is declared.
    assert anon.get(url, headers={"x-forwarded-for": "203.0.113.50"}).status_code == 429
    # Invalid tokens are counted against the same budget, so guessing is bounded per client.
    assert anon.get("/api/public/review/" + "x" * 43).status_code == 429


def test_each_real_client_has_its_own_budget_behind_a_trusted_proxy(link, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_public_per_ip", 2)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    anon = TestClient(main.app)
    url = f"/api/public/review/{link}"
    first = {"x-forwarded-for": "198.51.100.1"}
    second = {"x-forwarded-for": "198.51.100.2"}
    assert [anon.get(url, headers=first).status_code for _ in range(2)] == [200, 200]
    assert anon.get(url, headers=first).status_code == 429
    assert anon.get(url, headers=second).status_code == 200  # a different client is unaffected
    # Prepending a forged address does not create a fresh budget: the proxy-appended one counts.
    forged = {"x-forwarded-for": "9.9.9.9, 198.51.100.1"}
    assert anon.get(url, headers=forged).status_code == 429


def test_sign_in_is_limited_per_address_across_accounts(client, monkeypatch):
    web, _, _ = client
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 3)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
    for number in range(3):  # three different accounts: the per-account limit is never reached
        refused = post(
            web, "/api/auth/login", {"email": f"nobody{number}@example.invalid", "password": "x"}
        )
        assert refused.status_code == 401
    spray = post(web, "/api/auth/login", {"email": "nobody9@example.invalid", "password": "x"})
    assert spray.status_code == 429
    # Even a correct password is refused while the address is over its budget.
    legit = post(
        web,
        "/api/auth/login",
        {"email": "specialist@example.invalid", "password": "fictional-passphrase-2026"},
    )
    assert legit.status_code == 429


def test_the_ai_provider_url_must_be_http_or_https(monkeypatch):
    from app.ai import (
        BlockInput,
        ExtractionRequest,
        OpenAICompatibleProvider,
        ProviderError,
        default_transport,
    )

    monkeypatch.setattr(settings, "ai_api_key", "k")
    for base in ("file:///etc", "ftp://example.com", "gopher://x", "data:text/plain,x"):
        monkeypatch.setattr(settings, "ai_base_url", base)
        called = []
        provider = OpenAICompatibleProvider(transport=lambda *a: called.append(a) or (200, b"{}"))
        with pytest.raises(ProviderError) as caught:
            provider.extract(ExtractionRequest([BlockInput("b", "text", "")]))
        assert caught.value.code == "provider_not_configured" and called == []
    with pytest.raises(ProviderError):  # the real transport refuses too, whatever calls it
        default_transport("file:///etc/passwd", {}, b"", 1)


def test_sitemaps_use_a_hardened_xml_parser():
    from app.webfetch import FetchError, parse_sitemap

    quadratic = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><urlset/>'
    external = b'<?xml version="1.0"?><!DOCTYPE x SYSTEM "http://127.0.0.1/evil.dtd"><urlset/>'
    for hostile in (quadratic, external):
        with pytest.raises(FetchError) as caught:
            parse_sitemap(hostile)
        assert caught.value.code == "unsafe_xml"
