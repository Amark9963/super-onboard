# Super Onboard — Product Requirements Document

**Version:** 1.0 (Codex implementation baseline)  
**Date:** 2026-10-27  
**Status:** Approved product direction; proposed implementation, not endorsed by or integrated with Super  
**License:** Open source (license selection pending; see Assumptions)  
**Initial domain:** United States residential property management  
**Deployment:** Independent, self-hostable web app

## 1. Product definition

Super Onboard is a source-backed customer onboarding and agent-implementation requirements workspace. Internal implementation staff collect customer documents, transcripts and public website pages; a document-processing layer parses these sources; an AI extraction layer proposes business requirements with verifiable citations. Internal staff detect conflicts and request clarification from customer stakeholders via secure, login-free email links. Customers answer and explicitly confirm business rules. Staff then review the responses and produce a versioned, human-readable and structured **agent configuration blueprint** and **generated test plan**.

**Value proposition:** turn fragmented property-management operational knowledge into verified, property-scoped, approved and testable AI-agent requirements.

**Invariant:** every approved business rule must have (a) defined scope, (b) provenance, (c) customer confirmation, (d) internal review, and (e) a revision history.

**Boundaries:** This app is not Super's official software, not a PMS, not an agent runtime, not a project-management suite, and not an automated deployment/testing service. No actual Super API integration is required in v1. Screens must not misrepresent a generated blueprint as a live agent configuration.

## 2. Users and authorization

- **Internal admin:** configure workspace, manage staff, assign project access, view audits, delete projects.
- **Implementation specialist:** create and manage assigned customer projects, import sources, review candidates, identify conflicts, create clarification requests, send links, review answers, generate exports.
- **Implementation manager:** same operational access to assigned projects plus final readiness sign-off and review of material policy changes. Does **not** invent/approve customer policies without customer confirmation.
- **Customer reviewer (no account):** access only the precise questions and source excerpts explicitly included in their invitation; answer and comment, propose changes, and confirm selected rules. No access to uploads, unrelated questions or internal dashboard. A bearer link is enough for the MVP; this is **not high-assurance identity verification**.

Internal authentication is required. Project membership is enforced server-side for every internal read/write; customer access is checked server-side via scoped invitation tokens. Tenancy boundaries must never depend only on UI filters.

## 3. Main journeys

### 3.1 Internal onboarding

1. Create organization and customer project; assign project owner and optional go-live target.
2. Define property scope: company-wide, region/portfolio, building/property; unit scope is a future extension. A project can include multiple properties.
3. Upload PDF, DOCX, XLSX or TXT, paste transcript with optional timestamps, or enter a public website URL.
4. Parse and normalize source content, preserving source file, version, text blocks and locators; show parse status and errors.
5. Invoke AI extraction job with a selectable model/provider and an explicit, versioned extraction schema.
6. Review candidate requirements side-by-side with source evidence. Accept for review, edit, reject or mark duplicate. An AI suggestion is **never** automatically approved.
7. Review possible conflict groups. Differences across properties must not automatically be treated as contradictions.
8. Create clarifications and customer confirmation tasks, associate them with relevant requirements and send an invitation.
9. Review customer responses and record customer-confirmed requirements; resolve conflicts or request more information.
10. Generate a blueprint and test plan using only currently approved requirements; show unresolved exclusions/blockers.
11. Confirm artifact currency and hand off exported documents for configuration and manual testing outside this app.

### 3.2 Customer review (no account)

1. Receive email with organization name, request purpose, item count and unique HTTPS link.
2. Open a responsive review page; see ONLY invited questions, proposed rule text and approved-for-sharing evidence snippets.
3. For each item: select an answer, edit suggested wording (where offered), add comment, or indicate they cannot answer.
4. Submit partial answers. Responses persist and synchronize to the internal workspace.
5. Return within link validity to answer remaining questions. All changes preserve revision history.
6. See a confirmation screen with submission timestamp and outstanding items. The user does not see internal approvals or other project sources.

### 3.3 Revision after approval

1. New source or customer clarification suggests a material change to an approved requirement.
2. Create a new **proposed revision**, preserving the approved baseline.
3. Request fresh customer confirmation for the revised rule.
4. Internal reviewer records validation. On completion, the new revision supersedes the old one.
5. Any blueprint/test plan generated from the prior revision is marked **stale** and must be regenerated before it can be marked current.
6. App does NOT claim a live Super agent has been updated.

