# Super Onboard handover for Claude

**Updated:** 2026-10-28  
**Workspace:** `C:\Users\amark\projects\super-onboard`  
**State:** Milestones 0, 1 and 2 are implemented and verified locally. Milestones 3–5 have not been implemented. The local Compose stack was left running at http://localhost:3000 with the M2 build.

## First read

1. Read [PRD.md](PRD.md) in full. It is the product authority, especially its invariant, milestone boundaries, approval semantics, and definition of done.
2. Read [CODEX_START.md](CODEX_START.md) for engineering constraints. Its “first task (M0 only)” is historical.
3. Read [README.md](../README.md), [M2.md](M2.md), [M1.md](M1.md), [ARCHITECTURE.md](ARCHITECTURE.md), [THREAT_MODEL.md](THREAT_MODEL.md), and [VERIFICATION.md](VERIFICATION.md). ARCHITECTURE describes the M0 baseline; M1.md and M2.md describe later work and supersede it where they differ.

The project is **independent and unaffiliated with Super**. Do not connect to Super systems or claim to configure a live agent. Use fictional data in tests and screenshots. Never turn an AI proposal or a staff-only action into an approved customer policy.

## Implemented baseline

- **Runtime:** Next.js 16/TypeScript frontend, FastAPI/Python 3.12 backend, PostgreSQL 17, private S3-compatible MinIO storage, Mailpit, and a database-backed worker in `compose.yaml`. Published ports bind to loopback.
- **M0 schema:** Organizations, projects and memberships, contacts and property scope, source documents/versions/blocks, requirements/versions/evidence, review and invitation records, confirmation and staff review records, artifact history, conflicts, jobs, and audits. Project-bound composite foreign keys and immutable-history triggers enforce important invariants. Alembic revisions are `0001`–`0004`.
- **M1 identity and sources:** Internal accounts via `python -m app.manage_user` (no default password), PBKDF2 hashes, hashed opaque sessions in HttpOnly SameSite cookies, CSRF + exact Origin checks, login throttling, and project membership checks on every project API (admins included). Staff manage organizations, projects, portfolios/properties, contacts, private PDF/DOCX/XLSX/TXT/transcript sources with real page/section, sheet/cell, line, and timecode anchors. `backend/app/worker.py` claims jobs with row locks, bounded retries and stale-claim recovery; `backend/app/parsing.py` parses in an isolated timed child process.
- **M2 extraction and review** (details in [M2.md](M2.md)):
  - `backend/app/ai.py`: typed schema v2 (no review/confirmation fields), `MockAIProvider` (deterministic keyword rules, always `simulated`, **not AI**), and an opt-in `OpenAICompatibleProvider` (needs `AI_API_KEY`; per-job staff acknowledgement of third-party processing). The live adapter has only been tested against a stubbed transport, never a real endpoint.
  - `backend/app/citations.py`: deterministic exact/normalized/invalid quote checks against stored blocks of the extracted source version, with real character offsets; no fuzzy matching, no invented anchors.
  - `backend/app/extraction.py` + `run_extraction_once` in `worker.py`: asynchronous jobs (provider call outside any DB transaction, atomic persist, retries, stale recovery, de-duplicating fingerprints).
  - `backend/app/review.py`: job, candidate review (edit, scope confirmation, accept-for-customer-review, reject, reopen, duplicate, merge), conflict listing and triage routes. `backend/app/conflicts.py`: pairwise conflict/variant/gap suggestions.
  - Write-once `ai_proposal` and `candidate_provenance`, final `requirement_duplicates`, audit `detail` before/after values.
  - UI: `frontend/app/review.tsx` (extraction panel, candidate review with highlighted evidence side panel, conflicts & gaps), shared `frontend/app/api.ts`, wired into `frontend/app/workspace.tsx`.

## Local operation and verification

From the workspace root, use the existing `.env` if present; do not overwrite it:

```powershell
docker compose up --build -d --wait
docker compose ps
.venv/Scripts/python.exe scripts/smoke.py
.venv/Scripts/python.exe scripts/m1_e2e.py
.venv/Scripts/python.exe scripts/m2_e2e.py
```

The demo sign-in is for fictional data. Its local credentials are in Git-ignored `.local/demo-login.txt` (email on line 1, password on line 2). Do not print, commit, or copy the password into a handover or issue. Fictional `Fictional M1 walkthrough` and `Fictional M2 walkthrough` projects exist in the local database. Note the login throttle counts every sign-in call (successful ones too) at 10 per 15 minutes per account, so repeated scripted sign-ins can lock the demo account for up to 15 minutes.

Run backend tests inside the Compose network for PostgreSQL (see README): `docker compose build backend`, then `docker compose run --rm --no-deps -T -e TEST_DATABASE_URL=postgresql+psycopg://onboard:local-only@postgres:5432/onboard_test backend pytest -q` after `docker compose exec postgres createdb -U onboard onboard_test` (it already exists locally). See `docs/VERIFICATION.md` for exactly what passed and what was not claimed. GitHub CI is configured but has **not** been run remotely.

