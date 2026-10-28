# Super Onboard — Milestone 5

Independent, self-hostable source-backed requirements workspace. M1 provides internal sign-in, scoped projects and contacts, private file/transcript intake, deterministic parsing, and evidence browsing. M2 adds asynchronous candidate extraction, deterministic citation verification, internal requirements review with property scope, and conflict/gap grouping. Extraction defaults to a **SIMULATED** offline mock (not AI); a live provider is opt-in. M3 adds customer review: staff compose clarification and confirmation requests, preview exactly what the customer will see, send a private hashed login-free link (email through Mailpit locally, with a copy-link fallback), and receive partial, versioned, idempotent responses in an inbox. A customer's confirmation is recorded only after a staff member validates it. M4 adds a derived approval gate (verified evidence, confirmed scope, validated customer confirmation, resolved conflicts), customer-backed conflict resolution, revisions that keep the approved baseline until the revision is confirmed, versioned Markdown/JSON blueprint and manual test-plan exports built only from approved rules with source references, staleness, document readiness, and a project audit trail. The exports are specifications and manual tests only; nothing configures or runs a live agent. M5 adds a bounded, SSRF-safe website import (public pages become unconfirmed source evidence), per-client rate limiting, security headers, a non-root backend container, dependency and static security audits, and a production deployment guide with tested backup/restore tooling. No live Super integration.

## Start the development stack

Prerequisites: Docker Engine/Desktop running Linux containers and Docker Compose v2; internet access for first-time builds. Run from this directory:

