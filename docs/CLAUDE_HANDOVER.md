# Super Onboard handover for Claude

**Updated:** 2026-10-28  
**Workspace:** `C:\Users\amark\projects\super-onboard`  
**State:** Milestones 0–5 are implemented and verified locally. M5 lives on branch `m5-website-import` (not yet merged to `main` unless the git log says so). The PRD milestone list is complete; remaining work is the open items below. The local Compose stack is running at http://localhost:3000 with the M4 build. Git has the M0–M2 baseline, M3, and a Codex commit for live AI clarification drafting; the M4 work is uncommitted.

## First read

1. Read [PRD.md](PRD.md) in full. It is the product authority, especially its invariant, milestone boundaries, approval semantics, and definition of done.
2. Read [CODEX_START.md](CODEX_START.md) for engineering constraints. Its “first task (M0 only)” is historical.
3. Read [README.md](../README.md), [M5.md](M5.md), [DEPLOYMENT.md](DEPLOYMENT.md), [M4.md](M4.md), [M3.md](M3.md), [M2.md](M2.md), [M1.md](M1.md), [ARCHITECTURE.md](ARCHITECTURE.md), [THREAT_MODEL.md](THREAT_MODEL.md), and [VERIFICATION.md](VERIFICATION.md). ARCHITECTURE describes the M0 baseline; M1.md and M2.md describe later work and supersede it where they differ.

The project is **independent and unaffiliated with Super**. Do not connect to Super systems or claim to configure a live agent. Use fictional data in tests and screenshots. Never turn an AI proposal or a staff-only action into an approved customer policy.

## Implemented baseline

- **Runtime:** Next.js 16/TypeScript frontend, FastAPI/Python 3.12 backend, PostgreSQL 17, private S3-compatible MinIO storage, Mailpit, and a database-backed worker in `compose.yaml`. Published ports bind to loopback.
- **M0 schema:** Organizations, projects and memberships, contacts and property scope, source documents/versions/blocks, requirements/versions/evidence, review and invitation records, confirmation and staff review records, artifact history, conflicts, jobs, and audits. Project-bound composite foreign keys and immutable-history triggers enforce important invariants. Alembic revisions are `0001`–`0007`.
- **M1 identity and sources:** Internal accounts via `python -m app.manage_user` (no default password), PBKDF2 hashes, hashed opaque sessions in HttpOnly SameSite cookies, CSRF + exact Origin checks, login throttling, and project membership checks on every project API (admins included). Staff manage organizations, projects, portfolios/properties, contacts, private PDF/DOCX/XLSX/TXT/transcript sources with real page/section, sheet/cell, line, and timecode anchors. `backend/app/worker.py` claims jobs with row locks, bounded retries and stale-claim recovery; `backend/app/parsing.py` parses in an isolated timed child process.
- **M2 extraction and review** (details in [M2.md](M2.md)):
  - `backend/app/ai.py`: typed schema v2 (no review/confirmation fields), `MockAIProvider` (deterministic keyword rules, always `simulated`, **not AI**), and an opt-in `OpenAICompatibleProvider` (needs `AI_API_KEY`; per-job staff acknowledgement of third-party processing). The live adapter has only been tested against a stubbed transport, never a real endpoint.
  - `backend/app/citations.py`: deterministic exact/normalized/invalid quote checks against stored blocks of the extracted source version, with real character offsets; no fuzzy matching, no invented anchors.
  - `backend/app/extraction.py` + `run_extraction_once` in `worker.py`: asynchronous jobs (provider call outside any DB transaction, atomic persist, retries, stale recovery, de-duplicating fingerprints).
  - `backend/app/review.py`: job, candidate review (edit, scope confirmation, accept-for-customer-review, reject, reopen, duplicate, merge), conflict listing and triage routes. `backend/app/conflicts.py`: pairwise conflict/variant/gap suggestions.
  - Write-once `ai_proposal` and `candidate_provenance`, final `requirement_duplicates`, audit `detail` before/after values.
  - UI: `frontend/app/review.tsx` (extraction panel, candidate review with highlighted evidence side panel, conflicts & gaps), shared `frontend/app/api.ts`, wired into `frontend/app/workspace.tsx`.

- **M3 customer review** (details in [M3.md](M3.md)):
  - `backend/app/invitations.py`: lifecycle, frozen-snapshot `customer_view` shared by preview and the public page, edit lock while a link is live.
  - `backend/app/customer.py`: composer, preview, send/resend/revoke, response inbox, staff validation (`validate_confirmation` / `reject_confirmation` / `acknowledge`), revise-from-correction. `backend/app/public.py`: token-only routes with idempotent, versioned, whole-request-validated responses. `mailer.py` (SMTP), `ratelimit.py` (DB-backed limiter).
  - Token hash at rest, raw link shown once; backend runs with `--no-access-log`; no-referrer/no-store/noindex headers. `customer_confirmation_state = confirmed` means a customer confirmation was recorded **and** staff-validated; it freezes the version by trigger.
  - UI: `frontend/app/customer.tsx` (composer, requests, inbox) and the public page `frontend/app/review/[token]/`.

