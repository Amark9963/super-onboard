# M0 verification — 2026-10-27

## Passed

- Backend: 14 tests passed on SQLite with foreign keys enabled, real Alembic upgrade/downgrade cycles, schema drift check, seed idempotency, membership rejection, cross-project FK rejection, scope constraints, source/block association, token primitives, invitation subset constraints, duplicate submission protection, immutable confirmed requirements/artifacts, health checks, and worker heartbeat.
- Backend: the same 14 tests passed against PostgreSQL 17 inside the Compose network (43.64 seconds).
- Backend: Ruff lint and formatting checks.
- Frontend: ESLint, TypeScript, Prettier, and Next.js production build.
- Compose configuration validation and PostgreSQL startup/health.
- Full Compose build/start succeeded: PostgreSQL, MinIO, backend, frontend, and worker reported healthy; migration and storage initialization jobs completed successfully; Mailpit was running and its API responded.
- Live `scripts/smoke.py`: web, API, database readiness, MinIO, Mailpit, and private-bucket anonymous access denial all passed.
- Frontend HTTP smoke test: 1 passed, 0 skipped against the running production container.
- Seed executed twice against the application database: exactly 1 fictional organization, 2 properties, 5 source blocks, and 0 requirement versions.

## Resolved setup issues

The initial MinIO Docker Hub and Quay image pulls failed. Compose now builds MinIO and its client from pinned official source commits. Both builds and startup succeeded. The first MinIO server build took approximately ten minutes; subsequent builds reuse Docker's cache.

The Windows-host PostgreSQL test connection did not reach the database and was stopped. The PostgreSQL suite succeeded when run within the Compose network. SQLite local tests initially required sandbox temporary-directory access; those tests subsequently passed.

One non-failing dependency deprecation warning remains: Starlette's test client warns that its `httpx` compatibility path will move to `httpx2`. No warnings are suppressed.

No M0 implementation blocker remains. The full local stack is left running, with the foundation page at http://localhost:3000. License choice and an archived-MinIO maintenance/replacement decision remain prerequisites for public/production release, not missing M0 workflows.

## Not claimed

No M1–M5 product workflows, live AI extraction, real customer documents, email invitations, approval transitions, blueprint/test-plan generation, website import, or production hardening were tested or implemented. CI configuration is supplied but has not been run on GitHub. The project license is intentionally undecided.

# M1 verification — 2026-10-27

## Passed

- Backend: 21 tests passed on SQLite and the same 21 passed on PostgreSQL 17 in Compose. These cover authentication and session protection, project-scoped access, source intake and revision handling, parser outcomes, and the M0 invariants.
- Backend: Ruff lint and format checks; Alembic schema drift check. The application database migrated to revision `0003_internal_sessions_and_source_intake`.
- Frontend: Prettier, ESLint, TypeScript, and Next.js production build passed.
- Full Compose rebuild completed with PostgreSQL, MinIO, backend, frontend, worker, and Mailpit healthy; migration and storage initialization jobs exited successfully.
- Live `scripts/smoke.py` passed web, API, database readiness, MinIO, Mailpit, and private-bucket access checks.
- Live `scripts/m1_e2e.py` passed staff sign-in, project and property creation, private TXT upload, asynchronous parsing, evidence retrieval, original download, and logout using fictional data through the frontend origin.
- Frontend HTTP test passed against the running production container, including unauthorized project API access.
- The rebuilt sign-in page was visually inspected in the browser and displayed the expected form and workspace title.

## Scope and limits

The local app is running at http://localhost:3000. An operator-provisioned fictional staff account and walkthrough project are available; the credential file is ignored by Git at `.local/demo-login.txt`.

M1 uses deterministic parsing and the mock AI adapter. No M2–M5 workflows, live AI extraction, real customer documents, or production deployment were claimed. CI has not been run on GitHub. The existing Starlette test-client deprecation warning remains non-failing.

# M2 verification — 2026-10-28

## Passed

