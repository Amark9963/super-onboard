# Super Onboard — Milestone 2

Independent, self-hostable source-backed requirements workspace. M1 provides internal sign-in, scoped projects and contacts, private file/transcript intake, deterministic parsing, and evidence browsing. M2 adds asynchronous candidate extraction, deterministic citation verification, internal requirements review with property scope, and conflict/gap grouping. Extraction defaults to a **SIMULATED** offline mock (not AI); a live provider is opt-in. Nothing in the app approves a rule: staff review only queues candidates for customer confirmation, which arrives in M3. No live Super integration.

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

The private `onboard-private` bucket is initialized without anonymous access. The ingestion worker processes source jobs and updates its heartbeat. Mailpit receives SMTP on port 1025; invitations come in M3. Frontend health checks prove the web process is up, backend readiness checks database migration availability, and worker health checks the heartbeat age.

In the workspace, create an organization and project, add a portfolio or building, upload a PDF/DOCX/XLSX/TXT file or paste a transcript, then open the source's evidence blocks after parsing finishes. You can upload a new version against an existing source. Original files download only through an authenticated, project-scoped API. Scanned PDFs display `needs_attention`; OCR and website fetching are later work.

**Extraction and review (M2).** With a parsed source (or the seeded fictional passages), use *Extract requirements* to queue a job, choose the provider, and watch the worker process it. Candidates appear under *Candidate requirements* beside their source evidence, where the cited quote is highlighted at its verified location. Staff can edit wording, confirm or assign property/portfolio scope, accept for customer review, reject (with a reason), or mark duplicates/merge. *Conflicts & Gaps* groups competing evidence: differences across buildings are listed as allowed variations, overlapping-scope differences as potential conflicts, plus gaps. See [M2 notes](docs/M2.md) for exact semantics and limits.

Optional live extraction: set `AI_API_KEY` (and optionally `AI_BASE_URL`, `AI_MODEL`) in `.env`, then restart the stack. This enables an OpenAI-compatible structured-output provider that sends document segments to that third-party API; staff must acknowledge this on each job. It has only been tested against a stubbed transport, never a real endpoint. Leave `AI_API_KEY` empty to keep only the SIMULATED mock.

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

Tests cover sign-in and logout, CSRF, project isolation across reads and writes, private originals, versioned uploads, deterministic PDF/DOCX/XLSX/TXT and transcript parsing, worker recovery, and the existing foundation constraints. M2 adds the typed schema, citation verification (exact, normalized, invented, wrong-source), extraction jobs with retry/failure/recovery and idempotent re-extraction, the live adapter against a stubbed transport, candidate review semantics and audit, write-once AI proposals, route isolation by project, and conflict/variant/gap grouping. They do not claim live AI extraction quality, customer review, or artifact generation.

With the whole stack running, `python scripts/smoke.py` checks live HTTP endpoints, Mailpit, and denial of anonymous bucket listing. `scripts/m1_e2e.py` and `scripts/m2_e2e.py` drive the real stack with fictional data through the web origin (they need the ignored `.local/demo-login.txt`; the M2 script uses only the SIMULATED mock). `docker compose ps` also reports worker heartbeat health.

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

See [M2 extraction and review notes](docs/M2.md), [M1 architecture and security notes](docs/M1.md), [M0 architecture](docs/ARCHITECTURE.md), and [verification](docs/VERIFICATION.md). The supplied PRD and kickoff instructions are preserved in `docs/`. Project license selection remains pending before public release.