## 4. MVP features, priority and acceptance criteria

All P0 rows are required for a complete MVP. P1 items are explicitly optional.

| ID | Feature | Priority | Acceptance criteria |
|---|---|---|---|
| F01 | Internal sign-in and project authorization | P0 | Login/logout; permissions checked on APIs; unauthorized projects return no sensitive data. |
| F02 | Organizations, projects and contacts | P0 | Create/edit/list scoped records; contact has role, email, authorization note; no global customer contact exposure. |
| F03 | Company / portfolio / property scope | P0 | Each extracted rule has a scope type and optional scope IDs; company-level and property-level variants coexist; UI shows scope. |
| F04 | File and transcript intake | P0 | PDF/DOCX/XLSX/TXT and text transcripts; private storage, file size/type validation; original maintained; parse errors visible. |
| F05 | Website import | P0 | User-supplied public URL, bounded same-domain discovery, selectable pages, recorded URL/timestamp/content hash; inaccessible pages reported. |
| F06 | Structured parsing | P0 | Persist sections, text blocks, page/section info, XLSX sheet/cell anchors where achievable, transcript timecodes when provided; source version IDs. |
| F07 | AI candidate extraction | P0 | Schema-validated requirements with category, scope, rule, conditions/actions, evidence anchors and review state; asynchronous jobs and retry. |
| F08 | Citation verification | P0 | Validate citation source and anchor; reject/flag unverifiable quotes; never manufacture a page/coordinate; evidence viewer. |
| F09 | Potential conflict/gap identification | P0 | Surface comparable claims differing in substance; same-property overlaps prioritized; cross-property differences labeled as variants unless scope overlaps; no auto-resolution. |
| F10 | Internal requirements review | P0 | Staff edit/reject/merge candidates and preserve AI proposal and original evidence; changes audited. |
| F11 | Clarification composer | P0 | Draft questions linked to relevant requirements; free text/yes-no/single-choice/multiple-choice; select recipient and visible snippets. |
| F12 | Login-free review links | P0 | Scoped unguessable tokens, server-side hashed tokens, configurable expiry, revoke/resend, no other documents or project access. |
| F13 | Email invitations | P0 | Configurable SMTP/provider adapter; send invitation; record attempted/accepted/failed states; copy-link fallback; do not claim inbox delivery without confirmation. |
| F14 | Customer response intake | P0 | Mobile layout, partial submit, comments, cannot-answer option, safe idempotent requests, versioned edits, visible internal inbox. |
| F15 | Customer confirmation + staff validation | P0 | Explicit customer-confirmed state distinct from staff-reviewed state; no staff-only approval of customer policy; unresolved critical items remain blockers. |
| F16 | Blueprint generation | P0 | Human-readable Markdown and JSON exports; includes scope, greeting/FAQ/routing/limits/actions/dependencies when supported by approved data; provenance per section; exclusions listed. |
| F17 | Test plan generation | P0 | Generate cases with scenario, preconditions, expected behavior and requirement links; downloadable Markdown/JSON; **NO execution, pass/fail tracking or simulation**. |
| F18 | Readiness and staleness | P0 | Show unconfirmed requirements, open conflicts, unanswered clarifications, stale exports; status describes readiness of **documents**, not deployed agent. |
| F19 | Audit and revision history | P0 | Who/what/when for customer replies, staff decisions, approvals, document versions and artifact exports. |
| F20 | Demo dataset and fixtures | P0 | Clearly fictional property company, two buildings with differing rules, obsolete and current SOP passages, ambiguous weekend transfer, sample roster and transcript. |
| F21 | Workspace reminders | P1 | Manual resend in P0, automated follow-up reminders later. |
| F22 | Audio transcription | Out | Transcript text only in v1. |
| F23 | Super/PMS API synchronization | Out | No credential connection, agent updates, work order creation or live data sync. |
| F24 | Voice simulation/execution | Out | Test plans only. |
| F25 | Billing, subscriptions, commercial analytics | Out | Open-source noncommercial project initially. |

## 5. Data classification and ingestion design

### 5.1 Source categories

