"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api";

export type ScopeOption = {
  id: string;
  name: string;
  portfolio_id?: string | null;
};
export type SourceLite = {
  id: string;
  name: string;
  versions: {
    id: string;
    version: number;
    filename: string;
    parse_status: string;
  }[];
};

type Provider = {
  id: string;
  label: string;
  simulated: boolean;
  external_processing: boolean;
  model: string | null;
};
type Job = {
  id: string;
  source_name: string | null;
  provider: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  summary: {
    created: number;
    skipped_duplicates: number;
    flagged: number;
    simulated: boolean;
  } | null;
};
type Candidate = {
  id: string;
  title: string;
  category: string;
  topic: string | null;
  statement: string;
  scope: {
    type: string;
    property_id: string | null;
    portfolio_id: string | null;
    name: string | null;
    confirmed_by_staff: boolean;
  };
  conditions: string[];
  proposed_action: string | null;
  requires_live_lookup: boolean;
  missing_information: string[];
  evidence_status: string;
  staff_review_state: string;
  review_state: string;
  review_label: string;
  customer_confirmation_state: string;
  duplicate_of: string | null;
  simulated: boolean | null;
  provider: string | null;
};
type Evidence = {
  id: string;
  quoted_text: string;
  quote_match_state: string;
  verification_notes: string | null;
  char_start: number | null;
  char_end: number | null;
  block: { id: string; text: string; locator: Record<string, unknown> };
  source: { document: string; version: number };
};
type Detail = Candidate & {
  ai_proposal: Record<string, unknown> | null;
  citation_report: {
    block_id: string;
    claimed_quote: string;
    state: string;
    notes: string | null;
  }[];
  evidence: Evidence[];
  reviews: {
    id: string;
    decision: string;
    rationale: string;
    reviewer: string;
  }[];
  audit: {
    action: string;
    actor: string;
    created_at: string;
    detail: Record<string, unknown> | null;
  }[];
};
type Group = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  triage_state: string;
  triage_rationale: string | null;
  scope_intersection: { explanation?: string };
  members: Candidate[];
};
type List = {
  total: number;
  counts: Record<string, number>;
  items: Candidate[];
};

const STATES = [
  ["pending", "Awaiting review"],
  ["accepted", "Accepted for customer review"],
  ["rejected", "Rejected"],
  ["duplicate", "Duplicates / merged"],
  ["all", "All"],
] as const;
const CATEGORIES = [
  "customer_goals",
  "company_details",
  "office_hours",
  "property_portfolio",
  "faqs",
  "leasing",
  "maintenance",
  "emergencies",
  "staff_transfers",
  "restrictions",
  "spending_limits",
  "integrations",
  "operational_dependencies",
  "unknowns",
];
const words = (value: string) => value.replaceAll("_", " ");

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function Highlight({ evidence }: { evidence: Evidence }) {
  const chars = Array.from(evidence.block.text);
  const { char_start: start, char_end: end } = evidence;
  if (start === null || end === null) return <p>{evidence.block.text}</p>;
  return (
    <p>
      {chars.slice(0, start).join("")}
      <mark>{chars.slice(start, end).join("")}</mark>
      {chars.slice(end).join("")}
    </p>
  );
}

function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

