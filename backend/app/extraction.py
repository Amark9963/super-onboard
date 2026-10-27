"""Turn validated provider proposals into *unreviewed* candidate requirements.

Every candidate is stored with: the untouched AI proposal (write-once), per-citation verification
results, evidence rows tied to real source blocks, and write-once provenance. Candidates always
start as customer `not_confirmed` / staff `pending` with an unconfirmed scope.
"""

import hashlib

from sqlalchemy import select

from app.ai import SCHEMA_VERSION, BlockInput, slug
from app.citations import check_citations, evidence_status
from app.models import (
    AuditEvent,
    CandidateProvenance,
    Requirement,
    RequirementEvidence,
    RequirementVersion,
)

MAX_CANDIDATES_PER_JOB = 200


def describe_locator(locator: dict) -> str:
    parts = []
    for key, value in (locator or {}).items():
        if key in {"formula_not_evaluated", "synthetic"}:
            continue
        parts.append(
            f"{key.replace('_', ' ')} {'/'.join(map(str, value)) if isinstance(value, list) else value}"
        )
    return ", ".join(parts)


def block_inputs(blocks) -> list[BlockInput]:
    return [BlockInput(b.id, b.text, describe_locator(b.locator)) for b in blocks]


def fingerprint(source_version_id, candidate, scope_id) -> str:
    material = "|".join(
        [
            source_version_id,
            candidate.citations[0].block_id,
            slug(candidate.statement),
            candidate.scope_type,
            scope_id or "",
            candidate.topic,
        ]
    )
    return hashlib.sha256(material.encode()).hexdigest()


def resolve_scope(candidate, property_ids: set[str], portfolio_ids: set[str]):
    """Return (scope_type, property_id, portfolio_id, note). Never trusts model-supplied ids."""
    ids = candidate.scope_ids
    if candidate.scope_type == "property" and len(ids) == 1 and ids[0] in property_ids:
        return "property", ids[0], None, None
    if candidate.scope_type == "portfolio" and len(ids) == 1 and ids[0] in portfolio_ids:
        return "portfolio", None, ids[0], None
    if candidate.scope_type == "company" and not ids:
        return "company", None, None, None
    return (
        "company",
        None,
        None,
        f"Proposed {candidate.scope_type} scope was not valid for this project; defaulted to "
        "company-wide pending staff assignment.",
    )


def persist_candidates(db, job, extraction, blocks, properties, portfolios) -> dict:
    blocks_by_id = {b.id: b.text for b in blocks}
    property_ids = {p.id for p in properties}
    portfolio_ids = {p.id for p in portfolios}
    known = set(
        db.scalars(
            select(CandidateProvenance.fingerprint).where(
                CandidateProvenance.project_id == job.project_id
            )
        )
    )
    created = skipped = flagged = 0
    for candidate in extraction.candidates[:MAX_CANDIDATES_PER_JOB]:
        scope_type, property_id, portfolio_id, scope_note = resolve_scope(
            candidate, property_ids, portfolio_ids
        )
        digest = fingerprint(job.source_version_id, candidate, property_id or portfolio_id)
        if digest in known:
            skipped += 1
            continue
        known.add(digest)
        results = check_citations(candidate.citations, blocks_by_id)
        status = evidence_status(results)
        flagged += status != "verified"
        requirement = Requirement(project_id=job.project_id, title=candidate.title)
        db.add(requirement)
        db.flush()
        version = RequirementVersion(
            project_id=job.project_id,
            requirement_id=requirement.id,
            version=1,
            category=candidate.category,
            statement=candidate.statement,
            scope_type=scope_type,
            property_id=property_id,
            portfolio_id=portfolio_id,
            conditions=candidate.conditions,
            proposed_action=candidate.proposed_action,
            topic=candidate.topic,
            requires_live_lookup=candidate.requires_live_lookup,
            missing_information=candidate.missing_information,
            ai_proposal={
                "schema_version": SCHEMA_VERSION,
                "provider": extraction.provider,
                "model": extraction.model,
                "simulated": extraction.simulated,
                "job_id": job.id,
                "scope_note": scope_note,
                "candidate": candidate.model_dump(),
            },
            evidence_status=status,
            customer_confirmation_state="not_confirmed",
            staff_review_state="pending",
            scope_reviewed=False,
            citation_report=[
                {
                    "block_id": r.block_id,
                    "claimed_quote": r.claimed_quote,
                    "state": r.verdict.state,
                    "notes": r.verdict.notes,
                }
                for r in results
            ],
        )
        db.add(version)
        db.flush()
        for result in results:
            if result.block_id not in blocks_by_id:
                continue  # No real block to anchor to; the citation report keeps the claim.
            valid = result.verdict.valid
            db.add(
                RequirementEvidence(
                    project_id=job.project_id,
                    requirement_version_id=version.id,
                    source_version_id=job.source_version_id,
                    block_id=result.block_id,
                    quoted_text=result.verdict.verified_text if valid else result.claimed_quote,
                    quote_match_state=result.verdict.state,
                    verification_notes=result.verdict.notes,
                    char_start=result.verdict.start,
                    char_end=result.verdict.end,
                )
            )
        db.add(
            CandidateProvenance(
                project_id=job.project_id,
                requirement_version_id=version.id,
                job_id=job.id,
                fingerprint=digest,
                provider=extraction.provider[:120],
                model=extraction.model,
                simulated=extraction.simulated,
                schema_version=SCHEMA_VERSION,
            )
        )
        db.add(
            AuditEvent(
                project_id=job.project_id,
                actor_type="system",
                actor_reference="extraction_worker",
                action="candidate.proposed",
                target_id=version.id,
                detail={
                    "job_id": job.id,
                    "provider": extraction.provider,
                    "simulated": extraction.simulated,
                    "evidence_status": status,
                },
            )
        )
        created += 1
    return {
        "created": created,
        "skipped_duplicates": skipped,
        "flagged": flagged,
        "provider": extraction.provider,
        "model": extraction.model,
        "simulated": extraction.simulated,
        "truncated": len(extraction.candidates) > MAX_CANDIDATES_PER_JOB,
    }