- **Structured:** spreadsheet tables and named columns. Prefer deterministic parsing.
- **Semi-structured:** PDF forms, operating manuals, building rules. Preserve headings, tables and page/row coordinates.
- **Unstructured:** meeting transcripts, narrative policies and email text manually pasted as a source. Apply semantic AI extraction.
- **Dynamic / system-of-record:** active units, on-call rosters, work-order statuses, rental availability. Capture the fact that live lookup is needed; do not turn snapshots into evergreen agent assertions.

### 5.2 Ingestion pipeline

`Upload or fetch → Source version → Format-specific parsing → Normalized blocks + anchors → AI structured extraction → Deterministic citation check → Staff review → Customer confirmation → Blueprint/test plan`

Recommended default parsers: Docling where supported; XLSX-specific parser such as openpyxl for stable sheet/cell coordinates; fallback text extraction for straightforward text/PDF. OCR is not a v1 guarantee; scanned or low-quality documents must be labeled as needing attention.

Persist original, parsed blocks and extracted candidates as **separate** objects. Preserve import errors and never silently drop a source.

### 5.3 Website fetch safeguards

Fetch only publicly accessible HTTP(S) pages under the authorized user-entered domain (or explicitly approved subdomains). Discover sitemap and a bounded number of same-site links; present candidate pages for manual selection. Default suggested limits: 25 pages, depth 2, up to 5 MB per page, short timeouts and concurrency limits (configurable). Enforce robots/site rules as appropriate. Block internal/private/loopback IPs, unsafe schemes, redirect escapes, DNS rebinding, credentials in URLs and unsafe response sizes. Do not run arbitrary page instructions. Preserve URL, fetch timestamp, page title, content hash and normalized text. A fetched page is **unconfirmed evidence**, not an approved rule.

### 5.4 Source authority

No automatic precedence based solely on recency, document format or public vs private origin. Capture authored/published/effective dates when known; mark unknown when not. If conflicting information is found, ask the customer. Do not treat a source's claim of being “official” as authentication of its authority.

## 6. Requirement data contract

Minimum requirement object:

```json
{
  "id": "req_uuid",
  "project_id": "project_uuid",
  "category": "emergency_routing",
  "title": "Weekend emergency transfer",
  "statement": "Transfer weekend flooding emergencies to the approved on-call contact",
  "scope_type": "property",
  "scope_ids": ["property_uuid"],
  "conditions": ["weekend", "active_major_flooding"],
  "proposed_action": "transfer_to_on_call_contact",
  "source_evidence_ids": ["evidence_uuid"],
  "evidence_status": "verified",
  "review_state": "needs_customer_confirmation",
  "customer_confirmation_state": "not_confirmed",
  "staff_review_state": "pending",
  "version": 1,
  "supersedes_version_id": null,
  "effective_date": null
}
```

Treat enum values as a starting point, not a mandate to create one overly broad status column. Customer confirmation and staff review are separate axes; implement an explicit workflow transition service.

**Evidence record:** `source_version_id`, `block_id`, `page_number?`, `section_path?`, `sheet_name?`, `cell_range?`, `timestamp_start?`, `timestamp_end?`, `quoted_text`, `quote_match_state`, `verification_notes?`.

**Important:** “verifiable evidence” means a source location can be checked against the captured representation. It does not establish the rule is current or customer-approved.

## 7. Suggested relational entities

`internal_users`, `organizations`, `projects`, `project_memberships`, `customer_contacts`, `portfolios`, `properties`, `source_documents`, `source_versions`, `source_blocks`, `ingestion_jobs`, `extraction_jobs`, `requirements`, `requirement_versions`, `requirement_evidence`, `conflict_groups`, `conflict_members`, `clarification_questions`, `review_requests`, `review_request_items`, `review_invitations`, `customer_response_versions`, `customer_confirmations`, `staff_reviews`, `blueprint_versions`, `test_plan_versions`, `audit_events`.

Key constraints:

- Every object is bound to a project or to its owning organization through a verified relationship.
- An invitation maps to a specific review request and explicitly listed items; no permissive project-wide link permissions.
- Require immutable versions for confirmed requirements and generated artifacts.
- Prevent duplicate answers on retries via idempotency key or unique client submission ID.
- Audit events record actor type (`internal_user`, `customer_link`, `system`) and reference; a customer-link actor is **not** a verified person.
- Blueprint/test plan versions store the exact approved requirement-version IDs used to generate them, so the application can calculate staleness.

## 8. Requirements, conflicts, and approvals

### 8.1 Candidate categories

