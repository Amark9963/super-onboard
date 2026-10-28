"""SSRF-safe, bounded fetching and discovery for website import.

Threat model: the URL is supplied by a staff user, but the page, its redirects, its DNS answers and
its links are attacker-influenced. This module therefore:

* accepts only http(s) URLs without credentials, on allowed ports, with a real hostname;
* resolves DNS **once**, requires every answer to be a public address, and connects to that exact
  address (so a later rebinding answer cannot redirect the connection);
* re-validates every redirect hop (scheme, host, address, scope) and caps the hop count;
* never sends credentials or cookies, never executes page content, and refuses compressed bodies;
* bounds bytes, time and page counts, honors robots.txt, and only returns textual content types.

Nothing here talks to the database. `SafeFetcher` takes an injectable resolver and opener so the
policy can be tested without a network.
"""

import http.client
import ipaddress
import re
import socket
import ssl
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from html.parser import HTMLParser

from app.config import settings

PAGE_TYPES = {"text/html", "application/xhtml+xml"}
ROBOTS_AGENT = "SuperOnboardBot"
BLOCKED_NAMES = {"localhost", "metadata", "metadata.google.internal", "instance-data"}
BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".localdomain",
    ".lan",
    ".home.arpa",
    ".intranet",
    ".corp",
    ".home",
)
SKIPPED_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".css", ".js", ".json",
    ".zip", ".gz", ".tar", ".mp3", ".mp4", ".mov", ".avi", ".doc", ".docx", ".xls", ".xlsx",
    ".ppt", ".pptx", ".woff", ".woff2", ".ttf", ".xml", ".rss",
}  # fmt: skip
MAX_ROBOTS_BYTES = 512 * 1024
MAX_SITEMAP_BYTES = 2 * 1024 * 1024
MAX_LINKS_PER_PAGE = 500
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
SECURITY_CODES = {
    "blocked_address",
    "blocked_port",
    "blocked_host",
    "unsafe_scheme",
    "credentials_in_url",
    "invalid_url",
    "invalid_host",
    "outside_scope",
    "redirect_outside_scope",
}


class FetchError(Exception):
    """A stable, content-free failure code. Never include page text, headers or addresses."""

    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code, self.retryable = code, retryable


@dataclass(frozen=True)
class Target:
    scheme: str
    host: str
    port: int
    request_target: str
    url: str
    literal: bool

    @property
    def origin(self) -> str:
        default = 443 if self.scheme == "https" else 80
        suffix = "" if self.port == default else f":{self.port}"
        return f"{self.scheme}://{self.host}{suffix}"


@dataclass
class FetchResult:
    requested_url: str
    url: str
    status: int
    content_type: str
    body: bytes
    redirects: list[str] = field(default_factory=list)
    fetched_at: float = 0.0
    address: str = ""


# ----------------------------------------------------------------------------- URL and address policy


def _allowed_ports() -> set[int]:
    return {int(p) for p in settings.web_allowed_ports.split(",") if p.strip().isdigit()}


def _private_allowlist() -> set[str]:
    return {h.strip().lower() for h in settings.web_private_host_allowlist.split(",") if h.strip()}


def _embedded_v4(ip: ipaddress.IPv6Address):
    """IPv4 addresses hidden inside IPv6 forms that routers may translate."""
    if ip.ipv4_mapped:
        return ip.ipv4_mapped
    if ip in ipaddress.ip_network("64:ff9b::/96"):
        return ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    if ip.sixtofour:
        return ip.sixtofour
    return None


def is_public_ip(value) -> bool:
    """True only for globally routable unicast addresses."""
    ip = ipaddress.ip_address(value) if isinstance(value, str) else value
    if isinstance(ip, ipaddress.IPv6Address):
        if ip in ipaddress.ip_network("2001::/32"):  # Teredo tunnels
            return False
        inner = _embedded_v4(ip)
        if inner is not None:
            return is_public_ip(inner)
    return bool(
        ip.is_global
        and not (ip.is_multicast or ip.is_loopback or ip.is_link_local or ip.is_unspecified)
    )


