"""Website import: staff routes and the database side of discovery and snapshots.

A fetched page is **unconfirmed evidence**. Each imported page becomes an ordinary source version
(raw bytes in private storage, URL, fetch timestamp, title and content hash recorded) and then
flows through the same parse -> extraction -> citation check -> review pipeline as an upload. A
page's claims are never treated as approved policy and never outrank another source by recency.
"""

import hashlib
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import func, select

from app.api import Input, project_access, scoped_object
from app.auth import DB, User
from app.config import settings
from app.models import (
    AuditEvent,
    Job,
    SourceDocument,
    SourceVersion,
    WebImport,
    WebImportPage,
)
from app.review import record
from app.webfetch import FetchError, validate_url

router = APIRouter(prefix="/api", tags=["website import"])
ACTIVE_PHASES = ("discover_pending", "discovering", "import_pending", "importing")


class WebImportInput(Input):
    url: Annotated[str, Field(min_length=8, max_length=2048)]
    approved_hosts: list[Annotated[str, Field(min_length=3, max_length=253)]] = Field(
        default_factory=list, max_length=5
    )
    max_pages: Annotated[int, Field(ge=1)] | None = None
    max_depth: Annotated[int, Field(ge=0)] | None = None


class SelectInput(Input):
    page_ids: list[Annotated[str, Field(max_length=36)]] = Field(min_length=1, max_length=100)


def import_json(row, pages=None):
    counts = {}
    for page in pages or []:
        counts[page.status] = counts.get(page.status, 0) + 1
    return {
        "id": row.id,
        "root_url": row.root_url,
        "approved_hosts": row.approved_hosts,
        "max_pages": row.max_pages,
        "max_depth": row.max_depth,
        "phase": row.phase,
        "error_code": row.error_code,
        "attempts": row.attempts,
        "summary": row.summary,
        "created_at": row.created_at,
        "counts": counts,
        "note": "Fetched pages are unconfirmed evidence, not approved rules.",
    }


def page_json(page):
    return {
        "id": page.id,
        "url": page.url,
        "depth": page.depth,
        "discovered_via": page.discovered_via,
        "title": page.title,
        "status": page.status,
        "reason": page.reason,
        "selected": page.selected,
        "http_status": page.http_status,
        "source_version_id": page.source_version_id,
        "content_hash": page.content_hash,
        "byte_size": page.byte_size,
        "fetched_at": page.fetched_at,
    }


def clean_hosts(root_host, hosts):
    """Approved hosts must be subdomains of the entered site; everything else is a new import."""
    apex = root_host.removeprefix("www.")
    result = []
    for value in hosts:
        try:
            host = validate_url("https://" + value.strip().lower()).host
        except FetchError as error:
            raise HTTPException(422, f"Approved host is not allowed: {error.code}") from None
        if not host.endswith("." + apex):
            raise HTTPException(422, "Approved hosts must be subdomains of the entered site")
        result.append(host)
    return sorted(set(result))


