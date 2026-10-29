"use client";

import { useState } from "react";
import {
  AUTOMATION_THRESHOLD,
  allSources,
  areas,
  coverage,
  coverageOf,
  currentStep,
  exportCsv,
  exportJson,
  isConfirmed,
  markConfigured,
  configurable,
  nextActions,
  onboardingSteps,
  processCounts,
  recipients,
  reviewFact,
  sentQuestionIds,
  shownLifecycle,
  shownValue,
  stageDays,
  submitAnswer,
  testCases,
  testStatus,
  waiveFact,
  type Fact,
  type PrototypeState,
  type Question,
} from "./state";
import { client, documentRequests, kickoffAgenda } from "./client";
import { Stepper, Tag, download, type Ctx } from "./ui";

/* ------------------------------------------------------------------ clients */
export function Clients({ ctx }: { ctx: Ctx }) {
  const { state, go } = ctx;
  const step = currentStep(state);
  const cov = coverage(state);
  const next = nextActions(state)[0];
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">Clients</p>
          <h1>Onboardings</h1>
          <p className="v2-muted">
            Requirements, configuration and tests stay linked from kickoff to
            go-live. Status exports to the tools the team already uses, such as
            Coda and Slack.
          </p>
        </div>
        <button className="v2-button" onClick={() => go("new")}>
          ＋ New onboarding
        </button>
      </div>
      <table className="v2-table v2-clients">
        <thead>
          <tr>
            <th>Client</th>
            <th>Stage</th>
            <th>Spec coverage</th>
            <th>Next step</th>
            <th>Go-live</th>
          </tr>
        </thead>
        <tbody>
          <tr
            className="link"
            onClick={() => go("journey")}
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && go("journey")}
          >
            <td>
              <strong>{client.name}</strong>
              <small className="v2-muted v2-block">
                {client.vertical} · {client.owner}
              </small>
            </td>
            <td>
              <Tag kind="blue">
                {step.n} of 5 · {step.name}
              </Tag>
            </td>
            <td>
              {cov.known} of {cov.total} known
            </td>
            <td>{next ? next.title : "Nothing waiting"}</td>
            <td>{client.goLive}</td>
          </tr>
          <tr className="static">
            <td>
              <strong>Birchwood Apartments</strong>
              <small className="v2-muted v2-block">
                Illustrative · Sam Rivera
              </small>
            </td>
            <td>
              <Tag kind="gray">1 of 5 · Kickoff and goals</Tag>
            </td>
            <td>0 of 20 known</td>
            <td>Run the kickoff call (Nov 3)</td>
            <td>Dec 4, 2026</td>
          </tr>
          <tr className="static">
            <td>
              <strong>Cedar &amp; Pine Realty</strong>
              <small className="v2-muted v2-block">
                Illustrative · Sam Rivera
              </small>
            </td>
            <td>
              <Tag kind="green">5 of 5 · Live, week 2</Tag>
            </td>
            <td>20 of 20 known</td>
            <td>Weekly review on Friday</td>
            <td>Live</td>
          </tr>
        </tbody>
      </table>
      <p className="v2-muted">
        Only Oakwood is a working example. The other rows are illustrative and
        fictional.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ new onboarding wizard */
