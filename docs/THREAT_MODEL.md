# M0 threat assumptions

This is a local development scaffold, not an internet-ready deployment. Compose binds published ports to loopback. Its example database/storage credentials are development-only. The API exposes no customer records and the seeded contacts use reserved `example.invalid` addresses.

| Boundary / risk | M0 protection | Required before product exposure |
|---|---|---|
| Cross-project reads and writes | Membership repository guard, composite project foreign keys, rejection tests | M1 authenticated identity on every route, role checks, file access authorization |
| Bearer link leakage | Random secret primitive, hash-only schema, explicit invitation items | M3 expiry/revocation checks, rate limiting, no-referrer, no analytics, redacted access logs, CSRF analysis |
| Policy tampering | Separate proposals, confirmations and staff reviews; immutable history triggers | Transactional approval predicates and fresh confirmation for revisions |
| Duplicate customer answers | Unique invitation/item/submission ID | M3 replay-safe API returning original result |
| Uploaded or fetched hostile content | No ingestion or fetching surface in M0 | M1 size/type limits, private object keys; M5 public-IP validation on all redirects/DNS resolution, bounded fetches, no instruction execution |
| Prompt injection / invented evidence | Mock never approves; no executable AI output | M2 typed extraction and deterministic citation verification |
| Secret / customer-data logging | Health errors contain no database details; synthetic seed only | Structured redaction, token route logging controls, provider payload minimization |
| Historical overwrite | Database triggers on immutable records | M4 transactionally freeze approved baselines, calculate export staleness |

Database credentials are privileged development credentials. Direct database operators can bypass application semantics; M0 does not claim protection against a malicious database owner. Status fields alone never constitute approval. Customer-link actors are unverified capability holders, not verified identities or legal signatures.

No automatic retention/deletion runs. `docker compose down` preserves named volumes. Deleting volumes is destructive and must be deliberate. Future admin project deletion needs a dedicated, audited purge transaction compatible with immutable-history triggers; do not disable those triggers in ordinary application writes. Backups and copies require separate operator retention decisions.

Production requires TLS, secret management, authenticated access, least-privilege DB/storage identities, maintained dependencies, network controls, backups and restore verification. Third-party AI disclosure and provider credentials are future deployment configuration, not enabled by default.

## M2 additions

| Boundary / risk | M2 protection | Remaining |
|---|---|---|
| Prompt injection / invented evidence | Document text is sent as data with a system prompt saying so; output must match a typed schema with no review/confirmation fields; every citation is checked against stored blocks of the extracted source version; failures are flagged and cannot be accepted or drive conflicts; output is never executed | Verification proves a quote exists, not that the statement is faithful or current; staff must read the evidence |
| Third-party AI disclosure | Live provider is off unless the deployer sets `AI_API_KEY`; each live job needs explicit staff acknowledgement; only one source version's blocks plus property/portfolio names are sent | Deployer must disclose processing to customers and vet the provider; no payload redaction beyond minimization |
| Provider secrets and content in logs | Errors reduce to content-free codes; response bodies, document text and the key are never stored in job rows or audit details | Verify deployment log pipelines do not capture request bodies |
| Silent rewriting of the AI proposal | `ai_proposal` is write-once by trigger; edits are audited with before/after and keep evidence | Direct database operators remain trusted |
| Staff review mistaken for approval | Accept means "accepted for customer review"; API reports `approval_status: not_approved`; no route changes customer confirmation | M3/M4 must implement confirmation and the approval transition service |
| Cross-project references via new routes | Every route checks membership and filters by project; duplicate targets, scopes, source versions and conflict ids from another project return 404 | M5 hardening review |
| Runaway or abusive extraction | One active job per source version, bounded attempts, per-job candidate and batch caps, stale-claim recovery | No per-user rate limit or provider spend cap |

## M3 additions

