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
    WorkerHeartbeat,
)
from app.parsing import parse_isolated
from app.storage import get_store


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
            if not worked:
                time.sleep(2)
        except Exception:
            print("worker_iteration_failed", flush=True)
            time.sleep(5)