export function NewOnboarding({
  ctx,
  onCreate,
}: {
  ctx: Ctx;
  onCreate: () => void;
}) {
  const { state, go } = ctx;
  const [n, setN] = useState(1);
  const agenda = kickoffAgenda(state);
  const labels = ["Client details", "Spec template", "Kickoff plan"];
  return (
    <>
      <button className="v2-link" onClick={() => go("clients")}>
        ← Clients
      </button>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">New onboarding</p>
          <h1>Start an onboarding</h1>
          <p className="v2-muted">
            Three short steps. Everything here is prefilled with fictional demo
            data.
          </p>
        </div>
      </div>
      <ol className="v2-wizard">
        {labels.map((l, i) => (
          <li
            key={l}
            className={n === i + 1 ? "active" : n > i + 1 ? "done" : ""}
          >
            <b>{n > i + 1 ? "✓" : i + 1}</b> {l}
          </li>
        ))}
      </ol>
      {n === 1 && (
        <section className="v2-card">
          <div className="v2-formgrid">
            <label className="v2-field">
              Company
              <input defaultValue={client.name} />
            </label>
            <label className="v2-field">
              Vertical
              <input defaultValue={client.vertical} />
            </label>
            <label className="v2-field">
              Agent
              <input defaultValue={client.plan} />
            </label>
            <label className="v2-field">
              Go-live target
              <input defaultValue={client.goLive} />
            </label>
            <label className="v2-field wide">
              Properties
              <textarea
                defaultValue={client.properties
                  .map((p) => `${p.name}, ${p.units} units`)
                  .join("\n")}
              />
            </label>
            <label className="v2-field">
              Primary contact
              <input defaultValue={client.contacts[0].name} />
            </label>
            <label className="v2-field">
              Contact email
              <input defaultValue={client.contacts[0].email} />
            </label>
          </div>
        </section>
      )}
      {n === 2 && (
        <section className="v2-card">
          <h3>Voice agent · property management</h3>
          <p className="v2-muted">
            The template defines the required facts. Each one gets a source, an
            owner, a status and an approval, and later a configuration entry and
            tests.
          </p>
          {areas.map((a) => (
            <div className="v2-agenda" key={a}>
              <strong>{a}</strong>
              <span>
                {state.facts
                  .filter((f) => f.area === a)
                  .map((f) => (
                    <span key={f.id} className="v2-chip-fact">
                      {f.label}
                    </span>
                  ))}
              </span>
            </div>
          ))}
        </section>
      )}
      {n === 3 && (
        <div className="v2-grid2">
          <section className="v2-card">
            <h3>Kickoff call agenda</h3>
            <p className="v2-muted">
              Generated from the template: every required fact is a question.
            </p>
            {agenda.map((a) => (
              <p key={a.area}>
                <strong>{a.area}:</strong>{" "}
                {a.items.map((i) => i.label).join(", ")}
              </p>
            ))}
          </section>
          <section className="v2-card">
            <h3>Documents to request</h3>
            <ul className="v2-list">
              {documentRequests.map((d) => (
                <li key={d.label}>
                  <span>
                    {d.label}
                    <small>{d.area}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <div className="v2-actions">
        {n > 1 && (
          <button className="v2-button secondary" onClick={() => setN(n - 1)}>
            Back
          </button>
        )}
        {n < 3 ? (
          <button className="v2-button" onClick={() => setN(n + 1)}>
            Continue
          </button>
        ) : (
          <button className="v2-button" onClick={onCreate}>
            Create onboarding
          </button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ requirements table */
function FactRow({
  state,
  f,
  focused,
  onReview,
  onConfigure,
  waive,
}: {
  state: PrototypeState;
  f: Fact;
  focused: boolean;
  onReview: () => void;
  onConfigure: () => void;
  waive: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const life = f.waived ? "Waived" : shownLifecycle(state, f);
  const value = shownValue(f);
  const mine = testCases(state).filter((t) => t.factId === f.id);
  const passing = mine.filter((t) => testStatus(state, t) === "Pass").length;
  const canReview =
    f.value !== null &&
    f.approval === "Not reviewed" &&
    f.lifecycle !== "Needs clarification";
  const canConfigure =
    configurable(f) &&
    f.lifecycle !== "Configured" &&
    (!f.critical || isConfirmed(f));
  const canWaive = coverageOf(f) === "empty" && !f.critical;
  const source = f.sourceId
    ? allSources(state).find((s) => s.id === f.sourceId)?.title
    : null;
  return (
    <div
      id={`fact-${f.id}`}
      className={`v2-fact ${coverageOf(f) === "empty" ? "gap" : ""} ${focused ? "focused" : ""}`}
    >
      <div className="v2-fact-label">
        <strong>
          <span className="v2-fact-id">{f.id}</span> {f.label}
        </strong>
        {f.critical && <Tag kind="red">Critical</Tag>}
        <small>{f.owner}</small>
      </div>
      <div className="v2-fact-body">
        {value ? (
          <p className="v2-fact-value">{value}</p>
        ) : (
          <p className="v2-fact-value gap">Not received yet.</p>
        )}
        {f.customerAnswer && f.customerAnswer.value !== f.value && (
          <p className="v2-muted">Customer answer: {f.customerAnswer.value}</p>
        )}
        {f.note && <p className="v2-muted">{f.note}</p>}
        {f.waived && (
          <p className="v2-muted">
            Waived by {f.waived.owner}: {f.waived.reason}
          </p>
        )}
        {(f.sourceId || value) && (
          <small className="v2-muted">
            {source ? `${source} · ` : ""}
            {f.anchor}
          </small>
        )}
        {f.evidence && (
          <details className="v2-history">
            <summary>Evidence</summary>
            <p>“{f.evidence}”</p>
          </details>
        )}
      </div>
      <div className="v2-fact-state">
        <Tag kind={f.waived ? "gray" : undefined}>{life}</Tag>
        <Tag>{f.approval}</Tag>
        {mine.length > 0 && (
          <small className="v2-muted">
            Tests {passing}/{mine.length}
          </small>
        )}
      </div>
      {(canReview || canConfigure || canWaive) && (
        <div className="v2-actions v2-fact-actions">
          {canReview && (
            <button className="v2-button secondary" onClick={onReview}>
              Mark reviewed
            </button>
          )}
          {canConfigure && (
            <button className="v2-button secondary" onClick={onConfigure}>
              Mark configured
            </button>
          )}
          {canWaive && (
            <>
              <input
                aria-label={`Reason to waive ${f.label}`}
                placeholder="Reason to waive"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="v2-button secondary"
                disabled={!reason.trim()}
                onClick={() => waive(reason)}
              >
                Waive with reason
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Requirements({
  ctx,
  focusFact,
}: {
  ctx: Ctx;
  focusFact: string;
}) {
  const { state, update } = ctx;
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">{client.name}</p>
          <h1>Requirements</h1>
          <p className="v2-muted">
            The single source of truth: twenty required facts. Each links to its
            source, an owner, an approval, the configuration, and its tests.
          </p>
        </div>
      </div>
      <details className="v2-card v2-sources">
        <summary>
          <strong>Sources received ({allSources(state).length})</strong>
        </summary>
        {allSources(state).map((s) => (
          <div key={s.id} className="v2-source-row">
            <strong>{s.title}</strong>
            <small>
              {s.type} · {s.received} · from {s.suppliedBy} ·{" "}
              <Tag kind={s.parse === "Parsed" ? "green" : "amber"}>
                {s.parse}
              </Tag>
            </small>
            {s.note && <small>{s.note}</small>}
          </div>
        ))}
      </details>
      {areas.map((area) => (
        <section key={area} className="v2-area">
          <h2>
            {area}{" "}
            <span className="v2-count">
              {state.facts.filter((f) => f.area === area).length}
            </span>
          </h2>
          {state.facts
            .filter((f) => f.area === area)
            .map((f) => (
              <FactRow
                key={f.id}
                state={state}
                f={f}
                focused={focusFact === f.id}
                onReview={() => update((s) => reviewFact(s, f.id))}
                onConfigure={() => update((s) => markConfigured(s, f.id))}
                waive={(reason) => update((s) => waiveFact(s, f.id, reason))}
              />
            ))}
        </section>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ process and export */
export function Process({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">{client.name}</p>
          <h1>Process and export</h1>
          <p className="v2-muted">
            You can only automate what you can see. This tracks stage timing and
            repeated manual work, and exports plain rows.
          </p>
        </div>
      </div>
      <section className="v2-card">
        <h3>Time per stage (illustrative)</h3>
        <ul className="v2-process">
          {stageDays.map((s) => (
            <li key={s.name}>
              <span>{s.name}</span>
              <b>{s.days}</b>
            </li>
          ))}
        </ul>
      </section>
      <section className="v2-card">
        <h3>Repeated manual work</h3>
        <p className="v2-muted">
          Rule: once a step has been done by hand {AUTOMATION_THRESHOLD} times,
          it becomes an automation candidate. Counts are earlier onboardings
          (fictional) plus actions you take in this session.
        </p>
        <ul className="v2-process">
          {processCounts(state).map((p) => (
            <li key={p.id}>
              <span>{p.label}</span>
              <b>
                {p.total}×{p.live ? ` (${p.live} now)` : ""}
              </b>
              <em className={p.candidate ? "hot" : ""}>
                {p.automatedBy
                  ? `Automated by: ${p.automatedBy}`
                  : p.candidate
                    ? "Automation candidate"
                    : "Watching"}
              </em>
            </li>
          ))}
        </ul>
      </section>
      <section className="v2-card">
        <h3>Export to the team’s tools</h3>
        <p className="v2-muted">
          Plain rows (one per required fact) that a table tool such as Coda
          could import, plus a JSON bundle. Nothing is sent anywhere, and this
          is not a Coda integration.
        </p>
        <div className="v2-actions">
          <button
            className="v2-button secondary"
            onClick={() =>
              download("onboarding-rows.csv", exportCsv(state), "text/csv")
            }
          >
            Download rows (CSV)
          </button>
          <button
            className="v2-button secondary"
            onClick={() =>
              download("onboarding.json", exportJson(state), "application/json")
            }
          >
            Download JSON
          </button>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ customer answer form */
export function Portal({
  ctx,
  role,
  setRole,
}: {
  ctx: Ctx;
  role: string;
  setRole: (r: string) => void;
}) {
  const { state, update, flash, go } = ctx;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState("");
  const sentIds = sentQuestionIds(state);
  const roles = Object.keys(recipients).filter((r) =>
    state.questions.some(
      (q) => q.recipientRole === r && sentIds.includes(q.id),
    ),
  );
  const questions = state.questions.filter(
    (q) => q.recipientRole === role && sentIds.includes(q.id),
  );
  const steps = onboardingSteps(state);

  function composed(q: Question) {
    const c = choice[q.id];
    const text = (detail[q.id] || "").trim();
    if (!c) return text;
    const opt = c.startsWith("opt:") ? q.options[Number(c.slice(4))] : "";
    if (!opt) return "";
    return opt.startsWith("Something else")
      ? text
      : text
        ? `${opt} — ${text}`
        : opt;
  }
  function submit() {
    const entries = questions.filter(
      (q) => choice[q.id] || detail[q.id]?.trim(),
    );
    if (!entries.length) {
      flash(
        "Pick an answer, “I don’t know”, or “Someone else should answer” for at least one question.",
      );
      return;
    }
    update((s) => {
      let next = s;
      for (const q of entries) {
        const c = choice[q.id];
        next = submitAnswer(
          next,
          q.id,
          composed(q),
          c === "unknown"
            ? "unknown"
            : c === "delegate"
              ? "delegate"
              : "answer",
          "",
        );
      }
      return next;
    });
    setReview(false);
    setReceipt(
      `${entries.length} answer${entries.length === 1 ? "" : "s"} recorded in this simulated session. Prior versions stay visible below.`,
    );
    setChoice({});
    setDetail({});
  }

  return (
    <div className="v2-portal">
      <header className="v2-portal-header">
        <div className="v2-brandmark">
          so<span>.</span>
        </div>
        <span>Fictional customer view · simulated</span>
      </header>
      <main className="v2-portal-main">
        <button className="v2-link" onClick={() => go("journey")}>
          ← Return to specialist view
        </button>
        {sentIds.length === 0 ? (
          <div className="v2-empty">
            <h1>No questions have been sent yet.</h1>
            <p>
              Approve and send a clarification batch from the onboarding first.
            </p>
            <button onClick={() => go("journey")}>Open the onboarding</button>
          </div>
        ) : (
          <>
            <p className="v2-eyebrow">{client.name} · fictional</p>
            <h1>Help us get your agent setup details right.</h1>
            <p className="v2-lede">
              Avery from the implementation team has a few questions. Choose the
              closest answer or write your own; you can revise while this
              simulated review is open.
            </p>
            {roles.length > 1 && (
              <div className="v2-choices" aria-label="Preview as recipient">
                {roles.map((r) => (
                  <button
                    key={r}
                    className={`v2-chip ${role === r ? "selected" : ""}`}
                    onClick={() => setRole(r)}
                  >
                    Preview as {recipients[r].name}
                  </button>
                ))}
              </div>
            )}
            <div className="v2-portal-intro">
              <span>
                <strong>{questions.length}</strong> question
                {questions.length === 1 ? "" : "s"} for {recipients[role]?.name}{" "}
                · {role}
              </span>
              <span>Demo link · no email sent</span>
            </div>
            <Stepper
              steps={steps}
              active={steps.find((s) => s.status === "Current")?.n ?? 5}
            />
            {receipt && (
              <div className="v2-success" role="status">
                {receipt}
              </div>
            )}
            {review ? (
              <section className="v2-card">
                <p className="v2-eyebrow">Review answers</p>
                <h3>Check before submitting</h3>
                {questions
                  .filter((q) => choice[q.id] || detail[q.id]?.trim())
                  .map((q) => (
                    <div className="v2-summary-row" key={q.id}>
                      <strong>{q.title}</strong>
                      <p>
                        {choice[q.id] === "unknown"
                          ? "I don’t know"
                          : choice[q.id] === "delegate"
                            ? "Someone else should answer"
                            : composed(q)}
                      </p>
                    </div>
                  ))}
                <div className="v2-actions">
                  <button
                    className="v2-button secondary"
                    onClick={() => setReview(false)}
                  >
                    Edit answers
                  </button>
                  <button className="v2-button" onClick={submit}>
                    Submit selected answers
                  </button>
                </div>
              </section>
            ) : (
              <>
                {questions.map((q, index) => (
                  <section className="v2-card v2-portal-card" key={q.id}>
                    <div className="v2-card-top">
                      <span>Question {index + 1}</span>
                      <span>
                        {q.revisions.length
                          ? `Previously answered · ${q.revisions.length} revision${q.revisions.length === 1 ? "" : "s"}`
                          : "Not answered"}
                      </span>
                    </div>
                    <h3>{q.text}</h3>
                    <p className="v2-context">
                      Context shared with you: {q.source}. No full source
                      document is included.
                    </p>
                    <div
                      className="v2-options"
                      role="radiogroup"
                      aria-label={q.title}
                    >
                      {[
                        ...q.options.map((o, i) => [`opt:${i}`, o] as const),
                        ["unknown", "I don’t know"] as const,
                        ["delegate", "Someone else should answer"] as const,
                      ].map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name={`choice-${q.id}`}
                            checked={choice[q.id] === value}
                            onChange={() =>
                              setChoice({ ...choice, [q.id]: value })
                            }
                          />{" "}
                          {label}
                        </label>
                      ))}
                    </div>
                    <label className="v2-field">
                      Add detail (optional)
                      <textarea
                        value={detail[q.id] || ""}
                        onChange={(e) =>
                          setDetail({ ...detail, [q.id]: e.target.value })
                        }
                        placeholder="Write the policy or next step in your own words"
                      />
                    </label>
                    {q.revisions.length > 0 && (
                      <details className="v2-history">
                        <summary>View submitted answer history</summary>
                        {q.revisions.map((r, i) => (
                          <div key={i}>
                            <strong>{r.at}</strong>
                            <p>
                              {r.kind === "answer"
                                ? r.value
                                : r.kind === "unknown"
                                  ? "I don’t know"
                                  : "Someone else should answer"}
                            </p>
                          </div>
                        ))}
                      </details>
                    )}
                  </section>
                ))}
                <div className="v2-portal-footer">
                  <p>
                    Your name and role are self-declared in a real workflow. A
                    review link does not verify identity or provide legal
                    authorization.
                  </p>
                  <div className="v2-actions">
                    <button
                      className="v2-button"
                      onClick={() => setReview(true)}
                    >
                      Review answers →
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
