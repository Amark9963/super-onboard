"""PostgreSQL job queue (ingestion + extraction) with crash recovery and parser isolation."""

import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.ai import Extraction, ExtractionRequest, ProviderError, batches, get_provider
from app.config import settings
from app.conflicts import refresh_conflicts
from app.db import SessionLocal
from app.extraction import block_inputs, persist_candidates
from app.models import (
    AuditEvent,
    Job,
    Portfolio,
    Property,
    SourceBlock,
    SourceDocument,
    SourceVersion,
    WebImport,
    WebImportPage,
    WorkerHeartbeat,
)
from app.parsing import parse_isolated
from app.storage import get_store
from app.webfetch import (
    FetchError,
    SafeFetcher,
    discover,
    host_scope,
    load_robots,
    validate_url,
)
from app.webimport import save_discovery, save_snapshot


def tick():
    with SessionLocal.begin() as session:
        row = session.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.name == "foundation"))
        if row is None:
            session.add(WorkerHeartbeat(name="foundation", seen_at=datetime.now(timezone.utc)))
        else:
            row.seen_at = datetime.now(timezone.utc)


def run_once(store=None, parser=parse_isolated):
    store = store or get_store()
    now = datetime.now(timezone.utc)
    with SessionLocal.begin() as db:
        abandoned = db.scalars(
            select(Job)
            .where(
                Job.kind == "ingestion",
                Job.status == "running",
                Job.claimed_at < now - timedelta(minutes=2),
            )
            .with_for_update(skip_locked=True)
        )
        for job in abandoned:
            job.status = "pending" if job.attempts < job.max_attempts else "failed"
            job.error_code = "worker_interrupted"
            version = db.get(SourceVersion, job.source_version_id)
            version.parse_status, version.error_code = job.status, job.error_code
        db.flush()
        job = db.scalar(
            select(Job)
            .where(
                Job.kind == "ingestion", Job.status == "pending", Job.attempts < Job.max_attempts
            )
            .order_by(Job.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job is None:
            return False
        job.status, job.claimed_at = "running", now
        job.attempts += 1
        version = db.get(SourceVersion, job.source_version_id)
        document = db.get(SourceDocument, version.document_id)
        version.parse_status = "processing"
        job_id, attempt = job.id, job.attempts
        filename, object_key, transcript = (
            version.filename,
            version.object_key,
            document.kind == "transcript",
        )
    try:
        content = store.get(object_key)
        result = parser(filename, content, transcript)
        retryable = False
    except Exception:
        result = {"blocks": [], "status": "failed", "error_code": "storage_read_failed"}
        retryable = True
    with SessionLocal.begin() as db:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job.status != "running" or job.attempts != attempt:
            return True
        version = db.get(SourceVersion, job.source_version_id)
        job.status = (
            "pending" if retryable and job.attempts < job.max_attempts else result["status"]
        )
        job.error_code = result["error_code"]
        version.parse_status, version.error_code = job.status, result["error_code"]
        if result.get("title") and not version.page_title:
            version.page_title = result["title"]
        for block in result["blocks"]:
            db.add(SourceBlock(project_id=job.project_id, source_version_id=version.id, **block))
        db.add(
            AuditEvent(
                project_id=job.project_id,
                actor_type="system",
                actor_reference="ingestion_worker",
                action="source.parse_" + job.status,
                target_id=version.id,
            )
        )
    return True


def run_extraction_once(provider_factory=get_provider):
    """Claim and process one extraction job. Provider calls happen outside any DB transaction."""
    now = datetime.now(timezone.utc)
    with SessionLocal.begin() as db:
        abandoned = db.scalars(
            select(Job)
            .where(
                Job.kind == "extraction",
                Job.status == "running",
                Job.claimed_at < now - timedelta(minutes=settings.extraction_stale_minutes),
            )
            .with_for_update(skip_locked=True)
        )
        for job in abandoned:
            job.status = "pending" if job.attempts < job.max_attempts else "failed"
            job.error_code = "worker_interrupted"
        db.flush()
        job = db.scalar(
            select(Job)
            .where(
                Job.kind == "extraction",
                Job.status == "pending",
                Job.attempts < Job.max_attempts,
            )
            .order_by(Job.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job is None:
            return False
        job.status, job.claimed_at = "running", now
        job.attempts += 1
        job_id, attempt, provider_name = job.id, job.attempts, job.provider
        blocks = db.scalars(
            select(SourceBlock)
            .where(
                SourceBlock.project_id == job.project_id,
                SourceBlock.source_version_id == job.source_version_id,
            )
            .order_by(SourceBlock.position, SourceBlock.id)
        ).all()
        properties = db.scalars(
            select(Property).where(Property.project_id == job.project_id).order_by(Property.name)
        ).all()
        portfolios = db.scalars(
            select(Portfolio).where(Portfolio.project_id == job.project_id).order_by(Portfolio.name)
        ).all()
        inputs = block_inputs(blocks)
        property_pairs = [(p.id, p.name) for p in properties]
        portfolio_pairs = [(p.id, p.name) for p in portfolios]
    error, retryable, extraction = None, False, None
    try:
        if not inputs:
            raise ProviderError("no_source_blocks", False)
        provider = provider_factory(provider_name)
        candidates = []
        for batch in batches(inputs, settings.ai_batch_chars):
            part = provider.extract(ExtractionRequest(batch, property_pairs, portfolio_pairs))
            candidates.extend(part.candidates)
        extraction = Extraction(
            provider=part.provider,
            model=part.model,
            simulated=part.simulated,
            candidates=candidates,
        )
    except ProviderError as failure:
        error, retryable = failure.code, failure.retryable
    except ValueError:
        error = "provider_unavailable"
    except Exception:
        error, retryable = "extraction_failed", True
    with SessionLocal.begin() as db:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job.status != "running" or job.attempts != attempt:
            return True
        if error:
            job.status = "pending" if retryable and job.attempts < job.max_attempts else "failed"
            job.error_code = error
        else:
            job.summary = persist_candidates(
                db,
                job,
                extraction,
                blocks=db.scalars(
                    select(SourceBlock).where(
                        SourceBlock.project_id == job.project_id,
                        SourceBlock.source_version_id == job.source_version_id,
                    )
                ).all(),
                properties=db.scalars(
                    select(Property).where(Property.project_id == job.project_id)
                ).all(),
                portfolios=db.scalars(
                    select(Portfolio).where(Portfolio.project_id == job.project_id)
                ).all(),
            )
            job.status, job.error_code = "succeeded", None
            db.flush()
            refresh_conflicts(db, job.project_id)
        db.add(
            AuditEvent(
                project_id=job.project_id,
                actor_type="system",
                actor_reference="extraction_worker",
                action="extraction." + job.status,
                target_id=job.id,
                detail={"error_code": job.error_code, "attempt": job.attempts},
            )
        )
    return True


def run_web_once(fetcher=None, store=None, sleep=time.sleep):
    """Claim one website import and run its discovery or snapshot phase.

    All network access happens outside database transactions and only through `SafeFetcher`.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal.begin() as db:
        for stale in db.scalars(
            select(WebImport)
            .where(
                WebImport.phase.in_(("discovering", "importing")),
                WebImport.claimed_at < now - timedelta(minutes=10),
            )
            .with_for_update(skip_locked=True)
        ):
            if stale.attempts >= 3:
                stale.phase, stale.error_code = "failed", "worker_interrupted"
            else:
                stale.phase = (
                    "discover_pending" if stale.phase == "discovering" else "import_pending"
                )
        db.flush()
        row = db.scalar(
            select(WebImport)
            .where(
                WebImport.phase.in_(("discover_pending", "import_pending")), WebImport.attempts < 3
            )
            .order_by(WebImport.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if row is None:
            return False
        importing = row.phase == "import_pending"
        row.phase = "importing" if importing else "discovering"
        row.claimed_at = now
        row.attempts += 1
        job = (
            row.id,
            row.project_id,
            row.root_url,
            list(row.approved_hosts),
            row.max_pages,
            row.max_depth,
        )
        queued = (
            [
                (p.id, p.url)
                for p in db.scalars(
                    select(WebImportPage)
                    .where(WebImportPage.import_id == row.id, WebImportPage.status == "queued")
                    .order_by(WebImportPage.depth, WebImportPage.created_at, WebImportPage.id)
                )
            ]
            if importing
            else []
        )
    fetcher = fetcher or SafeFetcher()
    if importing:
        _snapshot_pages(job, queued, fetcher, store or get_store(), sleep)
    else:
        _discover_pages(job, fetcher, sleep)
    return True


def _discover_pages(job, fetcher, sleep):
    import_id, _, root_url, approved, max_pages, max_depth = job
    candidates, summary, error = [], {}, None
    try:
        candidates, summary = discover(
            fetcher, root_url, approved, max_pages=max_pages, max_depth=max_depth, sleep=sleep
        )
    except FetchError as failure:
        error = failure.code
    except Exception:
        error = "discovery_failed"
    with SessionLocal.begin() as db:
        row = db.scalar(select(WebImport).where(WebImport.id == import_id).with_for_update())
        if row.phase != "discovering":
            return
        if error:
            row.phase, row.error_code = "failed", error
            db.add(
                AuditEvent(
                    project_id=row.project_id,
                    actor_type="system",
                    actor_reference="web_import_worker",
                    action="web_import.failed",
                    target_id=row.id,
                    detail={"error_code": error},
                )
            )
        else:
            save_discovery(db, row, candidates, summary)


def _snapshot_pages(job, queued, fetcher, store, sleep):
    import_id, project_id, root_url, approved, _, _ = job
    started = time.monotonic()
    counts = {"fetched": 0, "unchanged": 0, "failed": 0, "blocked": 0}
    root = validate_url(root_url)
    scope = host_scope(root.host, approved)
    robots_by_origin = {}

    def mark(page_id, **fields):
        with SessionLocal.begin() as db:
            page = db.get(WebImportPage, page_id)
            for key, value in fields.items():
                setattr(page, key, value)

    for number, (page_id, url) in enumerate(queued):
        if time.monotonic() - started > settings.web_total_seconds:
            for later_id, _ in queued[number:]:
                mark(later_id, status="failed", reason="time_budget_exceeded")
                counts["failed"] += 1
            break
        try:
            target = validate_url(url)
            robots = robots_by_origin.get(target.origin)
            if robots is None:
                robots = robots_by_origin[target.origin] = load_robots(fetcher, target, scope)
            if not robots.allowed(target.url):
                mark(page_id, status="blocked", reason="blocked_by_robots")
                counts["blocked"] += 1
                continue
            result = fetcher.fetch(target.url, scope)
        except FetchError as failure:
            mark(page_id, status="failed", reason=failure.code)
            counts["failed"] += 1
            sleep(settings.web_delay_seconds)
            continue
        except Exception:
            mark(page_id, status="failed", reason="fetch_failed")
            counts["failed"] += 1
            continue
        try:
            with SessionLocal.begin() as db:
                row = db.get(WebImport, import_id)
                page = db.get(WebImportPage, page_id)
                version, unchanged = save_snapshot(db, store, row, page, result)
                page.status, page.reason = "fetched", "unchanged" if unchanged else None
                page.source_version_id, page.content_hash = version.id, version.content_hash
                page.byte_size, page.http_status = version.byte_size, result.status
                page.fetched_at = datetime.fromtimestamp(result.fetched_at, timezone.utc)
            counts["unchanged" if unchanged else "fetched"] += 1
        except Exception:
            mark(page_id, status="failed", reason="storage_failed")
            counts["failed"] += 1
        sleep(settings.web_delay_seconds)
    with SessionLocal.begin() as db:
        row = db.scalar(select(WebImport).where(WebImport.id == import_id).with_for_update())
        row.phase = "imported"
        row.summary = {**(row.summary or {}), "import": counts}
        db.add(
            AuditEvent(
                project_id=project_id,
                actor_type="system",
                actor_reference="web_import_worker",
                action="web_import.imported",
                target_id=row.id,
                detail=counts,
            )
        )


def heartbeat_loop():
    while True:
        try:
            tick()
        except Exception:
            print("worker_heartbeat_unavailable", flush=True)
        time.sleep(10)


if __name__ == "__main__":
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    while True:
        try:
            worked = run_once()
            worked = run_extraction_once() or worked
            worked = run_web_once() or worked
            if not worked:
                time.sleep(2)
        except Exception:
            print("worker_iteration_failed", flush=True)
            time.sleep(5)