def validate_url(url: str) -> Target:
    """Syntactic policy: scheme, credentials, port, hostname form. DNS is checked separately."""
    if not isinstance(url, str) or not url or len(url) > 2048:
        raise FetchError("invalid_url")
    if any(ord(c) < 33 or ord(c) == 127 for c in url):
        raise FetchError("invalid_url")
    try:
        parts = urllib.parse.urlsplit(url)
        port = parts.port
    except ValueError:
        raise FetchError("invalid_url") from None
    if parts.scheme.lower() not in {"http", "https"}:
        raise FetchError("unsafe_scheme")
    if "@" in parts.netloc or parts.username or parts.password:
        raise FetchError("credentials_in_url")
    host = (parts.hostname or "").rstrip(".").lower()
    if not host:
        raise FetchError("invalid_url")
    scheme = parts.scheme.lower()
    port = port or (443 if scheme == "https" else 80)
    if port not in _allowed_ports():
        raise FetchError("blocked_port")
    literal = False
    try:
        address = ipaddress.ip_address(host)
        literal = True
        if not is_public_ip(address) and host not in _private_allowlist():
            raise FetchError("blocked_address")
    except ValueError:
        try:
            host = host.encode("idna").decode("ascii")
        except UnicodeError:
            raise FetchError("invalid_host") from None
        if not re.fullmatch(
            r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*", host
        ):
            raise FetchError("invalid_host")
        labels = host.split(".")
        if all(re.fullmatch(r"0x[0-9a-f]*|[0-9]+", label) for label in labels):
            raise FetchError("invalid_host")  # inet_aton-style integer/hex address forms
        if host not in _private_allowlist():
            if host in BLOCKED_NAMES or host.endswith(BLOCKED_SUFFIXES) or "." not in host:
                raise FetchError("blocked_host")
    path = urllib.parse.quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~")
    query = urllib.parse.quote(parts.query, safe="/%:@!$&'()*+,;=-._~?")
    request_target = path + (f"?{query}" if query else "")
    default = 443 if scheme == "https" else 80
    netloc = f"[{host}]" if literal and ":" in host else host
    suffix = "" if port == default else f":{port}"
    return Target(
        scheme, host, port, request_target, f"{scheme}://{netloc}{suffix}{request_target}", literal
    )