function Extraction(props: {
  projectId: string;
  csrf: string;
  sources: SourceLite[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, sources, onChanged, onError } = props;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [version, setVersion] = useState("");
  const [provider, setProvider] = useState("mock");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const wasActive = useRef(false);
  const chosen = providers.find((p) => p.id === provider);
  const eligible = sources.flatMap((s) =>
    s.versions
      .filter((v) => ["parsed", "fixture"].includes(v.parse_status))
      .map((v) => ({ id: v.id, label: `${s.name} · v${v.version}` })),
  );

  useEffect(() => {
    api<Provider[]>("/ai/providers")
      .then(setProviders)
      .catch((reason) => onError(message(reason)));
  }, [onError]);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<Job[]>(`/projects/${projectId}/extraction-jobs`)
        .then((list) => {
          if (!live) return;
          const active = list.some((j) =>
            ["pending", "running"].includes(j.status),
          );
          if (wasActive.current && !active) onChanged();
          wasActive.current = active;
          setJobs(list);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId, onChanged]);

  async function queue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(
        `/projects/${projectId}/extraction-jobs`,
        {
          method: "POST",
          body: JSON.stringify({
            source_version_id: version,
            provider,
            acknowledge_external_processing: acknowledged,
          }),
        },
        csrf,
      );
      wasActive.current = true;
      setJobs(await api<Job[]>(`/projects/${projectId}/extraction-jobs`));
    } catch (reason) {
      onError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function retry(job: Job) {
    try {
      await api(
        `/projects/${projectId}/extraction-jobs/${job.id}/retry`,
        {
          method: "POST",
          body: JSON.stringify({
            acknowledge_external_processing: acknowledged,
          }),
        },
        csrf,
      );
      wasActive.current = true;
      setJobs(await api<Job[]>(`/projects/${projectId}/extraction-jobs`));
    } catch (reason) {
      onError(message(reason));
    }
  }

  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">CANDIDATE EXTRACTION</p>
          <h2>Extract requirements</h2>
        </div>
        <span className="pill">{jobs.length} jobs</span>
      </div>
      <p className="subtle">
        Extraction only proposes candidates. Nothing it produces is approved,
        and every citation is checked against the stored source text.
      </p>
      <form onSubmit={queue}>
        <label>
          Parsed source version
          <select
            required
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">Select a source</option>
            {eligible.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.simulated ? "SIMULATED · " : ""}
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {chosen?.simulated && (
          <p className="notice simulated">
            SIMULATED: deterministic keyword rules over the text, not an AI
            model. Results say nothing about real extraction quality.
          </p>
        )}
        {chosen?.external_processing && (
          <label className="check">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I understand document segments are sent to a third-party AI API (
            {chosen.model}).
          </label>
        )}
        <button disabled={busy || !version}>Queue extraction</button>
      </form>
      {jobs.length > 0 && (
        <div className="source-list">
          {jobs.slice(0, 8).map((job) => (
            <div className="version-row" key={job.id}>
              <strong>{job.source_name || "Source"}</strong>
              <span className={`status ${job.status}`}>{job.status}</span>
              <small>
                {job.provider}
                {job.summary?.simulated ? " (SIMULATED)" : ""} · attempt{" "}
                {job.attempts}/{job.max_attempts}
              </small>
              {job.summary && (
                <small>
                  {job.summary.created} new · {job.summary.skipped_duplicates}{" "}
                  already known · {job.summary.flagged} flagged
                </small>
              )}
              {job.error_code && (
                <span className="error-code">{words(job.error_code)}</span>
              )}
              {job.status === "failed" && (
                <button className="text-button" onClick={() => retry(job)}>
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CandidateDetail(props: {
  projectId: string;
  csrf: string;
  id: string;
  refresh: number;
  properties: ScopeOption[];
  portfolios: ScopeOption[];
  targets: Candidate[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, id, refresh, properties, portfolios, targets } =
    props;
  const { onChanged, onError } = props;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "",
    statement: "",
    topic: "",
    conditions: "",
    action: "",
    scope: "company",
  });
  const [confirmScope, setConfirmScope] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/requirements/${id}`;

  useEffect(() => {
    let live = true;
    api<Detail>(base)
      .then((data) => live && setDetail(data))
      .catch((reason) => onError(message(reason)));
    return () => {
      live = false;
    };
  }, [base, refresh, onError]);

  async function mutate(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
      setEditing(false);
      setReason("");
      setConfirmScope(false);
      onChanged();
    } catch (reason) {
      onError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const send = (action: string, body: object) =>
    api(
      `${base}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
      csrf,
    );

  if (!detail || detail.id !== id)
    return <div className="detail-panel subtle">Loading candidate…</div>;

  const missingFromEvidence = detail.citation_report.filter(
    (r) => !detail.evidence.some((e) => e.block.id === r.block_id),
  );
  const final = ["duplicate", "merged"].includes(detail.review_state);

  function startEdit() {
    if (!detail) return;
    setForm({
      title: detail.title,
      category: detail.category,
      statement: detail.statement,
      topic: detail.topic || "",
      conditions: detail.conditions.join(", "),
      action: detail.proposed_action || "",
      scope:
        detail.scope.type === "company"
          ? "company"
          : `${detail.scope.type}:${detail.scope.property_id || detail.scope.portfolio_id}`,
    });
    setEditing(true);
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    const [scopeType, scopeId] = form.scope.split(":");
    void mutate(() =>
      api(
        base,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: form.title,
            category: form.category,
            statement: form.statement,
            topic: form.topic,
            conditions: form.conditions
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            proposed_action: form.action || null,
            scope_type: scopeType,
            property_id: scopeType === "property" ? scopeId : null,
            portfolio_id: scopeType === "portfolio" ? scopeId : null,
          }),
        },
        csrf,
      ),
    );
  }

  return (
    <div className="detail-panel">
      <div className="badges">
        {detail.simulated && <Badge kind="simulated">SIMULATED</Badge>}
        <Badge kind={detail.evidence_status}>
          Evidence {detail.evidence_status}
        </Badge>
        <Badge kind="warn">Not approved</Badge>
        <Badge kind="plain">{detail.review_label}</Badge>
        <Badge kind="plain">
          Customer: {words(detail.customer_confirmation_state)}
        </Badge>
      </div>
      <h3>{detail.title}</h3>
      <p className="statement">{detail.statement}</p>
      <dl className="facts">
        <dt>Category</dt>
        <dd>{words(detail.category)}</dd>
        <dt>Topic</dt>
        <dd>{detail.topic ? words(detail.topic) : "—"}</dd>
        <dt>Scope</dt>
        <dd>
          {detail.scope.name} ({detail.scope.type}){" "}
          {!detail.scope.confirmed_by_staff && (
            <Badge kind="warn">Scope not yet confirmed by staff</Badge>
          )}
        </dd>
        <dt>Conditions</dt>
        <dd>
          {detail.conditions.length
            ? detail.conditions.map(words).join(", ")
            : "—"}
        </dd>
        <dt>Proposed action</dt>
        <dd>{detail.proposed_action ? words(detail.proposed_action) : "—"}</dd>
        {detail.requires_live_lookup && (
          <>
            <dt>Dependency</dt>
            <dd>
              Requires live system lookup; a snapshot is not an evergreen fact.
            </dd>
          </>
        )}
        {detail.missing_information.length > 0 && (
          <>
            <dt>Missing information</dt>
            <dd>{detail.missing_information.join("; ")}</dd>
          </>
        )}
      </dl>

      <h3>Evidence</h3>
      <p className="subtle">
        &ldquo;Verified&rdquo; means the quote exists at the cited location in
        the captured source. It does not mean the rule is current, correct, or
        confirmed by the customer.
      </p>
      {detail.evidence.map((e) => (
        <article
          className={`block evidence-item ${e.quote_match_state}`}
          key={e.id}
        >
          <div className="locator">
            {e.source.document} · v{e.source.version} ·{" "}
            {Object.entries(e.block.locator)
              .filter(([k]) => k !== "synthetic")
              .map(
                ([k, v]) =>
                  `${words(k)}: ${Array.isArray(v) ? v.join(" / ") : String(v)}`,
              )
              .join(" · ")}{" "}
            <Badge
              kind={
                e.quote_match_state === "invalid" ? "unverifiable" : "verified"
              }
            >
              {e.quote_match_state === "invalid"
                ? "quote not found"
                : `${e.quote_match_state} match`}
            </Badge>
          </div>
          {e.quote_match_state === "invalid" ? (
            <p>
              <del>{e.quoted_text}</del> — claimed by the model but not present
              in this block.
            </p>
          ) : (
            <Highlight evidence={e} />
          )}
          {e.verification_notes && (
            <small className="subtle">{e.verification_notes}</small>
          )}
        </article>
      ))}
      {missingFromEvidence
        .filter((r) => r.state === "invalid")
        .map((r, index) => (
          <article className="block evidence-item invalid" key={index}>
            <div className="locator">
              <Badge kind="unverifiable">unverifiable citation</Badge>
            </div>
            <p>
              <del>{r.claimed_quote}</del>
            </p>
            <small className="subtle">
              {r.notes ? words(r.notes) : "Citation could not be anchored"}. No
              location was recorded.
            </small>
          </article>
        ))}

      <h3>Review</h3>
      {final ? (
        <p className="subtle">
          This candidate was{" "}
          {detail.review_state === "merged"
            ? "merged into"
            : "marked a duplicate of"}{" "}
          another candidate. That decision is final.
        </p>
      ) : (
        <div className="actions">
          {detail.staff_review_state === "pending" && (
            <div className="action-row">
              {!detail.scope.confirmed_by_staff && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={confirmScope}
                    onChange={(e) => setConfirmScope(e.target.checked)}
                  />
                  The scope shown is correct
                </label>
              )}
              <button
                disabled={
                  busy ||
                  detail.evidence_status !== "verified" ||
                  (!detail.scope.confirmed_by_staff && !confirmScope)
                }
                onClick={() =>
                  mutate(() => send("accept", { confirm_scope: confirmScope }))
                }
              >
                Accept for customer review
              </button>
              {detail.evidence_status !== "verified" && (
                <small className="subtle">
                  Evidence must be fully verified before acceptance.
                </small>
              )}
            </div>
          )}
          {detail.staff_review_state !== "pending" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => mutate(() => send("reopen", { reason }))}
            >
              Return to awaiting review
            </button>
          )}
          {detail.staff_review_state !== "rejected" && (
            <div className="action-row">
              <input
                aria-label="Reason for rejecting"
                placeholder="Reason for rejecting (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="danger"
                disabled={busy || !reason.trim()}
                onClick={() => mutate(() => send("reject", { reason }))}
              >
                Reject
              </button>
            </div>
          )}
          {detail.staff_review_state !== "rejected" && (
            <>
              <div className="action-row">
                <select
                  aria-label="Other candidate"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Fold into another candidate…</option>
                  {targets
                    .filter((t) => t.id !== id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.scope.name}
                      </option>
                    ))}
                </select>
                <button
                  className="secondary"
                  disabled={busy || !target}
                  onClick={() =>
                    mutate(() => send("duplicate", { canonical_id: target }))
                  }
                >
                  Mark duplicate
                </button>
                <button
                  className="secondary"
                  disabled={busy || !target}
                  onClick={() =>
                    mutate(() => send("merge", { canonical_id: target }))
                  }
                >
                  Merge evidence
                </button>
              </div>
              <small className="subtle">
                Duplicate and merge decisions are final. Merging needs identical
                scope.
              </small>
            </>
          )}
          {detail.staff_review_state !== "rejected" && !editing && (
            <button className="secondary" onClick={startEdit}>
              Edit wording or scope
            </button>
          )}
        </div>
      )}
      {editing && (
        <form className="edit-form" onSubmit={saveEdit}>
          <label>
            Title
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Statement
            <textarea
              required
              rows={3}
              value={form.statement}
              onChange={(e) => setForm({ ...form, statement: e.target.value })}
            />
          </label>
          <div className="grid-two tight">
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {words(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Topic
              <input
                required
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              />
            </label>
            <label>
              Conditions (comma separated)
              <input
                value={form.conditions}
                onChange={(e) =>
                  setForm({ ...form, conditions: e.target.value })
                }
              />
            </label>
            <label>
              Proposed action
              <input
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
              />
            </label>
          </div>
          <label>
            Scope (saving confirms it)
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
            >
              <option value="company">Company-wide</option>
              {portfolios.map((p) => (
                <option key={p.id} value={`portfolio:${p.id}`}>
                  Portfolio · {p.name}
                </option>
              ))}
              {properties.map((p) => (
                <option key={p.id} value={`property:${p.id}`}>
                  Building · {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="subtle">
            Editing keeps the original AI proposal and returns an accepted
            candidate to review.
          </p>
          <div className="action-row">
            <button disabled={busy}>Save changes</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <h3>History</h3>
      <ul className="history">
        {detail.audit.map((event, index) => (
          <li key={index}>
            <strong>{event.action}</strong> · {event.actor}{" "}
            <small>{new Date(event.created_at).toLocaleString()}</small>
            {event.action === "candidate.edited" && event.detail && (
              <small>
                {" "}
                changed:{" "}
                {Object.keys((event.detail.changes as object) || {}).join(
                  ", ",
                ) || "scope confirmed"}
              </small>
            )}
          </li>
        ))}
        {detail.reviews.map((r) => (
          <li key={r.id}>
            {words(r.decision)} · {r.reviewer}
            {r.rationale ? ` — ${r.rationale}` : ""}
          </li>
        ))}
      </ul>
      <details>
        <summary>Original AI proposal (never edited)</summary>
        <pre>{JSON.stringify(detail.ai_proposal, null, 2)}</pre>
      </details>
    </div>
  );
}

function Requirements(props: {
  projectId: string;
  csrf: string;
  refresh: number;
  properties: ScopeOption[];
  portfolios: ScopeOption[];
  selected: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, refresh, properties, portfolios, selected } = props;
  const { onSelect, onChanged, onError } = props;
  const [state, setState] = useState<string>("pending");
  const [list, setList] = useState<List | null>(null);
  const [targets, setTargets] = useState<Candidate[]>([]);

  useEffect(() => {
    let live = true;
    const filter = state === "all" ? "" : `&state=${state}`;
    Promise.all([
      api<List>(`/projects/${projectId}/requirements?limit=200${filter}`),
      api<List>(`/projects/${projectId}/requirements?limit=200`),
    ])
      .then(([filtered, everything]) => {
        if (!live) return;
        setList(filtered);
        setTargets(
          everything.items.filter((c) =>
            ["pending", "accepted"].includes(c.review_state),
          ),
        );
      })
      .catch((reason) => onError(message(reason)));
    return () => {
      live = false;
    };
  }, [projectId, state, refresh, onError]);

  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">INTERNAL REVIEW</p>
          <h2>Candidate requirements</h2>
        </div>
        <span className="pill">
          {list?.counts.flagged ?? 0} with flagged evidence
        </span>
      </div>
      <p className="subtle">
        Accepting a candidate only queues it for customer confirmation in a
        later milestone. Staff review never approves a rule.
      </p>
      <div className="tabs" role="tablist">
        {STATES.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={state === id}
            className={state === id ? "active" : ""}
            onClick={() => setState(id)}
          >
            {label}
            {id !== "all" && list ? ` (${list.counts[id] ?? 0})` : ""}
          </button>
        ))}
      </div>
      <div className="review-grid">
        <div className="candidate-list">
          {list?.items.length === 0 && (
            <p className="subtle">
              No candidates here. Queue an extraction from a parsed source
              above.
            </p>
          )}
          {list?.items.map((c) => (
            <button
              key={c.id}
              className={`candidate ${selected === c.id ? "active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <strong>{c.title}</strong>
              <span>{c.statement}</span>
              <span className="badges">
                {c.simulated && <Badge kind="simulated">SIMULATED</Badge>}
                <Badge kind={c.evidence_status}>{c.evidence_status}</Badge>
                <Badge kind="plain">{c.scope.name}</Badge>
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <CandidateDetail
            projectId={projectId}
            csrf={csrf}
            id={selected}
            refresh={refresh}
            properties={properties}
            portfolios={portfolios}
            targets={targets}
            onChanged={onChanged}
            onError={onError}
          />
        ) : (
          <div className="detail-panel subtle">
            Select a candidate to compare it with its source evidence.
          </div>
        )}
      </div>
    </section>
  );
}

function Conflicts(props: {
  projectId: string;
  csrf: string;
  refresh: number;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, refresh, onSelect, onChanged, onError } = props;
  const [kind, setKind] = useState("conflict");
  const [triage, setTriage] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const query = [kind && `kind=${kind}`, triage && `triage_state=${triage}`]
      .filter(Boolean)
      .join("&");
    api<Group[]>(`/projects/${projectId}/conflicts?${query}`)
      .then((data) => live && setGroups(data))
      .catch((reason) => onError(message(reason)));
    return () => {
      live = false;
    };
  }, [projectId, kind, triage, refresh, onError]);

  async function classify(group: Group, state: string) {
    try {
      await api(
        `/projects/${projectId}/conflicts/${group.id}/triage`,
        {
          method: "POST",
          body: JSON.stringify({ state, rationale: notes[group.id] || "" }),
        },
        csrf,
      );
      onChanged();
    } catch (reason) {
      onError(message(reason));
    }
  }

  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">CONFLICTS &amp; GAPS</p>
          <h2>Grouped competing evidence</h2>
        </div>
        <span className="pill">{groups.length} shown</span>
      </div>
      <p className="subtle">
        These are automatic suggestions. Different buildings are allowed
        variations unless their scopes overlap. Nothing is resolved here;
        contradictions need customer clarification.
      </p>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {[
            ["conflict", "Potential conflicts"],
            ["variant", "Allowed variations"],
            ["gap", "Gaps"],
            ["", "All"],
          ].map(([id, label]) => (
            <button
              key={label}
              role="tab"
              aria-selected={kind === id}
              className={kind === id ? "active" : ""}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="inline">
          Staff triage
          <select value={triage} onChange={(e) => setTriage(e.target.value)}>
            <option value="">Current</option>
            <option value="open">Open</option>
            <option value="confirmed">Confirmed conflict</option>
            <option value="dismissed">Dismissed</option>
            <option value="obsolete">Out of date</option>
          </select>
        </label>
      </div>
      {groups.length === 0 && (
        <p className="subtle">Nothing to show for this filter.</p>
      )}
      {groups.map((g) => (
        <article className={`group-card ${g.severity}`} key={g.id}>
          <div className="badges">
            <Badge kind={`sev-${g.severity}`}>{g.severity}</Badge>
            <Badge kind="plain">
              {g.kind === "variant" ? "allowed variation" : g.kind}
            </Badge>
            <Badge kind="plain">triage: {g.triage_state}</Badge>
          </div>
          <h3>{g.title}</h3>
          <p className="subtle">{g.scope_intersection.explanation}</p>
          <div className="members">
            {g.members.map((m) => (
              <button
                key={m.id}
                className="member"
                onClick={() => onSelect(m.id)}
              >
                <strong>{m.scope.name}</strong>
                <span>{m.statement}</span>
                <small>
                  {m.conditions.length
                    ? `when ${m.conditions.map(words).join(", ")} · `
                    : ""}
                  {m.proposed_action
                    ? words(m.proposed_action)
                    : "no action stated"}
                  {m.simulated ? " · SIMULATED" : ""}
                </small>
              </button>
            ))}
          </div>
          {g.triage_rationale && (
            <p className="subtle">Staff note: {g.triage_rationale}</p>
          )}
          {g.triage_state !== "obsolete" && (
            <div className="action-row">
              <input
                aria-label="Triage note"
                placeholder="Note (required to dismiss)"
                value={notes[g.id] || ""}
                onChange={(e) => setNotes({ ...notes, [g.id]: e.target.value })}
              />
              <button
                className="secondary"
                onClick={() => classify(g, "confirmed")}
              >
                Needs customer clarification
              </button>
              <button
                className="secondary"
                disabled={!(notes[g.id] || "").trim()}
                onClick={() => classify(g, "dismissed")}
              >
                Dismiss
              </button>
              {g.triage_state !== "open" && (
                <button
                  className="secondary"
                  onClick={() => classify(g, "open")}
                >
                  Reopen
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

export function ReviewWorkspace(props: {
  projectId: string;
  csrf: string;
  sources: SourceLite[];
  properties: ScopeOption[];
  portfolios: ScopeOption[];
  onError: (message: string) => void;
}) {
  const { projectId, csrf, sources, properties, portfolios, onError } = props;
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  const bump = useCallback(() => setRefresh((n) => n + 1), []);

  return (
    <>
      <Extraction
        projectId={projectId}
        csrf={csrf}
        sources={sources}
        onChanged={bump}
        onError={onError}
      />
      <Requirements
        projectId={projectId}
        csrf={csrf}
        refresh={refresh}
        properties={properties}
        portfolios={portfolios}
        selected={selected}
        onSelect={setSelected}
        onChanged={bump}
        onError={onError}
      />
      <Conflicts
        projectId={projectId}
        csrf={csrf}
        refresh={refresh}
        onSelect={setSelected}
        onChanged={bump}
        onError={onError}
      />
    </>
  );
}
