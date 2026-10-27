# Codex kickoff instructions — Super Onboard

Read `PRD.md` in full before writing code. Build the product as an independent open-source MVP. Do not connect to Super production systems or invent an integration.

## First task (M0 only)

1. Propose an implementation architecture and directory structure aligned with PRD.
2. Scaffold Next.js/TypeScript frontend and FastAPI/Python backend, PostgreSQL, MinIO, development SMTP sink, and background job worker using Docker Compose.
3. Define migrations and typed models for organizations, projects, project memberships, customer contacts, property scope, sources and source versions, evidence, requirements/versions, review requests/invitations/responses, confirmations, approvals, artifacts, and audit events.
4. Seed one fictional property-management firm with two fictional buildings.
5. Add basic health checks, tests, lint/format config, `.env.example`, and README that allows a fresh developer to start everything.
6. Implement a mock AI provider abstraction that can be replaced by a real structured-output provider later. Mock responses must always be labeled as simulated.
7. Return a concise list of files created, decisions made, tests run, and unresolved blockers; do not claim a feature works unless it has been tested.

## Engineering constraints

- Enforce project isolation in the backend, not only in the UI.
- Treat public review links as sensitive bearer capabilities; hash tokens at rest and scope them per request.
- Preserve source provenance, policy scopes, customer confirmations, staff reviews, and requirement versions as distinct entities.
- Never turn AI-generated policy text into approved rules automatically.
- Website imports must be SSRF-safe; do not build an unconstrained crawler.
- No audio transcription, PMS/agent writes, real voice tests, billing or unapproved customer document publication.
- Ask before making an irreversible architectural choice that materially changes the PRD; otherwise use reasonable defaults and document them.

After M0 is demonstrably complete, proceed to M1 through M5 in `PRD.md`, each as separately testable increments. Do not implement everything at once.