- **M4 outputs and versioning** (details in [M4.md](M4.md)):
  - `backend/app/outputs.py`: approval gate derived on read (`approval_reasons`; no approval flag exists), customer-backed conflict resolution (immutable `conflict_resolutions`), revisions after approval, sectioned blueprint and manual test-plan generation from approved rules only (`schema_version` 2, verified source references, confirmation provenance, explicit exclusions), staleness, readiness states, export downloads and `GET /audit`. `conflicts.current_versions` keeps a confirmed baseline current until a newer revision is confirmed and validated.
  - UI: `frontend/app/outputs.tsx` (approvals with blockers, conflict resolution, revision drafting, generation, exports, audit trail).
  - A Codex session produced the first M4 draft and was interrupted by a usage limit; it was reviewed and completed in a later session. Fixed during that review: a migration/model index mismatch, `dict(db.execute(...))` crashing the approvals endpoint, a pending revision immediately removing the approved baseline (now preserved, per PRD 3.3), exports without source references or sections, un-audited exports, no audit trail endpoint, and per-row recomputation of approval status.

- **M5 website import and hardening** (details in [M5.md](M5.md) and [DEPLOYMENT.md](DEPLOYMENT.md)):
  - `backend/app/webfetch.py`: the SSRF-safe fetcher (URL/IP/port/host policy, resolve-once-and-pin DNS, per-hop redirect validation, byte/time caps, identity encoding only, RFC 9309 robots, `defusedxml` sitemaps, bounded breadth-first discovery). `backend/app/webimport.py` + `run_web_once` in `worker.py`: staff routes, discovery/snapshot phases, `web_imports`/`web_import_pages` tables, page snapshots as ordinary `source_versions` with `source_url`, `fetched_at`, `page_title`, `fetch_meta`. HTML parsing lives in `parsing.py` and drops scripts and hidden text.
  - Hardening: per-client rate limits (`clientip.py`, `TRUSTED_PROXY_HOPS`), frontend security headers, non-root backend image, upgraded `pypdf`/`python-multipart`/`pydantic-settings` after `pip-audit`, `defusedxml`, http(s)-only AI base URL, `compose.prod.yaml` + `infra/caddy/Caddyfile`, `scripts/backup.sh` (verified object mirror) and `scripts/restore_check.py` (real restore into a scratch DB).
  - UI: `frontend/app/webimport.tsx`. Demo site: `infra/fixture-site` (compose profile `fixture`).

## Local operation and verification

From the workspace root, use the existing `.env` if present; do not overwrite it:

```powershell
docker compose up --build -d --wait
docker compose ps
.venv/Scripts/python.exe scripts/smoke.py
.venv/Scripts/python.exe scripts/m1_e2e.py
.venv/Scripts/python.exe scripts/m2_e2e.py
.venv/Scripts/python.exe scripts/m3_e2e.py   # also reads the invitation from Mailpit
.venv/Scripts/python.exe scripts/m4_e2e.py   # builds on the m2/m3 walkthrough data; run them in order
# M5 needs the demo site and permissive demo settings (local demos only; see the top of the script):
#   WEB_PRIVATE_HOST_ALLOWLIST=fixture-site WEB_ALLOWED_PORTS=80,443,8080 docker compose --profile fixture up -d fixture-site backend worker
.venv/Scripts/python.exe scripts/m5_e2e.py
.venv/Scripts/python.exe scripts/restore_check.py   # proves a database backup restores
```
After the M5 demo recreate `backend` and `worker` without those variables to restore the safe defaults.

