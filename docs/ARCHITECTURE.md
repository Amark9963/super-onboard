# Milestone 0 architecture

Super Onboard is an independent implementation requirements workspace, with no Super integration.

```text
frontend/      Next.js App Router, TypeScript, foundation page and health route
backend/app/   FastAPI health API, SQLAlchemy models, scoped repository guard,
               deterministic mock adapter, seed, worker heartbeat
backend/migrations/  Frozen Alembic schema and immutable-history triggers
backend/tests/       Migration, constraint, isolation, mock, health tests
docs/          Product input, architecture, threat assumptions, verification record
compose.yaml   PostgreSQL, private MinIO, Mailpit, migration job, API, worker, web
```

## Decisions

- PostgreSQL is authoritative. SQLite is only a fast test harness; the same suite supports a disposable PostgreSQL database through `TEST_DATABASE_URL`.
- Composite foreign keys include `project_id`. A child cannot refer to another project's parent. Explicit project membership is required even for administrators at the repository boundary. M1 must derive identity from authenticated sessions, never request-supplied user IDs.
- Organizations own projects; contacts and property scopes belong to projects. A requirement revision has exactly one company, portfolio, or property scope. Multiple property-specific revisions can coexist; multi-property grouping can be added without losing the normalized scope references.
- Source documents, versions, blocks, and evidence are distinct. Evidence references the precise block and source version together; locators hold page/section, sheet/cell, or transcript coordinates when future parsers can supply them. Synthetic seeds make no claim of parsed file coordinates.
- Requirements have stable identities and numbered revisions. Customer confirmation and staff review are separate records and status axes. M0 has no approval API or approved-rule query. M3/M4 must implement the explicit transition service, validate confirmation wording, scope, provenance, reviewer authority, and conflicts in a transaction.
- Confirmed revisions, responses, confirmations, staff reviews, invitation item snapshots, artifacts, artifact references, and audits are protected against update/delete by database triggers. New records represent amendments. Artifact references capture exact requirement versions; staleness calculation belongs to M4.
- `jobs` unifies ingestion/extraction job storage; `artifact_versions` unifies blueprint/test-plan storage with constrained kinds. This avoids identical parallel tables while retaining separate records and provenance.
- The worker currently writes a database heartbeat. Future jobs will use PostgreSQL row locking (`FOR UPDATE SKIP LOCKED`), bounded attempts, timeout, and retry scheduling; there is no extra broker or vector database. M0 intentionally does not execute ingestion/extraction jobs.
- Invitations store only SHA-256 hashes of 256-bit random secrets. Explicit invitation-item associations prevent request-wide implicit access; response retries have per-item submission-key uniqueness. HTTP issuance, expiry enforcement, revocation, and idempotent response handling remain M3 work.
- The mock adapter is offline, deterministic, schema-validated, and visibly simulated in its return envelope and candidate statement. It echoes supplied evidence and never verifies or approves it. No paid credentials, live provider, or extraction quality claims.
- License selection is pending. No license for this project's code has been silently selected. Dependency licenses remain their own; choose an OSI-approved project license before release.

## Milestone boundary

M0 exposes only non-sensitive liveness/readiness endpoints and a static foundation page. No business data routes, auth, uploads, parser, crawler, invitation sending, customer review UI, conflict engine, approval workflow, or artifact generation are implemented. Schema fixtures exercise foundations, not completed product journeys. Stop after M0 verification; M1 requires a new user instruction.