MinIO and its client are built from pinned official source commits in `infra/minio/Dockerfile`, because the published Docker Hub and Quay images rejected pulls during verification. Allow several minutes and adequate Docker memory for the first Go builds. The [upstream MinIO repository](https://github.com/minio/minio) is archived; this development dependency needs a maintenance/replacement decision before production deployment.

```sh
cp .env.example .env
docker compose up --build -d --wait
docker compose exec backend python -m app.seed
docker compose ps
```

Provision an internal account before signing in. From an interactive terminal:

```sh
docker compose exec backend python -m app.manage_user --email you@example.com --role admin
```

Enter a unique password of at least 12 characters at the prompt. The command hashes it and never prints it. To rotate credentials, add `--reset-password`; doing so revokes existing sessions. Additional staff can be provisioned with `--role specialist` or `--role manager`, then an admin can grant project membership in the workspace. Sign in at http://localhost:3000. The fictional seeded user has **no default password** until explicitly provisioned. For automated local setup, set `BOOTSTRAP_PASSWORD` in the command environment rather than passing a password argument. Keep the demo server on loopback.

On PowerShell, use `Copy-Item .env.example .env` for the first command. Existing `.env` files should be preserved. Defaults work locally without paid API keys; extraction uses the SIMULATED mock. First startup applies migrations before starting the API and worker. Seed is explicit and idempotent: fictional Lantern Property Group, Aster House and Birch Court, five synthetic source passages, and no approved requirements.

| Service | Local URL |
|---|---|
| Internal workspace | http://localhost:3000 |
| API liveness / readiness | http://localhost:8000/health/live · http://localhost:8000/health/ready |
| API docs | http://localhost:8000/docs |
| Mailpit inbox | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

The private `onboard-private` bucket is initialized without anonymous access. The ingestion worker processes source jobs and updates its heartbeat. Mailpit receives SMTP on port 1025 and shows the invitation emails. Frontend health checks prove the web process is up, backend readiness checks database migration availability, and worker health checks the heartbeat age.

In the workspace, create an organization and project, add a portfolio or building, upload a PDF/DOCX/XLSX/TXT file or paste a transcript, then open the source's evidence blocks after parsing finishes. You can upload a new version against an existing source. Original files download only through an authenticated, project-scoped API. Scanned PDFs display `needs_attention`; OCR and website fetching are later work.

**Website import (M5).** *Import public web pages* takes a public site address (plus optional approved subdomains and lower page/depth limits), finds pages through robots.txt, the sitemap and same-site links, and lists them with titles and any reason a page was skipped. Choose the pages to import; each becomes a source version with its URL, fetch time, title and content hash, then flows through the normal parse, extraction and review pipeline as **unconfirmed evidence**. The fetcher honors robots.txt and refuses internal, private and metadata addresses, unusual ports, credentials in URLs and redirects out of scope, and it ignores scripts and hidden text. Try it offline with the fictional `fixture-site` demo container (see [deployment guide](docs/DEPLOYMENT.md)). Details and limits: [M5 notes](docs/M5.md).

**Outputs and approvals (M4).** *Approvals, blueprint and test plan* lists each current requirement version with its approval blockers. Resolve a high-severity conflict by recording which confirmed rule applies, backed by a customer's answer to a conflict-linked question. Then generate a blueprint and a test plan: they include only approved rules, list unresolved items as exclusions you must acknowledge, and carry verified source quotes and confirmation provenance. Download Markdown or JSON; each export is audited. Revising a confirmed rule creates a new version that needs fresh customer confirmation, and the approved baseline stays in force until that revision is validated, after which earlier outputs show as stale. See [M4 notes](docs/M4.md).

**Customer review (M3).** Accept verified candidates for customer review, then use *Clarifications & invitations* to pick a contact, the rules to confirm (optionally sharing their verified excerpt) and any questions, create a draft, and read the preview. *Send* issues the link (shown once; only its hash is stored) and emails it; *Create link without email* is the manual fallback. The customer opens `/review/<token>` with no account, saves partial answers, and can come back until the link expires or is revoked. Staff see answers in the response inbox and validate, reject, or acknowledge them; *Revise from correction* creates a new revision that needs fresh confirmation. Mailpit's inbox is at http://localhost:8025. See [M3 notes](docs/M3.md).

**Extraction and review (M2).** With a parsed source (or the seeded fictional passages), use *Extract requirements* to queue a job, choose the provider, and watch the worker process it. Candidates appear under *Candidate requirements* beside their source evidence, where the cited quote is highlighted at its verified location. Staff can edit wording, confirm or assign property/portfolio scope, accept for customer review, reject (with a reason), or mark duplicates/merge. *Conflicts & Gaps* groups competing evidence: differences across buildings are listed as allowed variations, overlapping-scope differences as potential conflicts, plus gaps. See [M2 notes](docs/M2.md) for exact semantics and limits.

**AI-assisted clarifications (M3).** In *Clarifications & invitations*, select an active conflict, gap, or candidate under *Draft a clarification from*, acknowledge external AI processing, and choose *Draft question with AI*. The model sees only bounded rule wording and verified excerpts from that project. Its suggested question is inserted as editable text linked to the selected target. Staff must review the wording, create the normal customer preview, and explicitly send a link; the AI action alone creates no customer request or email. Without `AI_API_KEY`, manual question writing remains available.

Optional live extraction: set `AI_API_KEY` (and optionally `AI_BASE_URL`, `AI_MODEL`) in `.env`, then restart the stack. This enables an OpenAI-compatible structured-output provider that sends document segments to that third-party API; staff must acknowledge this on each job. A live app-to-worker extraction with fictional text was verified on 2026-10-28 using `gpt-6.1-sol`; this is a workflow check, not a broad extraction-quality evaluation. Leave `AI_API_KEY` empty to keep only the SIMULATED mock.

```sh
docker compose logs backend worker
docker compose down
```

Stopping the stack preserves data volumes. Do not add `--volumes` unless you intend to erase all local data.

## Tests and code quality

```sh
docker compose exec backend pytest -q
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .
```

The default backend suite creates temporary SQLite databases and runs real Alembic upgrade/downgrade cycles. To run against PostgreSQL, create a dedicated disposable test database (never point tests at application data):

```sh
docker compose exec postgres createdb -U onboard onboard_test
docker compose exec -e TEST_DATABASE_URL=postgresql+psycopg://onboard:local-only@postgres:5432/onboard_test backend pytest -q
```

Tests cover sign-in and logout, CSRF, project isolation across reads and writes, private originals, versioned uploads, deterministic PDF/DOCX/XLSX/TXT and transcript parsing, worker recovery, and the existing foundation constraints. M5 adds the SSRF/URL/DNS/redirect policy matrix, robots/sitemap/discovery limits, real-socket fetch behavior (size caps, timeouts, redirects, gzip), HTML evidence extraction with hidden text excluded, the full import-to-extraction pipeline, API validation and project isolation, client-address and rate-limit handling, and hardened XML/URL parsing. M4 adds the approval gate and its blockers, customer-backed conflict resolution, baseline-preserving revisions and staleness, sectioned exports with source references, immutable artifact versions, export auditing, readiness states, and route isolation. M3 adds composer/snapshot rules, hashed scoped links, honest email states, expiry/revoke/resend, public-route scope, response validation and idempotency, confirmation validation and freezing, correction revisions, and route isolation. M2 adds the typed schema, citation verification (exact, normalized, invented, wrong-source), extraction jobs with retry/failure/recovery and idempotent re-extraction, the live adapter against a stubbed transport, candidate review semantics and audit, write-once AI proposals, route isolation by project, and conflict/variant/gap grouping. They do not claim live AI extraction quality, customer review, or artifact generation.

With the whole stack running, `python scripts/smoke.py` checks live HTTP endpoints, Mailpit, and denial of anonymous bucket listing. `scripts/m1_e2e.py`, `scripts/m2_e2e.py`, `scripts/m3_e2e.py` and `scripts/m4_e2e.py` (run in that order) and `scripts/m5_e2e.py` (needs the `fixture-site` demo profile) drive the real stack with fictional data through the web origin (they need the ignored `.local/demo-login.txt`; the M2 script uses only the SIMULATED mock; the M3 script also reads the invitation from Mailpit). `docker compose ps` also reports worker heartbeat health.

For frontend checks, install Node 24 and run:

```sh
cd frontend
npm ci
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Run the HTTP smoke test against the running web service: `FRONTEND_URL=http://localhost:3000 npm test` on POSIX, or `$env:FRONTEND_URL='http://localhost:3000'; npm test` in PowerShell. Without that variable the HTTP test reports skipped, not verified.

## Local development without application containers

Use Python 3.12, Node 24, and the Compose infrastructure services:

```sh
docker compose up -d postgres minio storage-init mailpit
python -m venv .venv
# Activate .venv with your shell's activate script.
cd backend
pip install -r requirements.lock
pip install --no-deps -e '.[dev]'
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

In separate terminals run `python -m app.worker` from `backend` and `npm ci && npm run dev` from `frontend`. Default backend settings match local Compose credentials. For changed credentials export `DATABASE_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `APP_ORIGIN` as needed, or place a local `.env` in `backend`; Compose itself reads the root `.env`.

See [M5 website import and hardening notes](docs/M5.md), [deployment guide](docs/DEPLOYMENT.md), [M4 outputs and approvals notes](docs/M4.md), [M3 customer review notes](docs/M3.md), [M2 extraction and review notes](docs/M2.md), [M1 architecture and security notes](docs/M1.md), [M0 architecture](docs/ARCHITECTURE.md), and [verification](docs/VERIFICATION.md). The supplied PRD and kickoff instructions are preserved in `docs/`. Project license selection remains pending before public release.