Customer goals; company details; office hours; property/portfolio; FAQs; leasing; maintenance; emergencies; staff and transfers; restrictions; spending/approval limits; integrations; operational dependencies; unknowns.

### 8.2 Distinguish variations and contradictions

- **Allowed variation:** Two buildings set different pet policies, and rules are scoped correctly.
- **Potential conflict:** Two statements specify incompatible weekend emergency contacts for the same property and time period.
- **Missing dependency:** “Transfer to the backup manager,” but no backup contact defined.
- **Unverifiable claim:** AI cites a passage that does not exist at its claimed source anchor; mark invalid and do not treat as supported.
- **Outdated dynamic reference:** An on-call roster is older than the review policy; prompt reconfirmation, don't blindly replace.

Each conflict stores related requirement versions, severity, scope intersection, evidence, resolution rationale, and customer question. Classifier judgments are suggestions requiring staff review.

### 8.3 Approval semantics

Customer response types must include **Answer**, **Confirm proposed rule**, **Request correction**, and **Cannot confirm**. An ordinary comment is not approval. A rule becomes **approved for blueprint** only when:

1. Evidence is verified or an explicit customer clarification is recorded;
2. Its relevant scope is specified;
3. Customer explicitly confirms the proposed policy or final corrected wording;
4. An authorized internal reviewer accepts the confirmation;
5. Relevant high-priority conflicts have been resolved.

The MVP does not verify reviewer identity by OTP; the audit must say `confirmed via bearer review link`, not claim legal/electronic-signature-grade identity assurance. **Do not use this workflow as formal legal consent or financial authorization**. For ambiguous recipient authority, staff must resolve it operationally before sharing sensitive questions.

### 8.4 Readiness

States: `intake`, `extracting`, `in_review`, `awaiting_customer`, `drafting_artifacts`, `artifacts_current`, `artifacts_stale`, `blocked`. These indicate document readiness only. Zero high-severity unresolved policy conflicts and confirmed critical requirements are required for `artifacts_current`. Noncritical unknowns may be listed as exclusions with staff acknowledgement.

## 9. Customer invitation and response specification

### Internal composer

Select contact, questions, shareable evidence snippets, expiration (default 7 days), custom message. Preview exact customer-visible payload. Generate cryptographically secure token; store hash only. Email a link such as `https://app.example/review/<opaque-token>` using configured SMTP/provider. Allow copying link. Persist attempted/sent/error provider statuses.

### Customer page

Show branding, request name and due date, total questions, a card for each question, permitted source excerpt only, free text/choices, optional comment, save/submit button, confirmation and remaining work. Supports partial submission and subsequent amendments until link expires or is revoked. Protect against XSS, CSRF where applicable, guessing, flooding and broken object-level authorization. Set `Referrer-Policy: no-referrer`; avoid third-party analytics on token pages. Never expose private files or internal annotations.

### Internal response inbox

Show recipient label (not verified identity), request, response text, comments, received time, linked requirement, changes from prior answer, and next action. A response prompts staff review; it must not modify the approved baseline automatically.

### Link lifecycle

`draft → active → expired/revoked`. Resending can generate a fresh link while explicitly invalidating an old one. Invitations must only expose the subset of questions selected at send time. A client can report a compromised link; staff revokes it.

## 10. Agent blueprint and test plan

### Blueprint v1

Generate Markdown and JSON containing:

- Customer and property scope;
- Agent objectives and permitted use cases;
- Approved company and property-level FAQs;
- Business hours and after-hours logic, if confirmed;
- Maintenance classifications, escalation contacts/roles and fallback, if confirmed;
- Transfer instructions where supported by evidence;
- Restricted actions and must-escalate cases;
- PMS/API dependencies and fields marked `requires_live_system_lookup` where appropriate;
- Requirement-version references per section;
- Explicit unresolved issues, exclusions, and manual configuration caveats.

This is a **human-facing Super-ready specification**, not a guaranteed Super API payload. No automatic provisioning, credential setup or deployment.

### Test plan v1

Generate Markdown and JSON, with test ID, name, linked approved requirement versions, applicable properties, caller scenario, preconditions, example inputs, expected behavior, expected escalation/fallback and manual verification guidance. Include at least normal, negative, boundary, and unresolved-dependency coverage for critical paths. **No executing tests; no pass/fail history; no simulation.**

If an approved rule changes, both artifact families deriving from it become stale. Regeneration produces new immutable versions.

