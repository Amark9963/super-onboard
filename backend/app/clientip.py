"""Client address for rate limiting.

`X-Forwarded-For` is attacker-controlled unless a trusted proxy rewrites it, so it is ignored
unless the deployer states how many proxies sit in front of the API (TRUSTED_PROXY_HOPS). Each
trusted proxy appends the address it saw; the real client is therefore the entry `hops` from the
right, and anything a caller put further left is never consulted.
"""

import ipaddress

from fastapi import Request

from app.config import settings


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    hops = settings.trusted_proxy_hops
    if hops <= 0:
        return peer
    forwarded = [
        p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()
    ]
    if len(forwarded) < hops:
        return peer  # fewer entries than trusted proxies: the header cannot be trusted
    candidate = forwarded[-hops]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return peer
