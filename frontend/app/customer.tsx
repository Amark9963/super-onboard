"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";

type Contact = { id: string; name: string; email: string; role: string };
type Eligible = {
  id: string;
  title: string;
  statement: string;
  scope: { name: string | null; confirmed_by_staff: boolean };
  customer_confirmation_state: string;
};
type Invitation = {
  id: string;
  request_id: string;
  status: string;
  contact: { name: string; email: string };
  expires_at: string;
  opened_at: string | null;
  delivery_state: string;
  delivery_error: string | null;
  items: number;
  answered: number;
  replaces_id: string | null;
};
type RequestRow = { id: string; title: string; invitations: Invitation[] };
type PreviewItem = {
  item_id: string;
  question: string;
  proposed_rule: {
    title: string;
    statement: string;
    scope: string | null;
  } | null;
  excerpts: { text: string; source: string }[];
  allowed_responses: string[];
};
type Draft = {
  request_id: string;
  invitation: Invitation;
  preview: { title: string; message: string | null; items: PreviewItem[] };
};
type Issued = { link: string; note: string; invitation: Invitation };
type Inbox = {
  response_id: string;
  request_title: string;
  invitation_status: string;
  recipient: { name: string; email: string };
  received_at: string;
  version: number;
  question: string;
  kind: string;
  proposed_statement: string | null;
  requirement_version_id: string | null;
  response_type: string;
  answer: Record<string, unknown>;
  previous: { response_type: string; version: number } | null;
  state: string;
  wording_changed: boolean;
  locked: boolean;
  revised: boolean;
  next_action: string | null;
  confirmation_note: string;
};
type Question = {
  question: string;
  answer_type: string;
  choices: string;
  conflict_id?: string | null;
  requirement_version_id?: string | null;
  ai_suggested?: boolean;
};
type Conflict = {
  id: string;
  kind: string;
  title: string;
  triage_state: string;
};
type Provider = { id: string; model: string | null };
type Suggestion = {
  question: string;
  answer_type: string;
  conflict_id: string | null;
  requirement_version_id: string | null;
  model: string;
  review_required: boolean;
};

const words = (v: string) => v.replaceAll("_", " ");
const message = (r: unknown) => (r instanceof Error ? r.message : String(r));

const DELIVERY: Record<string, string> = {
  smtp_accepted:
    "SMTP server accepted the message (inbox delivery is not confirmed)",
  failed: "Email failed — use the copied link instead",
  link_only: "No email sent — link shared manually",
  not_sent: "Not sent",
  draft: "Draft",
};