@router.post("/projects/{project_id}/web-imports", status_code=201)
def create_import(project_id: str, data: WebImportInput, db: DB, user: User):
    project_access(db, user, project_id)
    try:
        target = validate_url(data.url)
    except FetchError as error:
        raise HTTPException(422, f"This URL cannot be imported: {error.code}") from None
    hosts = clean_hosts(target.host, data.approved_hosts)
    if db.scalar(
        select(WebImport.id).where(
            WebImport.project_id == project_id, WebImport.phase.in_(ACTIVE_PHASES)
        )
    ):
        raise HTTPException(409, "A website import is already running for this project")
    row = WebImport(
        project_id=project_id,
        root_url=target.url,
        approved_hosts=hosts,
        max_pages=min(data.max_pages or settings.web_max_pages, settings.web_max_pages),
        max_depth=min(
            settings.web_max_depth if data.max_depth is None else data.max_depth,
            settings.web_max_depth,
        ),
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    record(
        db,
        project_id,
        user,
        "web_import.requested",
        row.id,
        {"host": target.host, "max_pages": row.max_pages, "max_depth": row.max_depth},
    )
    db.commit()
    return import_json(row)


@router.get("/projects/{project_id}/web-imports")
def list_imports(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    rows = db.scalars(
        select(WebImport)
        .where(WebImport.project_id == project_id)
        .order_by(WebImport.created_at.desc())
        .limit(20)
    ).all()
    return [import_json(r, pages_of(db, r.id)) for r in rows]


def pages_of(db, import_id):
    return db.scalars(
        select(WebImportPage)
        .where(WebImportPage.import_id == import_id)
        .order_by(WebImportPage.depth, WebImportPage.created_at, WebImportPage.id)
    ).all()


@router.get("/projects/{project_id}/web-imports/{import_id}")
def import_detail(project_id: str, import_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    row = scoped_object(db, WebImport, project_id, import_id)
    pages = pages_of(db, row.id)
    return {**import_json(row, pages), "pages": [page_json(p) for p in pages]}


@router.post("/projects/{project_id}/web-imports/{import_id}/import")
def select_pages(project_id: str, import_id: str, data: SelectInput, db: DB, user: User):
    """Queue the chosen candidate (or previously failed) pages for snapshotting."""
    project_access(db, user, project_id)
    row = db.scalar(
        select(WebImport)
        .where(WebImport.id == import_id, WebImport.project_id == project_id)
        .with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Record not found")
    if row.phase not in {"discovered", "imported"}:
        raise HTTPException(409, "Pages can be imported once discovery has finished")
    wanted = set(data.page_ids)
    pages = db.scalars(
        select(WebImportPage).where(
            WebImportPage.import_id == row.id, WebImportPage.project_id == project_id
        )
    ).all()
    chosen = [p for p in pages if p.id in wanted]
    if len(chosen) != len(wanted):
        raise HTTPException(404, "Record not found")
    if len(chosen) > row.max_pages:
        raise HTTPException(422, f"Select at most {row.max_pages} pages")
    bad = [p for p in chosen if p.status not in {"candidate", "failed"}]
    if bad:
        raise HTTPException(409, "Only candidate or failed pages can be imported")
    for page in chosen:
        page.status, page.selected, page.reason = "queued", True, None
    row.phase, row.attempts, row.error_code = "import_pending", 0, None
    record(db, project_id, user, "web_import.pages_selected", row.id, {"pages": len(chosen)})
    db.commit()
    return import_json(row, pages_of(db, row.id))


# ---------------------------------------------------------------- worker-side helpers (no network)


def save_discovery(db, row, candidates, summary):
    """Persist discovered pages. Returns the error code when nothing importable was found."""
    for item in candidates:
        db.add(
            WebImportPage(
                project_id=row.project_id,
                import_id=row.id,
                url=item.url[:2048],
                depth=item.depth,
                discovered_via=item.via,
                title=item.title,
                status=item.status,
                reason=item.reason,
            )
        )
    importable = [c for c in candidates if c.status == "candidate"]
    row.summary = {**summary, "candidates": len(importable), "listed": len(candidates)}
    if importable:
        row.phase, row.error_code = "discovered", None
    else:
        reasons = [c.reason for c in candidates if c.reason]
        row.phase, row.error_code = "failed", (reasons[0] if reasons else "no_pages_found")
    db.add(
        AuditEvent(
            project_id=row.project_id,
            actor_type="system",
            actor_reference="web_import_worker",
            action="web_import." + row.phase,
            target_id=row.id,
            detail={"candidates": len(importable), "error_code": row.error_code},
        )
    )
    return row.error_code


def document_name(url: str) -> str:
    """SourceDocument.name is 200 characters; keep long URLs unique with a hash suffix."""
    if len(url) <= 200:
        return url
    return url[:180] + "~" + hashlib.sha256(url.encode()).hexdigest()[:12]


def filename_for(url: str) -> str:
    parts = urlsplit(url)
    stem = (parts.hostname or "page") + parts.path.rstrip("/").replace("/", "_")
    stem = (
        "".join(c if c.isalnum() or c in "._-" else "_" for c in stem)[:150].strip("._") or "page"
    )
    return stem + ".html"


def save_snapshot(db, store, row, page, result):
    """Store the raw page and register it as a source version; returns (version, unchanged)."""
    digest = hashlib.sha256(result.body).hexdigest()
    name = document_name(result.url)
    document = db.scalar(
        select(SourceDocument).where(
            SourceDocument.project_id == row.project_id,
            SourceDocument.kind == "web_page",
            SourceDocument.name == name,
        )
    )
    if document is None:
        document = SourceDocument(project_id=row.project_id, name=name, kind="web_page")
        db.add(document)
        db.flush()
    latest = db.scalar(
        select(SourceVersion)
        .where(SourceVersion.document_id == document.id)
        .order_by(SourceVersion.version.desc())
        .limit(1)
    )
    if latest is not None and latest.content_hash == digest:
        return latest, True  # identical snapshot: do not create noise versions
    number = (latest.version if latest else 0) + 1
    version = SourceVersion(
        project_id=row.project_id,
        document_id=document.id,
        version=number,
        filename=filename_for(result.url),
        media_type="text/html",
        byte_size=len(result.body),
        content_hash=digest,
        source_url=result.url,
        fetched_at=datetime.fromtimestamp(result.fetched_at, timezone.utc),
        fetch_meta={
            "requested_url": result.requested_url,
            "redirects": result.redirects,
            "content_type": result.content_type,
            "http_status": result.status,
            "import_id": row.id,
            "robots": "allowed",
            "unconfirmed_evidence": True,
        },
    )
    db.add(version)
    db.flush()
    key = f"projects/{row.project_id}/sources/{document.id}/{version.id}"
    store.put(key, result.body)
    version.object_key = key
    db.add(Job(project_id=row.project_id, kind="ingestion", source_version_id=version.id))
    db.add(
        AuditEvent(
            project_id=row.project_id,
            actor_type="system",
            actor_reference="web_import_worker",
            action="source.web_snapshot",
            target_id=version.id,
            detail={"import_id": row.id, "version": number},
        )
    )
    return version, False


def count_pages(db, import_id, status):
    return db.scalar(
        select(func.count())
        .select_from(WebImportPage)
        .where(WebImportPage.import_id == import_id, WebImportPage.status == status)
    )