## 11. Security, privacy and open-source deployment

- Internal sessions with secure cookies and CSRF protection as appropriate.
- Authorization for all backend routes, file fetches and object reads; least-privilege permissions.
- Customer token secrets generated with secure randomness, hashed at rest, time limited, scoped to exact questions, rate limited and revocable.
- Storage private by default, signed/time-limited object access only when authorized.
- Model requests contain only necessary document segments; explicitly disclose third-party AI processing in configuration and onboarding UI; deployers control providers and keys.
- No customer data in the source code repository, build fixtures or screenshots. Demo fixtures MUST be fictional or appropriately authorized.
- Never include private user data, bearer links, API keys or document contents in routine error logs.
- Store full change audit for active projects; project deletion restricted to admin, with documented deletion/backup lifecycle.
- MVP supports manual project deletion; retention period is deployment-configurable, with default **no automatic deletion until an administrator initiates it**. Operational/privacy suitability is the responsibility of each deployer.
- Open source means *code* is public, not uploaded documents or customer responses.
- No guarantee of regulatory compliance or legally binding signatures in MVP.

## 12. Technical implementation recommendation

- **Frontend:** Next.js + TypeScript; responsive internal dashboard and no-login external review pages.
- **Backend:** Python FastAPI for parsing, AI orchestration and authorization, or equivalent clearly separated service.
- **Database:** PostgreSQL; schema migrations and indexed project/scope relationships.
- **File storage:** S3-compatible private object storage (MinIO in development).
- **Parsers:** Docling for structured parsing where applicable; openpyxl for XLSX evidence anchors; clean text/transcript import; format fallbacks and explicit unsupported status.
- **AI:** provider abstraction with OpenAI-style structured output initially, plus pluggable local/mock provider. Parse output against typed schema; never use free-form LLM text as executable instructions.
- **Workers:** asynchronous ingestion/extraction queue with retries, job statuses and timeout boundaries.
- **Website import:** defensive server-side public HTTP(S) fetcher; URL/page selection, SSRF protection, content snapshots.
- **Email:** development sink (Mailpit or equivalent) and configurable production SMTP adapter; use transactional provider later as needed.
- **Developer experience:** Docker Compose for Postgres/MinIO/mail sink/backend/frontend/worker, `.env.example`, seed script, tests, README, license once chosen.
- **No vector database initially.** Structured section-level extraction and targeted cross-source comparisons are adequate to evaluate MVP feasibility.

Build an offline **mock AI adapter** returning clearly labeled deterministic fixture results. It must allow the complete E2E UI test without paid credentials; it must NOT be represented as real AI extraction. Live AI requires the deployer to configure a compatible model API key.

## 13. API contracts (proposed, not Super API)

Internal endpoints, all authorized, might include:

- `POST /api/projects`; `GET /api/projects/:id`
- `POST /api/projects/:id/sources/upload`
- `POST /api/projects/:id/sources/web-discover`; `POST /api/projects/:id/sources/web-import`
- `POST /api/projects/:id/extraction-jobs`; `GET /api/jobs/:id`
- `GET /api/projects/:id/requirements`; `POST /api/requirements/:id/revisions`
- `GET /api/projects/:id/conflicts`; `POST /api/conflicts/:id/resolve`
- `POST /api/projects/:id/review-requests`; `POST /api/review-requests/:id/send`
- `GET /api/projects/:id/responses`; `POST /api/requirement-versions/:id/staff-review`
- `POST /api/projects/:id/blueprints/generate`; `POST /api/projects/:id/test-plans/generate`

Customer routes use token-only scope, not project IDs for untrusted access:

- `GET /api/public/review/:token`
- `POST /api/public/review/:token/responses`

Exact path names can evolve; authorization constraints cannot.

## 14. Key screens

1. **Projects Dashboard** — onboarding projects, owner, stage, blockers, unanswered clarifications.
2. **Project Overview** — organization, goals, scoped properties, readiness summary, actions.
3. **Sources** — upload, transcript paste, website URL discovery/import, processing states, evidence inspection.
4. **Requirements** — review list, category/scope/status filters, source-side panel, edit and candidate disposition.
5. **Conflicts & Gaps** — grouped competing evidence, severity, property scope, ask-customer action.
6. **Clarifications & Invitations** — question authoring, recipient selection, preview/send/revoke and response inbox.
7. **Customer Review (public link)** — focused no-account mobile-friendly questions and comments.
8. **Approvals & Revisions** — customer confirmations, staff validations, version diffs and audit.
9. **Blueprint / Test Plan** — render, warnings, provenance, export, staleness label.
10. **Settings** — model config (server-side secret), SMTP, staff and data deletion.