| Boundary / risk | M3 protection | Remaining |
|---|---|---|
| Bearer link leakage | Random 256-bit token, hash-only at rest, shown once; no access logs on the backend; `Referrer-Policy: no-referrer`, `no-store`, `noindex`; no third-party resources on the page; expiry and revocation enforced server-side; resend invalidates the old link | Forwarded or shared links work until expiry/revocation; TLS and proxy log hygiene are the deployer's job |
| Over-sharing | Per-item frozen snapshots chosen by staff; verified excerpts only; the same view renders the preview and the public page; no internal ids or annotations | Staff must review what they choose to share |
| Token guessing / flooding | Unknown tokens share a global DB-backed limiter and an identical 404; per-invitation limit for valid tokens; bounded request bodies and field lengths | No per-IP limit; no CAPTCHA |
| Duplicate or tampered answers | Idempotent `submission_id`, versioned append-only responses, items restricted to the invitation by composite foreign keys, whole-request validation | A link holder can still amend until validation or expiry |
| Staff-only approval of customer policy | A confirmation needs a matching customer `confirm`; validation checks the live wording equals the snapshot the customer saw; confirmed versions are frozen by trigger | M4 must add the approval gate for blueprints |
| Wording changed after sending | Active links lock the candidates; send and validate re-check the snapshot | Direct database edits bypass application checks |
| Email abuse and misreporting | Mail text never contains rule content; subjects sanitized; states say only that SMTP accepted the message | Provider-level SPF/DKIM, bounce handling and reminders are future work |
| Stored XSS via customer text | Responses are plain text rendered by React; JSON API only | Re-check if exports render HTML |

## M4 additions

| Boundary / risk | M4 protection | Remaining |
|---|---|---|
| Staff-only or customer-only approval of policy | `approval_status` is derived on read from stored facts; no approval flag or route exists. A rule needs verified evidence, confirmed scope, a customer `confirm` for the exact wording **and** a staff validation, and no open high conflict | Any project member can validate; the PRD's manager-only sign-off is not enforced |
| Silent rewriting of generated outputs | `artifact_versions` and `artifact_requirements` are append-only (database triggers); regeneration creates a new version | Direct database operators remain trusted |
| Stale outputs presented as current | Staleness compares captured requirement-version ids with the current approved set on every read | A reader of an old downloaded file is not warned |
| Pending revision removing an approved rule | The confirmed baseline stays current until a newer version is itself confirmed and validated | Revisions are manual; no automatic change detection |
| Conflict resolved without the customer | Resolution requires a linked customer answer, a confirmed member rule, and an immutable record with rationale | The mapping from answer to chosen rule is the reviewer's judgement; staff can still dismiss a conflict as not-a-conflict |
| Exports implying a live agent or legal consent | Every export and the readiness note say they are documents only; confirmations are labeled "confirmed via bearer review link; recipient identity not verified" | Downstream users must not treat them as signatures |
| Cross-project output access | All new routes check membership and fetch by `project_id`; outsiders get 404 for readiness, approvals, audit, artifacts, exports, generation, resolution, revisions | M5 hardening review |
| Untracked data egress | Generation and each export download are audited with the actor | Exports contain customer rule text and source quotes; handle downloads accordingly |

## M5 additions

| Boundary / risk | M5 protection | Remaining |
|---|---|---|
| SSRF through website import | Scheme/credential/port/hostname policy; every DNS answer must be public and the connection is pinned to the validated address (no rebinding); each redirect hop re-validated and kept in scope; numeric/hex host spellings and internal names refused; no cookies or credentials sent | The system resolver is trusted; no DNSSEC; the dev-only private-host allowlist must stay empty in production (`compose.prod.yaml` forces it) |
| Hostile or oversized responses | Identity encoding only, byte caps with and without `Content-Length`, per-read and total deadlines, text/HTML only, 5 MB and 25-page limits, one request at a time with a delay | A cooperative-but-large site can still consume its full budget per import |
| Prompt injection via page text | Scripts and hidden text are dropped before blocks exist; page text is data for the model; citations are verified against stored blocks; nothing a page says can set a review or approval state | Visible text can still try to mislead a model; staff review and customer confirmation remain the safeguards |
| Crawler misbehavior | RFC 9309 robots matching with conservative failure handling; identifying user agent; scoped to the entered site (+ approved subdomains) | `crawl-delay` is not read; no per-site rate adaptation |
| Hostile sitemaps | `defusedxml` with DTD/entity/external-entity rejection, 2 MB and 500-URL caps | |
| Public-route and sign-in guessing | Per-client-address limits in addition to per-token/account; client address trusts `X-Forwarded-For` only as many proxies deep as declared | Shared NAT addresses share a budget; counters are in the main database |
| Vulnerable dependencies | `pip-audit` and `npm audit --omit=dev` run clean at the verified state; upgraded `pypdf`, `python-multipart`, `pydantic-settings`; bandit clean at medium+ | Needs recurring scans (CI does not run them yet) |
| Container breakout/escalation | Backend image runs as an unprivileged user; production publishes only Caddy's 80/443 | Frontend image already ran as `node`; no read-only root filesystem or seccomp profile is configured |
| Data loss | `backup.sh` (verified object mirror) and `restore_check.py` (restore into a scratch database, compare revision, row counts, triggers) | Object-store restore is documented, not scripted; no scheduled backups; no project deletion procedure yet |