- Backend: **50 tests passed on SQLite and the same 50 passed on PostgreSQL 17** in Compose (21 earlier tests plus 29 for M2). M2 coverage:
  - Typed schema v2 rejects injected review/confirmation fields, unknown categories and missing citations; the strict-mode wire schema is generated from it.
  - Citation verification: exact, normalized (real offsets, strict about spacing), invented quote, quote shorter than the minimum, block from another source version, nonexistent block, and mixed valid/invalid citations. Flagged and unverifiable candidates cannot be accepted and never drive conflict suggestions.
  - Extraction jobs through the HTTP API and worker: mock end-to-end on the five fictional fixture passages (9 candidates, all `SIMULATED`, unreviewed, `not_confirmed`, verified), provider/ack validation, one active job per source version, unparseable/empty sources refused, transient failures retried to the attempt limit then failed, explicit retry, permanent and unexpected failures reduced to content-free codes (no document text or secrets in job rows or audit details), abandoned-claim recovery, and idempotent re-extraction.
  - Live adapter against a **stubbed transport only**: request shape (strict schema, key only in the header), end-to-end through the worker, HTTP error mapping, malformed/refused/unconfigured output.
  - Review semantics: accept needs verified evidence and confirmed scope and leaves customer confirmation untouched; edits preserve the AI proposal and audit before/after; the AI proposal is write-once at the database; reject requires a reason; reopen; final duplicate and merge (identical-scope rule, evidence copied, canonical must be live); scope validation; list filters and paging; provenance and duplicate records are append-only.
  - Authorization: every new route returns 404 for a non-member and for ids from another project reached through the caller's own project; cross-project duplicate/merge/scope/source references are rejected.
  - Conflicts: the fixture yields one high (Birch Court weekend routing), one medium and one low potential conflict, two allowed variations (including the two buildings' pet limits, which are not a conflict), and gaps (missing phone, tentative wording, live lookup). Pure-function tests cover scope overlap, condition relations, noise cases, signatures, and coverage gaps. Triage is a classification that survives unrelated recomputation, never sets `resolved`, and edited members make the old suggestion obsolete.
- Backend: Ruff lint and format checks (inside Compose too); Alembic upgrade/downgrade cycle and schema-drift check as part of the suite. The application database migrated to revision `0004`.
- Frontend: Prettier, ESLint, TypeScript, and the Next.js production build (during the image build) passed; the HTTP test passed against the running container.
- Full Compose rebuild: PostgreSQL, MinIO, backend, frontend, worker and Mailpit healthy; migration and storage-init jobs exited successfully.
- Live `scripts/smoke.py` and `scripts/m1_e2e.py` still pass. Live `scripts/m2_e2e.py` passed twice (the second run exercising de-duplication): fictional sources uploaded and pasted through the web origin, parsed by the worker, extracted by the SIMULATED mock, citations verified with offsets matching the stored block and a real timecode anchor, high Birch Court conflict and pet-limit variant grouped, acceptance refused until scope confirmed, acceptance leaving customer confirmation `not_confirmed`, triage not resolving, AI proposal unchanged, logout revoking access.
- Visual inspection in Chrome (signed in through the real UI with the fictional demo account): extraction panel, candidate review with highlighted evidence, and conflicts & gaps rendered correctly at 1440px and 390px. Two horizontal-overflow defects at phone width (section header row, candidate-action dropdown) were found and fixed; the final page measured no overflow. Remaining console messages are the pre-existing pre-login 401 and a missing `favicon.ico` 404.

## Scope and limits

The local app is running at http://localhost:3000 with the M2 build, the fictional `Fictional M2 walkthrough` project, and a demo account whose credentials are in the Git-ignored `.local/demo-login.txt`.

- **Not claimed:** live AI extraction. The live adapter was only exercised against a stubbed transport and has never contacted a real model, so no live extraction quality is claimed. All walkthrough results come from the SIMULATED keyword mock and say nothing about AI quality.
- "Verified" evidence means the quote exists at the cited location, not that the statement is faithful, current, or customer-approved. No M3–M5 workflow (customer clarification, invitations, confirmation, approval, blueprints, test plans, website import) exists. CI has not been run on GitHub. The Starlette test-client deprecation warning remains non-failing.
- Observed M1 behavior, unchanged: the login throttle counts successful sign-ins, so ten scripted sign-ins in 15 minutes lock the demo account until the window expires.