## Repository map

| Area | Key files |
|---|---|
| Product direction | `docs/PRD.md`, `docs/CODEX_START.md` |
| Startup and environment | `README.md`, `.env.example`, `compose.yaml`, `infra/minio/Dockerfile` |
| Data and migrations | `backend/app/models.py`, `backend/migrations/versions/` |
| Auth and project API | `backend/app/auth.py`, `backend/app/access.py`, `backend/app/api.py` |
| Intake and worker | `backend/app/parsing.py`, `backend/app/storage.py`, `backend/app/worker.py` |
| Extraction and review | `backend/app/ai.py`, `citations.py`, `extraction.py`, `review.py`, `conflicts.py` |
| UI and proxy | `frontend/app/workspace.tsx`, `frontend/app/review.tsx`, `frontend/app/api.ts`, `frontend/app/styles.css`, `frontend/next.config.ts` (rewrites `/api/auth`, `/api/ai`, `/api/organizations`, `/api/projects`) |
| Tests and live checks | `backend/tests/` (shared fixtures in `conftest.py`/`support.py`), `frontend/tests/`, `scripts/smoke.py`, `scripts/m1_e2e.py`, `scripts/m2_e2e.py` |

## Next increment: M3 only

Per PRD section 16, M3 is **customer review**: clarification questions, preview, link tokens, SMTP dev delivery (Mailpit), public page, partial response submission, internal inbox, confirmation workflow. Keep it independently runnable and testable; do not roll M4–M5 into it.

Starting points from M2:

- Candidates with `staff_review_state = 'accepted'` (and `customer_confirmation_state = 'not_confirmed'`) are the pool for confirmation requests. Conflict groups with `triage_state = 'confirmed'` are the natural source of clarification questions. Source excerpts shared with customers must be explicitly selected per invitation item, never project-wide.
- The M0 tables `review_requests`, `clarification_questions`, `review_request_items`, `review_invitations`, `invitation_items`, `customer_response_versions`, `customer_confirmations` are scaffolding with constraints, not working workflows. Tokens are hashed at rest (`app/tokens.py`); build expiry, revocation, rate limiting, `Referrer-Policy: no-referrer`, idempotent submissions, and a customer-link audit actor that is not a verified person. Email must not claim inbox delivery.
- Customer confirmation and staff review stay separate axes. M3 must add the explicit transition service; a customer confirmation does not approve a rule until an authorized reviewer accepts it (M4 completes approval for blueprints). The immutable-history trigger already freezes `customer_confirmation_state = 'confirmed'` revisions, so a post-confirmation change must be a new revision.
- Add `/api/public` to the Next rewrites only for token routes, and keep customer responses scoped by token, never by project id.

Carry-over M2 limitations worth deciding about: flagged candidates cannot gain new evidence; duplicate/merge cannot be undone; there is no per-user extraction rate limit or provider spend cap; conflict matching depends on provider-supplied `topic`/`proposed_action` slugs.

M4 must implement transactional approval gates, blueprint/test-plan versions, audit/readiness and staleness. M5 must implement defensive website import and hardening; public URL fetching must be SSRF-safe when built.

## Open decisions and operational caveats

- Git was initialized on branch `main`, but **there is no initial commit**. All project files currently show as untracked. Establish a reviewed baseline before using diffs or branching; do not accidentally include `.env`, `.local/`, virtual environments, Node modules, or generated files. `.gitignore` excludes them.
- No project license has been selected. Choose an OSI-approved license with the owner before public release; do not silently assign one.
- MinIO and its client are built from pinned official source commits because published image pulls failed. The upstream repository is archived; decide on maintenance or replacement before production deployment. Development Compose credentials are local examples, not production secrets.
- This stack is local development, not production deployment. Production still needs TLS, external secret management, least-privilege storage/database access, backups with restore tests, and deployment-specific privacy controls.
- Live AI extraction quality is unmeasured. Report quality metrics only after an actual live run with the owner's own key and fictional or authorized documents.

## Suggested opening prompt for Claude

> Continue Super Onboard in `C:\Users\amark\projects\super-onboard`. Read `docs/CLAUDE_HANDOVER.md`, `docs/PRD.md`, `docs/CODEX_START.md`, `README.md`, `docs/M2.md`, `docs/M1.md`, and `docs/VERIFICATION.md` first. M0–M2 are complete and locally verified. Implement **M3 only** as a separately testable increment: clarification composer, scoped hashed login-free review links, Mailpit email with honest delivery states, the public mobile review page with partial/idempotent responses, the internal response inbox, and the customer-confirmation workflow with staff validation kept as a separate axis. Preserve project authorization, source provenance, and the rule that no AI or staff-only action approves customer policy. Verify against SQLite and PostgreSQL and a live fictional flow; document exact results. Do not start M4–M5 until M3 is working and verified.