def default_resolver(host: str, port: int) -> list[str]:
    """getaddrinfo has no timeout of its own, so bound it with a worker thread."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(socket.getaddrinfo, host, port, 0, socket.SOCK_STREAM)
        try:
            rows = future.result(timeout=settings.web_connect_timeout)
        except FutureTimeout:
            raise FetchError("dns_timeout", True) from None
        except OSError:
            raise FetchError("dns_failure", True) from None
    return list(dict.fromkeys(row[4][0].split("%")[0] for row in rows))


def pin_address(target: Target, resolver) -> str:
    """Resolve once; every answer must be public (unless the host is explicitly allowlisted)."""
    if target.literal:
        return target.host
    addresses = resolver(target.host, target.port)
    if not addresses:
        raise FetchError("dns_failure", True)
    if target.host not in _private_allowlist() and not all(is_public_ip(a) for a in addresses):
        raise FetchError("blocked_address")
    return addresses[0]


# ----------------------------------------------------------------------------- real network opener


class PinnedHTTPConnection(http.client.HTTPConnection):
    """Connects to a validated IP while keeping the real hostname for Host/SNI."""

    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def default_opener(target: Target, ip: str, headers: dict, max_bytes: int, deadline: float):
    """One GET to the pinned address. Returns (status, lowercase headers, body)."""
    connection_class = PinnedHTTPSConnection if target.scheme == "https" else PinnedHTTPConnection
    connection = connection_class(target.host, target.port, ip, settings.web_connect_timeout)
    try:
        connection.request("GET", target.request_target, headers=headers)
        if connection.sock is not None:
            connection.sock.settimeout(settings.web_read_timeout)
        response = connection.getresponse()
        received = {k.lower(): v for k, v in response.getheaders()}
        if response.status in REDIRECT_STATUSES:
            return response.status, received, b""
        declared = received.get("content-length", "")
        if declared.isdigit() and int(declared) > max_bytes:
            raise FetchError("response_too_large")
        chunks, total = [], 0
        while True:
            if time.monotonic() > deadline:
                raise FetchError("fetch_timeout", True)
            chunk = response.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise FetchError("response_too_large")
            chunks.append(chunk)
        return response.status, received, b"".join(chunks)
    except FetchError:
        raise
    except ssl.SSLError:
        raise FetchError("tls_failure") from None
    except (TimeoutError, socket.timeout):
        raise FetchError("fetch_timeout", True) from None
    except (OSError, http.client.HTTPException):
        raise FetchError("connection_failed", True) from None
    finally:
        connection.close()


# ----------------------------------------------------------------------------- fetcher


def host_scope(root_host: str, approved_hosts=()) -> set[str]:
    """Hosts a crawl may touch: the entered host, its www/apex twin, and approved subdomains."""
    apex = root_host.removeprefix("www.")
    return {root_host, apex, "www." + apex, *approved_hosts}


class SafeFetcher:
    def __init__(self, resolver=default_resolver, opener=default_opener, clock=time.monotonic):
        self.resolver, self.opener, self.clock = resolver, opener, clock

    def fetch(
        self,
        url: str,
        scope: set[str],
        *,
        accept=PAGE_TYPES,
        max_bytes: int | None = None,
    ) -> FetchResult:
        limit = max_bytes or settings.web_max_bytes
        requested, redirects = url, []
        current = url
        for _ in range(settings.web_max_redirects + 1):
            target = validate_url(current)
            if target.host not in scope:
                raise FetchError("redirect_outside_scope" if redirects else "outside_scope")
            ip = pin_address(target, self.resolver)
            headers = {
                "User-Agent": settings.web_user_agent,
                "Accept": ", ".join(sorted(accept)) if accept else "*/*",
                "Accept-Encoding": "identity",  # never decompress untrusted bodies
                "Connection": "close",
            }
            deadline = self.clock() + settings.web_read_timeout * 2
            status, received, body = self.opener(target, ip, headers, limit, deadline)
            if status in REDIRECT_STATUSES:
                location = received.get("location", "")
                if not location:
                    raise FetchError("bad_redirect")
                current = urllib.parse.urljoin(target.url, location)
                redirects.append(current)
                continue
            if status in (404, 410):
                raise FetchError("not_found")
            if status in (401, 403, 451):
                raise FetchError("access_denied")
            if status == 429:
                raise FetchError("rate_limited", True)
            if status >= 500:
                raise FetchError("server_error", True)
            if status != 200:
                raise FetchError("unexpected_status")
            if received.get("content-encoding", "identity").lower() not in {"", "identity"}:
                raise FetchError("unsupported_encoding")
            content_type = received.get("content-type", "").split(";")[0].strip().lower()
            if accept is not None and content_type not in accept:
                raise FetchError("unsupported_content_type")
            return FetchResult(
                requested, target.url, status, content_type, body, redirects, time.time(), ip
            )
        raise FetchError("too_many_redirects")


# ----------------------------------------------------------------------------- robots.txt


class Robots:
    """robots.txt per RFC 9309: longest matching rule wins (Allow wins ties), `*` and `$` work,
    a group naming this crawler replaces the wildcard group, unavailable (4xx) allows everything
    and server errors disallow everything."""

    def __init__(self, allow_all: bool = True, disallow_all: bool = False, text: str = ""):
        self.disallow_all = disallow_all
        self.sitemaps: list[str] = []
        self.groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
        agents, rules, in_rules = [], [], False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            field, value = (part.strip() for part in line.split(":", 1))
            field = field.lower()
            if field == "user-agent":
                if in_rules:
                    self.groups.append((agents, rules))
                    agents, rules, in_rules = [], [], False
                agents.append(value.lower())
            elif field in {"allow", "disallow"}:
                in_rules = True
                if value:  # an empty Disallow allows everything
                    rules.append((field == "allow", value))
            elif field == "sitemap" and value:
                self.sitemaps.append(value)
        if agents:
            self.groups.append((agents, rules))
        self.allow_all = allow_all and not self.groups

    def _rules(self) -> list[tuple[bool, str]]:
        token = ROBOTS_AGENT.lower()
        named = [(a, r) for agents, r in self.groups for a in agents if a != "*" and a in token]
        if named:
            best = max(len(a) for a, _ in named)
            return [rule for a, r in named if len(a) == best for rule in r]
        return [rule for agents, r in self.groups if "*" in agents for rule in r]

    def allowed(self, url: str) -> bool:
        if self.disallow_all:
            return False
        if self.allow_all:
            return True
        parts = urllib.parse.urlsplit(url)
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        verdict, length = True, -1
        for allow, pattern in self._rules():
            regex = "".join(".*" if c == "*" else re.escape(c) for c in pattern.rstrip("$"))
            if re.match(regex + ("$" if pattern.endswith("$") else ""), path) and (
                len(pattern) > length or (len(pattern) == length and allow)
            ):
                verdict, length = allow, len(pattern)
        return verdict


def load_robots(fetcher: SafeFetcher, target: Target, scope: set[str]) -> Robots:
    robots_url = f"{target.origin}/robots.txt"
    try:
        result = fetcher.fetch(
            robots_url, scope, accept={"text/plain", "text/html"}, max_bytes=MAX_ROBOTS_BYTES
        )
    except FetchError as error:
        if error.code in {"not_found", "access_denied", "unsupported_content_type"}:
            return Robots()
        if error.code in SECURITY_CODES:
            raise  # an unsafe target is a policy failure to report, not a robots verdict
        return Robots(disallow_all=True)  # outages and server errors: be conservative
    return Robots(text=result.body.decode("utf-8", errors="replace"))


# ----------------------------------------------------------------------------- HTML helpers


class LinkParser(HTMLParser):
    """Title and outgoing links only. Scripts, styles and templates are never read."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.links, self.base = "", [], None
        self._in_title = False
        self._skip = 0
        self.nofollow_page = False

    def handle_starttag(self, tag, attrs):
        attributes = {k: (v or "") for k, v in attrs}
        if tag in {"script", "style", "template", "noscript"}:
            self._skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "base" and self.base is None and attributes.get("href"):
            self.base = attributes["href"]
        elif tag == "meta" and attributes.get("name", "").lower() == "robots":
            if "nofollow" in attributes.get("content", "").lower():
                self.nofollow_page = True
        elif tag == "a" and attributes.get("href") and len(self.links) < MAX_LINKS_PER_PAGE:
            if "nofollow" not in attributes.get("rel", "").lower():
                self.links.append(attributes["href"])

    def handle_endtag(self, tag):
        if tag in {"script", "style", "template", "noscript"} and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title) < 400:
            self.title += data