## 15. Validation plan and fixtures

Build a fictional sample company with two buildings:

- Building A: pets permitted under restrictions; emergencies route to on-call maintenance supervisor.
- Building B: different pet restrictions; weekend calls initially described inconsistently across old SOP and transcript.
- Contact roster: includes primary/backup and deliberate missing phone number.
- Website snapshot: public hours and FAQ, with a deliberately stale maintenance snippet.

Assertions:

1. Same-company rules with distinct building scope are **not** necessarily conflicts.
2. Incompatible overlapping emergency routes **are** flagged as potential conflicts.
3. Invented source quotes are rejected or visibly flagged.
4. An unconfirmed customer rule cannot enter an approved blueprint as fact.
5. Customer token only reveals explicitly shared question/excerpt content.
6. Partial customer submissions are preserved and retries do not duplicate answers.
7. Approved rule revision invalidates previous blueprint and test plan.
8. Exports contain approved requirement IDs/versions and unresolved exclusion list.
9. Live source extraction quality metrics are reported only after an actual live LLM run; mock outputs must be visibly labeled.

## 16. Milestones and Codex build order

**M0 — Repository foundation:** scaffold app, docker compose, local env, schemas, migrations, test runner, lint/format, seed data; write architecture and threat assumptions. Demonstrate startup.

**M1 — Project and sources:** auth, membership isolation, projects/property hierarchy, private upload, transcript intake, deterministic parsing with evidence anchors, source browser.

**M2 — Extraction and review:** provider interface, mock and live AI adapters, typed output, asynchronous jobs, citation verification, requirements review and property scope assignment, conflict grouping.

**M3 — Customer review:** clarification questions, preview, link tokens, SMTP dev delivery, public page, partial response submission, internal inbox, confirmation workflow.

**M4 — Outputs and versioning:** customer-confirmed/staff-reviewed requirements, blueprint generator, test-plan generator, Markdown/JSON exports, staleness, audit, readiness.

**M5 — Website import and hardening:** bounded defensive crawler, URL selection, source snapshots, integration tests, security checks, documentation and deployable setup.

**Note:** Website ingestion is P0 for the *complete MVP*, but scheduled later than the core review loop for efficient incremental delivery. Each milestone should be independently runnable with tests and sample data.

## 17. Definition of done

An independent reviewer can clone the repository, follow README instructions, start local services, seed a fictional company, upload sample SOP/transcript/roster, parse and view evidence, run **mock-labeled** extraction (or optional real LLM extraction using their own key), flag a deliberately conflicting property rule, send an invitation into the local email sink, follow its link without logging in, answer and confirm a rule, review it internally, and export a blueprint plus test plan containing the correct approved revision and traceable source references. An approved revision marks earlier artifacts stale. Website discovery/import works against safely configured publicly accessible test sources. Authorization and key workflow tests pass.

## 18. Explicit assumptions, residual decisions and non-goals

- The name **Super Onboard** is provisional; no affiliation implied.
- Choose an OSI-approved license before public release (MIT or Apache-2.0 are plausible; Apache-2.0 includes explicit patent provisions). Not silently defaulted.
- A customer reviewer is identified in the UI by **intended recipient**, but possession of an unverified review link is not legal evidence they are that person. No OTP for this MVP per product direction.
- A staff user cannot authoritatively decide an ambiguous customer business rule; obtain customer clarification. Staff is responsible for reviewing evidence and representing confirmed decisions accurately.
- This is **open source**, not necessarily restricted to noncommercial use by downstream licensees. If the project owner wants OSI compliance, a noncommercial-use restriction is incompatible.
- No public customer PDFs are embedded in the repo without verifying redistribution rights. Benchmark fixtures should be synthetic and labeled.
- No ownership or integration into Super's internal systems is asserted. Use a generic “Implementation team” label in deployed UI where Super branding rights are not granted.
- Future: platform adapters, PMS integrations, real-time dynamic data, simulation, test execution, approved deployment actions, scheduled refresh and verified sign-off.