export function CustomerPanel(props: {
  projectId: string;
  csrf: string;
  contacts: Contact[];
  onError: (message: string) => void;
}) {
  const { projectId, csrf, contacts, onError } = props;
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [inbox, setInbox] = useState<Inbox[] | null>(null);
  const [tick, setTick] = useState(0);
  const [contact, setContact] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [days, setDays] = useState(7);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [excerpts, setExcerpts] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [suggestionTarget, setSuggestionTarget] = useState("");
  const [aiAcknowledged, setAiAcknowledged] = useState(false);
  const [suggestedModel, setSuggestedModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    const load = () =>
      Promise.all([
        api<{ items: Eligible[] }>(
          `/projects/${projectId}/requirements?state=accepted&evidence_status=verified&limit=200`,
        ),
        api<RequestRow[]>(`/projects/${projectId}/review-requests`),
        api<Inbox[]>(`/projects/${projectId}/responses`),
        api<Conflict[]>(`/projects/${projectId}/conflicts`),
        api<Provider[]>("/ai/providers"),
      ])
        .then(([c, r, i, groups, providers]) => {
          if (!live) return;
          setEligible(
            c.items.filter(
              (x) =>
                x.customer_confirmation_state === "not_confirmed" &&
                x.scope.confirmed_by_staff,
            ),
          );
          setRequests(r);
          setInbox(i);
          setConflicts(
            groups.filter(
              (group) =>
                ["conflict", "gap"].includes(group.kind) &&
                !["obsolete", "dismissed"].includes(group.triage_state),
            ),
          );
          setAiAvailable(
            providers.some((provider) => provider.id === "openai_compatible"),
          );
        })
        .catch((reason) => live && onError(message(reason)));
    load();
    const timer = setInterval(load, 6000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId, tick, onError]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      bump();
    } catch (reason) {
      onError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const post = (path: string, body: object = {}) =>
    api<never>(
      `/projects/${projectId}${path}`,
      { method: "POST", body: JSON.stringify(body) },
      csrf,
    );

  async function compose(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const items: object[] = [];
      for (const c of eligible.filter((e) => picked[e.id])) {
        let ids: string[] = [];
        if (excerpts[c.id]) {
          const detail = await api<{
            evidence: { id: string; quote_match_state: string }[];
          }>(`/projects/${projectId}/requirements/${c.id}`);
          ids = detail.evidence
            .filter((e) => e.quote_match_state !== "invalid")
            .map((e) => e.id)
            .slice(0, 5);
        }
        items.push({
          kind: "confirm_rule",
          requirement_version_id: c.id,
          excerpt_evidence_ids: ids,
        });
      }
      for (const q of questions.filter((x) => x.question.trim()))
        items.push({
          kind: "question",
          question: q.question,
          answer_type: q.answer_type,
          ...(q.conflict_id ? { conflict_id: q.conflict_id } : {}),
          ...(q.requirement_version_id
            ? { requirement_version_id: q.requirement_version_id }
            : {}),
          choices: q.choices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      const created = await post("/review-requests", {
        title,
        contact_id: contact,
        message: text,
        expires_in_days: days,
        items,
      });
      const data = created as unknown as Draft;
      setDraft(data);
      setIssued(null);
    });
  }

  async function suggest() {
    if (!suggestionTarget || !aiAcknowledged) return;
    const [kind, id] = suggestionTarget.split(":", 2);
    await run(async () => {
      const result = await post("/question-suggestions", {
        ...(kind === "conflict"
          ? { conflict_id: id }
          : { requirement_version_id: id }),
        acknowledge_external_processing: true,
      });
      const draft = result as unknown as Suggestion;
      setQuestions((current) => [
        ...current,
        {
          question: draft.question,
          answer_type: draft.answer_type,
          choices: "",
          conflict_id: draft.conflict_id,
          requirement_version_id: draft.requirement_version_id,
          ai_suggested: true,
        },
      ]);
      setSuggestedModel(draft.model);
    });
  }

  const invitationPath = (d: { request_id: string; id: string }) =>
    `/review-requests/${d.request_id}/invitations/${d.id}`;

  async function send(deliver: boolean) {
    if (!draft) return;
    await run(async () => {
      const result = await post(
        `${invitationPath({ request_id: draft.request_id, id: draft.invitation.id })}/send`,
        { deliver_email: deliver },
      );
      setIssued(result as unknown as Issued);
      setDraft(null);
      setPicked({});
      setQuestions([]);
    });
  }

  async function reissue(inv: Invitation, action: "resend" | "revoke") {
    await run(async () => {
      const result = await post(`${invitationPath(inv)}/${action}`, {});
      if (action === "resend") setIssued(result as unknown as Issued);
    });
  }

  async function decide(row: Inbox, decision: string) {
    await run(async () => {
      await post(`/responses/${row.response_id}/review`, {
        decision,
        rationale: notes[row.response_id] || "",
      });
    });
  }

  async function revise(row: Inbox) {
    await run(async () => {
      await post(`/requirements/${row.requirement_version_id}/revise`, {
        response_id: row.response_id,
      });
    });
  }

  return (
    <>
      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">CUSTOMER REVIEW</p>
            <h2>Clarifications &amp; invitations</h2>
          </div>
          <span className="pill">{eligible.length} ready to send</span>
        </div>
        <p className="subtle">
          Customers see only the items, wording and excerpts you select here,
          through a private link. A customer&apos;s confirmation is recorded
          only after a staff member validates it.
        </p>
        {issued && (
          <div className="saved-banner" role="status">
            <strong>Private link (shown once):</strong>
            <p>
              <code>{issued.link}</code>{" "}
              <button
                className="text-button"
                onClick={() => void navigator.clipboard?.writeText(issued.link)}
              >
                Copy
              </button>
            </p>
            <p className="subtle">{issued.note}</p>
          </div>
        )}
        {draft ? (
          <div className="draft-preview">
            <h3>Preview: exactly what the customer will see</h3>
            <p className="subtle">
              {draft.preview.title}
              {draft.preview.message ? ` — ${draft.preview.message}` : ""}
            </p>
            {draft.preview.items.map((item, i) => (
              <article className="block" key={item.item_id}>
                <div className="locator">Item {i + 1}</div>
                <strong>{item.question}</strong>
                {item.proposed_rule && (
                  <p>
                    {item.proposed_rule.statement}{" "}
                    <small>({item.proposed_rule.scope})</small>
                  </p>
                )}
                {item.excerpts.map((e, j) => (
                  <blockquote key={j}>
                    {e.text} <small>— {e.source}</small>
                  </blockquote>
                ))}
                <small className="subtle">
                  Responses: {item.allowed_responses.map(words).join(", ")}
                </small>
              </article>
            ))}
            <div className="action-row">
              <button disabled={busy} onClick={() => void send(true)}>
                Send email and create link
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void send(false)}
              >
                Create link without email
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await post(
                      `${invitationPath({ request_id: draft.request_id, id: draft.invitation.id })}/revoke`,
                    );
                    setDraft(null);
                  })
                }
              >
                Discard draft
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={compose}>
            <div className="grid-two tight">
              <label>
                Recipient
                <select
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                >
                  <option value="">Select a contact</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Request name
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Weekend emergency routing"
                />
              </label>
              <label>
                Link valid for (days)
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </label>
              <label>
                Message to the customer (optional)
                <input
                  maxLength={2000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            </div>
            <h3>Rules to confirm</h3>
            {eligible.length === 0 && (
              <p className="subtle">
                No candidates are ready. Accept verified candidates for customer
                review above first.
              </p>
            )}
            {eligible.map((c) => (
              <div className="pick" key={c.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!picked[c.id]}
                    onChange={(e) =>
                      setPicked({ ...picked, [c.id]: e.target.checked })
                    }
                  />
                  <span>
                    <strong>{c.title}</strong> · {c.scope.name}
                    <br />
                    <small>{c.statement}</small>
                  </span>
                </label>
                {picked[c.id] && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!!excerpts[c.id]}
                      onChange={(e) =>
                        setExcerpts({ ...excerpts, [c.id]: e.target.checked })
                      }
                    />
                    Share its verified source excerpt with the customer
                  </label>
                )}
              </div>
            ))}
            <h3>Questions</h3>
            {aiAvailable ? (
              <div className="grid-two tight">
                <label>
                  Draft a clarification from
                  <select
                    value={suggestionTarget}
                    onChange={(e) => setSuggestionTarget(e.target.value)}
                  >
                    <option value="">
                      Select a conflict, gap or candidate
                    </option>
                    <optgroup label="Conflicts and gaps">
                      {conflicts.map((group) => (
                        <option key={group.id} value={`conflict:${group.id}`}>
                          {words(group.kind)} · {group.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Candidates ready for customer review">
                      {eligible.map((candidate) => (
                        <option
                          key={candidate.id}
                          value={`requirement:${candidate.id}`}
                        >
                          {candidate.title} · {candidate.scope.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={aiAcknowledged}
                    onChange={(e) => setAiAcknowledged(e.target.checked)}
                  />
                  I understand the linked rule wording and verified excerpts
                  will be sent to the configured AI provider.
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !suggestionTarget || !aiAcknowledged}
                  onClick={() => void suggest()}
                >
                  {busy ? "Drafting…" : "Draft question with AI"}
                </button>
              </div>
            ) : (
              <p className="subtle">
                Configure a live AI provider to draft questions here.
              </p>
            )}
            {suggestedModel && (
              <p className="notice">
                AI suggestion from {suggestedModel}. Edit the wording before
                creating the customer preview.
              </p>
            )}
            {questions.map((q, i) => (
              <div className="grid-two tight" key={i}>
                <label>
                  Question
                  {q.ai_suggested ? " (AI suggestion — review and edit)" : ""}
                  <input
                    value={q.question}
                    maxLength={1000}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, j) =>
                          j === i ? { ...x, question: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Answer type
                  <select
                    value={q.answer_type}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, j) =>
                          j === i ? { ...x, answer_type: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="free_text">Free text</option>
                    <option value="yes_no">Yes / no</option>
                    <option value="single_choice">Single choice</option>
                    <option value="multiple_choice">Multiple choice</option>
                  </select>
                </label>
                {q.answer_type.endsWith("_choice") && (
                  <label>
                    Choices (comma separated)
                    <input
                      value={q.choices}
                      onChange={(e) =>
                        setQuestions(
                          questions.map((x, j) =>
                            j === i ? { ...x, choices: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                )}
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setQuestions([
                  ...questions,
                  { question: "", answer_type: "free_text", choices: "" },
                ])
              }
            >
              Add a question
            </button>
            <button
              disabled={
                busy ||
                !contact ||
                (Object.values(picked).filter(Boolean).length === 0 &&
                  questions.every((q) => !q.question.trim()))
              }
            >
              Create draft and preview
            </button>
          </form>
        )}
      </section>

      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">LINKS</p>
            <h2>Requests and invitations</h2>
          </div>
          <span className="pill">{requests?.length ?? 0} requests</span>
        </div>
        {requests === null && <p className="subtle">Loading…</p>}
        {requests?.length === 0 && (
          <p className="subtle">No review requests yet.</p>
        )}
        {requests?.map((r) => (
          <div className="source-row" key={r.id}>
            <strong>{r.title}</strong>
            {r.invitations.map((inv) => (
              <div className="version-row" key={inv.id}>
                <span className={`status ${inv.status}`}>{inv.status}</span>
                <span>{inv.contact.name}</span>
                <small>
                  {inv.answered}/{inv.items} answered · expires{" "}
                  {new Date(inv.expires_at).toLocaleString()}
                  {inv.opened_at ? " · opened" : ""}
                </small>
                <small>
                  {DELIVERY[inv.delivery_state] || inv.delivery_state}
                </small>
                {inv.delivery_error && (
                  <span className="error-code">
                    {words(inv.delivery_error)}
                  </span>
                )}
                {inv.status !== "draft" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void reissue(inv, "resend")}
                  >
                    Resend (new link)
                  </button>
                )}
                {inv.status === "active" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void reissue(inv, "revoke")}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">RESPONSES</p>
            <h2>Customer response inbox</h2>
          </div>
          <span className="pill">
            {
              (inbox ?? []).filter((i) => i.state === "awaiting_staff_review")
                .length
            }{" "}
            awaiting review
          </span>
        </div>
        <p className="subtle">
          Recipients are identified only by the contact you chose; possession of
          a link does not verify who answered.
        </p>
        {inbox === null && <p className="subtle">Loading…</p>}
        {inbox?.length === 0 && <p className="subtle">No responses yet.</p>}
        {inbox?.map((row) => (
          <article className="group-card low" key={row.response_id}>
            <div className="badges">
              <span className="badge plain">{words(row.response_type)}</span>
              <span className="badge plain">v{row.version}</span>
              <span className="badge warn">{words(row.state)}</span>
              {row.wording_changed && (
                <span className="badge unverifiable">
                  wording changed since sent
                </span>
              )}
              {row.locked && <span className="badge verified">confirmed</span>}
            </div>
            <h3>{row.question}</h3>
            {row.proposed_statement && (
              <p className="subtle">Proposed: {row.proposed_statement}</p>
            )}
            <p>
              <strong>{row.recipient.name}</strong> (unverified) ·{" "}
              {new Date(row.received_at).toLocaleString()}
            </p>
            {Object.entries(row.answer).map(([k, v]) => (
              <p key={k}>
                <small className="subtle">{words(k)}:</small>{" "}
                {Array.isArray(v) ? v.join(", ") : String(v)}
              </p>
            ))}
            {row.previous && (
              <p className="subtle">
                Changed from v{row.previous.version}:{" "}
                {words(row.previous.response_type)}
              </p>
            )}
            {row.next_action && (
              <p className="subtle">Next: {row.next_action}</p>
            )}
            {row.state === "awaiting_staff_review" && (
              <div className="action-row">
                <input
                  aria-label="Staff note"
                  placeholder="Note (required to reject)"
                  value={notes[row.response_id] || ""}
                  onChange={(e) =>
                    setNotes({ ...notes, [row.response_id]: e.target.value })
                  }
                />
                {row.response_type === "confirm" &&
                  row.kind === "confirm_rule" && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void decide(row, "validate_confirmation")
                        }
                      >
                        Validate confirmation
                      </button>
                      <button
                        className="danger"
                        disabled={
                          busy || !(notes[row.response_id] || "").trim()
                        }
                        onClick={() => void decide(row, "reject_confirmation")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                {row.response_type === "request_correction" &&
                  !row.revised &&
                  row.requirement_version_id && (
                    <button disabled={busy} onClick={() => void revise(row)}>
                      Revise from correction
                    </button>
                  )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void decide(row, "acknowledge")}
                >
                  Acknowledge
                </button>
              </div>
            )}
            <small className="subtle">{row.confirmation_note}</small>
          </article>
        ))}
      </section>
    </>
  );
}