def decode_html(body: bytes) -> str:
    head = body[:2048].decode("ascii", errors="ignore").lower()
    match = re.search(r"charset=[\"']?([a-z0-9_-]+)", head)
    for encoding in ([match[1]] if match else []) + ["utf-8"]:
        try:
            return body.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return body.decode("utf-8", errors="replace")


def page_info(body: bytes, base_url: str):
    parser = LinkParser()
    parser.feed(decode_html(body))
    base = urllib.parse.urljoin(base_url, parser.base) if parser.base else base_url
    links = (
        [] if parser.nofollow_page else [urllib.parse.urljoin(base, link) for link in parser.links]
    )
    return " ".join(parser.title.split())[:300], links


def parse_sitemap(body: bytes) -> tuple[list[str], list[str]]:
    """(page urls, nested sitemap urls). Refuses DTDs/entities rather than trusting an XML parser."""
    lowered = body[:4096].lower()
    if b"<!doctype" in lowered or b"<!entity" in body[:65536].lower():
        raise FetchError("unsafe_xml")
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise FetchError("invalid_sitemap") from None
    pages, nested = [], []
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "loc" and element.text:
            (nested if root.tag.rsplit("}", 1)[-1] == "sitemapindex" else pages).append(
                element.text.strip()
            )
    return pages[:500], nested[:5]