The demo sign-in is for fictional data. Its local credentials are in Git-ignored `.local/demo-login.txt` (email on line 1, password on line 2). Do not print, commit, or copy the password into a handover or issue. Fictional `Fictional M1 walkthrough` and `Fictional M2 walkthrough` projects exist in the local database (the M3 script runs in the latter and leaves fictional review requests, responses and validated confirmations there). The login throttle counts every sign-in call (successful ones too) at 10 per 15 minutes per account, so repeated scripted sign-ins can lock the demo account for up to 15 minutes.

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
| Customer review | `backend/app/invitations.py`, `customer.py`, `public.py`, `mailer.py`, `ratelimit.py` |
| Outputs and approvals | `backend/app/outputs.py`, `conflicts.py` (`current_versions`), `backend/migrations/versions/0006_outputs.py` |
| Website import | `backend/app/webfetch.py`, `webimport.py`, `worker.py` (`run_web_once`), `parsing.py` (HTML), `backend/migrations/versions/0007_website_import.py`, `infra/fixture-site/` |
| Hardening and deployment | `backend/app/clientip.py`, `ratelimit.py`, `frontend/next.config.ts`, `compose.prod.yaml`, `infra/caddy/Caddyfile`, `scripts/backup.sh`, `scripts/restore_check.py`, `docs/DEPLOYMENT.md` |
| UI and proxy | `frontend/app/workspace.tsx`, `frontend/app/review.tsx`, `frontend/app/customer.tsx`, `frontend/app/outputs.tsx`, `frontend/app/review/[token]/`, `frontend/app/api.ts`, `frontend/app/styles.css`, `frontend/next.config.ts` (rewrites `/api/auth`, `/api/ai`, `/api/organizations`, `/api/projects`, `/api/public`; privacy headers on `/review/*`) |
| Tests and live checks | `backend/tests/` (shared fixtures in `conftest.py`/`support.py`), `frontend/tests/`, `scripts/smoke.py`, `scripts/m1_e2e.py`, `scripts/m2_e2e.py`, `scripts/m3_e2e.py`, `scripts/m4_e2e.py`, `scripts/m5_e2e.py`, `scripts/restore_check.py` |

## Remaining work

All PRD milestones (M0–M5) are implemented. What is left is *not* new milestone scope; it is the open items a real deployment needs, roughly in priority order:

1. **Independent walkthrough (PRD §17 Definition of Done).** Have someone who did not build it clone the repo, follow the README, and complete the flow end to end (seed, upload, extract with the SIMULATED mock, flag a conflict, send an invitation to Mailpit, answer as a customer, validate, resolve, generate and export, revise, import a website). No one has done this cold yet.
2. **Live AI extraction has never run against a real endpoint**, and quality is unmeasured. Run it with the owner's key on fictional or authorized documents before claiming anything about live quality. The mock extractor silently ignores text it does not recognize.
3. **Project deletion and data lifecycle.** PRD requires admin-only project deletion with a documented lifecycle. It is not implemented because the immutable-history triggers block ordinary deletes; it needs a dedicated, audited purge run by a privileged database role. Also decide retention defaults and customer deletion requests.
4. **Roles.** Any project member can validate confirmations, resolve conflicts, revise and generate outputs; the PRD reserves final readiness sign-off for implementation managers.
5. **Verification gaps in deployment:** `compose.prod.yaml` was validated for configuration only (no real host, certificate or SMTP relay); the object-store restore is documented but not scripted; no scheduled backups; CI does not run `pip-audit`/`npm audit`/bandit (add them).
6. **Product/engineering debts:** `category`/`evidence_status` have no database CHECK (adding them needs care because `requirement_versions` carries immutability triggers that a table rebuild would drop); source authority dates (authored/published/effective) are not captured; flagged candidates cannot gain new evidence and duplicate/merge cannot be undone; no per-user extraction rate limit or provider spend cap; email is synchronous with no retry queue, bounce handling or reminders; bearer links only (no OTP); a high conflict anywhere blocks generation and staff can dismiss a conflict as not-a-conflict; website import does not render JavaScript, read `crawl-delay`, or honor `noindex`.
7. **Licensing and dependencies:** choose an OSI-approved license with the owner; decide on MinIO (archived upstream, built from pinned source in development) before production.

## Open decisions and operational caveats

- Git was initialized on branch `main`, but **there is no initial commit**. All project files currently show as untracked. Establish a reviewed baseline before using diffs or branching; do not accidentally include `.env`, `.local/`, virtual environments, Node modules, or generated files. `.gitignore` excludes them.
- No project license has been selected. Choose an OSI-approved license with the owner before public release; do not silently assign one.
- MinIO and its client are built from pinned official source commits because published image pulls failed. The upstream repository is archived; decide on maintenance or replacement before production deployment. Development Compose credentials are local examples, not production secrets.
- This stack is local development, not production deployment. Production still needs TLS, external secret management, least-privilege storage/database access, backups with restore tests, and deployment-specific privacy controls.
- Live AI extraction quality is unmeasured. Report quality metrics only after an actual live run with the owner's own key and fictional or authorized documents.

## Suggested opening prompt for Claude

> Continue Super Onboard in `C:\Users\amark\projects\super-onboard`. Read `docs/CLAUDE_HANDOVER.md`, `docs/PRD.md`, `README.md`, `docs/M5.md`, `docs/DEPLOYMENT.md`, `docs/THREAT_MODEL.md`, and `docs/VERIFICATION.md` first. M0–M5 are complete and verified locally. Pick up from the "Remaining work" list in the handover, starting with whatever the owner prioritizes (for example the cold-start walkthrough, project deletion with an audited purge, or manager-only sign-off). Preserve project authorization, source provenance, and the rule that no AI or staff-only action approves customer policy, and keep website import SSRF-safe. Verify against SQLite and PostgreSQL and a live fictional flow; document exact results and do not claim anything untested.