# ----------------------------------------------------------------------------- discovery


@dataclass
class Candidate:
    url: str
    depth: int
    via: str
    title: str | None = None
    status: str = "candidate"
    reason: str | None = None


def normalize_link(url: str, scope: set[str]) -> str | None:
    """A crawlable, in-scope, fragment-free URL, or None."""
    try:
        target = validate_url(urllib.parse.urldefrag(url)[0])
    except FetchError:
        return None
    if target.host not in scope:
        return None
    extension = "." + target.request_target.split("?")[0].rsplit(".", 1)[-1].lower()
    if extension in SKIPPED_EXTENSIONS:
        return None
    return target.url


def discover(
    fetcher: SafeFetcher,
    root_url: str,
    approved_hosts=(),
    *,
    max_pages: int,
    max_depth: int,
    sleep=time.sleep,
    clock=time.monotonic,
) -> tuple[list[Candidate], dict]:
    """Bounded breadth-first discovery. Returns candidates and a summary; never raises on a bad
    child page (it is listed with its reason), only on an unusable root URL."""
    root = validate_url(root_url)
    scope = host_scope(root.host, approved_hosts)
    deadline = clock() + settings.web_total_seconds
    found: dict[str, Candidate] = {}
    blocked_budget = 50
    summary = {"fetches": 0, "truncated": False, "robots": None}

    def pause():
        if settings.web_delay_seconds:
            sleep(settings.web_delay_seconds)

    robots = load_robots(fetcher, root, scope)
    summary["robots"] = "disallow_all" if robots.disallow_all else "ok"
    if not robots.allowed(root.url):
        found[root.url] = Candidate(
            root.url, 0, "start", status="blocked", reason="blocked_by_robots"
        )
        return list(found.values()), summary
    queue = [(root.url, 0, "start")]
    sitemap_urls = list(dict.fromkeys(robots.sitemaps + [f"{root.origin}/sitemap.xml"]))
    sitemap_budget = 3
    while sitemap_urls and sitemap_budget and clock() < deadline:
        sitemap_budget -= 1
        try:
            sitemap_target = validate_url(urllib.parse.urldefrag(sitemap_urls.pop(0))[0])
        except FetchError:
            continue
        if sitemap_target.host not in scope:
            continue
        sitemap = sitemap_target.url
        try:
            pause()
            summary["fetches"] += 1
            result = fetcher.fetch(
                sitemap,
                scope,
                accept={"application/xml", "text/xml", "text/plain"},
                max_bytes=MAX_SITEMAP_BYTES,
            )
            pages, nested = parse_sitemap(result.body)
        except FetchError:
            continue
        sitemap_urls.extend(nested)
        for url in pages:
            clean = normalize_link(url, scope)
            if clean and clean not in {q[0] for q in queue}:
                queue.append((clean, 1, "sitemap"))
    visited = set()
    while queue and len([c for c in found.values() if c.status == "candidate"]) < max_pages:
        url, depth, via = queue.pop(0)
        if url in visited or url in found:
            continue
        visited.add(url)
        if clock() > deadline:
            summary["truncated"] = True
            break
        if not robots.allowed(url):
            if blocked_budget:
                blocked_budget -= 1
                found[url] = Candidate(
                    url, depth, via, status="blocked", reason="blocked_by_robots"
                )
            continue
        try:
            pause()
            summary["fetches"] += 1
            result = fetcher.fetch(url, scope)
        except FetchError as error:
            if blocked_budget:
                blocked_budget -= 1
                found[url] = Candidate(url, depth, via, status="failed", reason=error.code)
            continue
        title, links = page_info(result.body, result.url)
        final = normalize_link(result.url, scope) or url
        found[final] = Candidate(final, depth, via, title or None)
        visited.add(final)
        if depth < max_depth:
            for link in links:
                clean = normalize_link(link, scope)
                if clean and clean not in visited and clean not in found:
                    queue.append((clean, depth + 1, "link"))
    if queue and len([c for c in found.values() if c.status == "candidate"]) >= max_pages:
        summary["truncated"] = True
    return list(found.values()), summary
