"use client";

import { useEffect, useState } from "react";
import {
  AUTOMATION_THRESHOLD,
  addSource,
  allSources,
  applyDefault,
  areas,
  claims,
  consistencyReport,
  convertIssue,
  coverage,
  coverageOf,
  currentStep,
  exportCsv,
  exportJson,
  initialState,
  isConfirmed,
  lateSource,
  launchChecklist,
  markConfigured,
  needsFromCustomer,
  nextActions,
  onboardingSteps,
  processCounts,
  questionCritical,
  readiness,
  recipients,
  recordTest,
  reopenQuestion,
  resolveInternally,
  reviewAnswer,
  reviewFact,
  runConsistencyCheck,
  seedIssues,
  sendRequest,
  sentQuestionIds,
  shownLifecycle,
  shownValue,
  slackUpdate,
  stageDays,
  submitAnswer,
  testCases,
  testStatus,
  updateQuestion,
  configurable,
  waiveFact,
  weeklyCheckIn,
  type Fact,
  type NextAction,
  type PrototypeState,
  type Question,
} from "./state";

type View = "home" | "requirements" | "checks" | "qa" | "process" | "portal";
const views: View[] = [
  "home",
  "requirements",
  "checks",
  "qa",
  "process",
  "portal",
];
const nav: { view: View; label: string; icon: string }[] = [
  { view: "home", label: "Onboarding", icon: "◫" },
  { view: "requirements", label: "Requirements", icon: "◇" },
  { view: "checks", label: "Checks", icon: "◈" },
  { view: "qa", label: "QA & Launch", icon: "✓" },
  { view: "process", label: "Process", icon: "↻" },
];

const tone = (s: string) =>
  [
    "Customer confirmed",
    "Customer approved",
    "Configured",
    "Tested",
    "Pass",
    "Resolved",
  ].includes(s)
    ? "green"
    : ["Needs clarification", "Needs retest", "Defaulted"].includes(s)
      ? "amber"
      : ["Not received", "Fail"].includes(s)
        ? "red"
        : ["Not reviewed", "Not run"].includes(s)
          ? "gray"
          : "blue";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function friendly(a: NextAction): string {
  if (a.id === "run-check")
    return "Comparing the information you sent for contradictions";
  if (a.id.startsWith("conflict-"))
    return `Clarifying: ${a.title.replace(/^[^:]+: /, "")}`;
  if (a.id.startsWith("review-") && a.id !== "review-facts")
    return `Reviewing your answer: ${a.title.replace(/^[^:]+: /, "")}`;
  if (a.id === "approve-wording" || a.id.startsWith("send-"))
    return "Preparing questions for you";
  if (a.id.startsWith("gap-"))
    return `Chasing missing information: ${a.title.replace(/^[^:]+: /, "")}`;
  if (a.id === "review-facts")
    return "Reviewing what we extracted from your documents";
  if (a.id === "tests") return "Testing the agent against your scenarios";
  return a.title;
}

export default function Prototype() {
  const [view, setView] = useState<View>("home");
  const [state, setState] = useState<PrototypeState>(initialState);
  const [audience, setAudience] = useState<"team" | "customer">("team");
  const [focusFact, setFocusFact] = useState("");
  const [portalRole, setPortalRole] = useState("Operations lead");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [portalReview, setPortalReview] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [fixChoice, setFixChoice] = useState<Record<string, string>>({});
  const [fixNote, setFixNote] = useState<Record<string, string>>({});
  const [waiveNote, setWaiveNote] = useState<Record<string, string>>({});
  const [testNotes, setTestNotes] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const readHash = () => {
      const route = window.location.hash.slice(1) as View;
      if (views.includes(route)) {
        setView(route);
        setToast("");
      }
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);
  useEffect(() => {
    if (view === "requirements" && focusFact)
      document
        .getElementById(`fact-${focusFact}`)
        ?.scrollIntoView({ block: "center" });
  }, [view, focusFact]);

  const go = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
    setMobileMenu(false);
    setToast("");
  };
  const flash = (message: string) => setToast(message);
  const update = (fn: (s: PrototypeState) => PrototypeState) => setState(fn);

  const status = readiness(state);
  const report = consistencyReport(state);
  const cov = coverage(state);
  const steps = onboardingSteps(state);
  const step = currentStep(state);
  const actions = nextActions(state);
  const checklist = launchChecklist(state);
  const cases = testCases(state);
  const sentIds = sentQuestionIds(state);
  const sentRoles = Object.keys(recipients).filter((r) =>
    state.questions.some(
      (q) => q.recipientRole === r && sentIds.includes(q.id),
    ),
  );
  const sentQuestions = state.questions.filter(
    (q) => q.recipientRole === portalRole && sentIds.includes(q.id),
  );

  const goTarget = (t: NextAction["target"]) => {
    if (t.factId) setFocusFact(t.factId);
    go(t.view);
  };

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
  function submitPortal() {
    const entries = sentQuestions.filter(
      (q) => choice[q.id] || detail[q.id]?.trim(),
    );
    if (!entries.length) {
      flash(
        "Pick an answer, “I don’t know”, or “Someone else should answer” for at least one question.",
      );
      return;
    }
    let next = state;
    for (const q of entries) {
      const c = choice[q.id];
      const kind =
        c === "unknown" ? "unknown" : c === "delegate" ? "delegate" : "answer";
      next = submitAnswer(next, q.id, composed(q), kind, "");
    }
    setState(next);
    setPortalReview(false);
    setReceipt(
      `${entries.length} answer${entries.length === 1 ? "" : "s"} recorded in this simulated session. Prior versions stay visible below.`,
    );
    setChoice({});
    setDetail({});
  }

  // ------------------------------------------------------------------ customer answer form
  if (view === "portal")
    return (
      <div className="v2-portal">
        <header className="v2-portal-header">
          <div className="v2-brandmark">
            so<span>.</span>
          </div>
          <span>Fictional customer view · simulated</span>
        </header>
        <main className="v2-portal-main">
          <button className="v2-link" onClick={() => go("checks")}>
            ← Return to specialist view
          </button>
          {sentIds.length === 0 ? (
            <div className="v2-empty">
              <h1>No questions have been sent yet.</h1>
              <p>
                Approve and send a clarification batch from the Checks screen
                first.
              </p>
              <button onClick={() => go("checks")}>Open Checks</button>
            </div>
          ) : (
            <>
              <p className="v2-eyebrow">OAKWOOD PROPERTY GROUP · FICTIONAL</p>
              <h1>Help us get your agent setup details right.</h1>
              <p className="v2-lede">
                Avery from the implementation team has a few questions. Choose
                the closest answer or write your own; you can revise while this
                simulated review is open.
              </p>
              <div className="v2-portal-intro">
                <span>
                  <strong>{sentQuestions.length}</strong> question
                  {sentQuestions.length === 1 ? "" : "s"} in this request
                </span>
                <span>
                  For {recipients[portalRole]?.name} · {portalRole}
                </span>
                <span>Demo link · no email sent</span>
              </div>
              {sentRoles.length > 1 && (
                <div className="v2-choices" aria-label="Preview as recipient">
                  {sentRoles.map((r) => (
                    <button
                      key={r}
                      className={`v2-chip ${portalRole === r ? "selected" : ""}`}
                      onClick={() => setPortalRole(r)}
                    >
                      Preview as {recipients[r].name}
                    </button>
                  ))}
                </div>
              )}
              <StepTracker
                state={state}
                audience="customer"
                role={portalRole}
              />
              {receipt && (
                <div className="v2-success" role="status">
                  {receipt}
                </div>
              )}
              {portalReview ? (
                <section className="v2-panel">
                  <p className="v2-eyebrow">REVIEW ANSWERS</p>
                  <h2>Check before submitting</h2>
                  {sentQuestions
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
                      onClick={() => setPortalReview(false)}
                    >
                      Edit answers
                    </button>
                    <button className="v2-button" onClick={submitPortal}>
                      Submit selected answers
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {sentQuestions.map((q, index) => (
                    <section className="v2-portal-card" key={q.id}>
                      <div className="v2-card-top">
                        <span>
                          QUESTION {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>
                          {q.revisions.length
                            ? `Previously answered · ${q.revisions.length} revision${q.revisions.length === 1 ? "" : "s"}`
                            : "Not answered"}
                        </span>
                      </div>
                      <h2>{q.text}</h2>
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
                        onClick={() => setPortalReview(true)}
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

  // ------------------------------------------------------------------ specialist workspace
  return (
    <div className="v2-app">
      <aside className={`v2-sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="v2-logo">
          <div className="v2-logo-icon">
            s<span>o</span>
          </div>
          <div>
            <strong>super onboard</strong>
            <small>ONBOARDING PROCESS</small>
          </div>
        </div>
        <div className="v2-side-section customer">OAKWOOD PROPERTY GROUP</div>
        {nav.map((item) => (
          <button
            key={item.view}
            className={`v2-side-link ${view === item.view ? "active" : ""}`}
            onClick={() => go(item.view)}
          >
            <span>{item.icon}</span> {item.label}
            {item.view === "home" && actions.length > 0 && (
              <b>{actions.length}</b>
            )}
          </button>
        ))}
        <div className="v2-sidebar-bottom">
          <span className="v2-avatar">AM</span>
          <div>
            <strong>Avery Morgan</strong>
            <small>Implementation specialist</small>
          </div>
        </div>
      </aside>
      <div className="v2-main-wrap">
        <header className="v2-topbar">
          <button
            className="v2-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            ☰
          </button>
          <div className="v2-breadcrumb">
            <span>Oakwood Property Group</span>
            <span>/</span>
            <strong>{nav.find((n) => n.view === view)?.label}</strong>
          </div>
          <div className="v2-top-meta">
            <span className="v2-live-dot" /> Simulated prototype · fictional
            data
          </div>
        </header>
        <main className="v2-content">
          {toast && (
            <div className="v2-toast" role="status">
              {toast}
              <button aria-label="Dismiss message" onClick={() => setToast("")}>
                ×
              </button>
            </div>
          )}

          {view === "home" && (
            <>
              <div className="v2-hero">
                <div>
                  <p className="v2-eyebrow">
                    ONE ONBOARDING · KICKOFF TO GO-LIVE
                  </p>
                  <h1>Oakwood Property Group</h1>
                  <p>
                    Step {step.n} of {steps.length}: {step.name}. {step.detail}
                  </p>
                </div>
                <div className="v2-toggle" role="group" aria-label="Audience">
                  <button
                    className={audience === "team" ? "selected" : ""}
                    onClick={() => setAudience("team")}
                  >
                    Team view
                  </button>
                  <button
                    className={audience === "customer" ? "selected" : ""}
                    onClick={() => setAudience("customer")}
                  >
                    Customer view
                  </button>
                </div>
              </div>
              {audience === "team" ? (
                <>
                  <div className="v2-metrics">
                    <div>
                      <strong>
                        {cov.known}/{cov.total}
                      </strong>
                      <span>Required facts known</span>
                    </div>
                    <div>
                      <strong>{cov.confirmed}</strong>
                      <span>Confirmed by the customer</span>
                    </div>
                    <div>
                      <strong>{cov.clarifying}</strong>
                      <span>Awaiting clarification</span>
                    </div>
                    <div>
                      <strong>{cov.empty}</strong>
                      <span>Not received</span>
                    </div>
                  </div>
                  <div className="v2-overview-grid">
                    <section className="v2-panel v2-priority">
                      <div className="v2-section-head">
                        <div>
                          <p className="v2-eyebrow">PRIORITIZED FOR YOU</p>
                          <h2>Next actions</h2>
                        </div>
                      </div>
                      {actions.slice(0, 6).map((a) => (
                        <Action
                          key={a.id}
                          {...a}
                          onClick={() => goTarget(a.target)}
                        />
                      ))}
                      {!actions.length && (
                        <p className="v2-muted">
                          Nothing needs a decision right now.
                        </p>
                      )}
                    </section>
                    <StepTracker state={state} audience="team" />
                  </div>
                  {status.blockers.length > 0 && (
                    <section className="v2-panel">
                      <h2>What is holding this up</h2>
                      {status.blockers.map((b) => (
                        <p className="v2-blocker" key={b}>
                          ● {b}
                        </p>
                      ))}
                    </section>
                  )}
                </>
              ) : (
                <>
                  <p className="v2-muted">
                    This is what the customer sees: the same data, without
                    internal detail.
                  </p>
                  <StepTracker
                    state={state}
                    audience="customer"
                    role={undefined}
                  />
                  <section className="v2-panel">
                    <h2>What we are working on</h2>
                    <ul>
                      {actions.slice(0, 4).map((a) => (
                        <li key={a.id}>{friendly(a)}</li>
                      ))}
                      {!actions.length && <li>Preparing for launch.</li>}
                    </ul>
                    <p className="v2-muted">
                      Next update: weekly check-in on Friday. We will tell you
                      as soon as each item is done.
                    </p>
                    <button className="v2-link" onClick={() => go("portal")}>
                      Open the customer answer form →
                    </button>
                  </section>
                </>
              )}
            </>
          )}

          {view === "requirements" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">INTAKE SPEC</p>
                  <h1>What the agent needs to know</h1>
                  <p>
                    Twenty required facts in five areas. Each has a source, an
                    owner, a status and a separate approval.
                  </p>
                </div>
                <button
                  className="v2-button"
                  disabled={state.addedSources.includes(lateSource.id)}
                  onClick={() => {
                    update(addSource);
                    flash(
                      "A new source arrived. Two gaps were filled and the earlier consistency check is now out of date.",
                    );
                  }}
                >
                  {state.addedSources.includes(lateSource.id)
                    ? "Late email added"
                    : "＋ Simulate a late email"}
                </button>
              </div>
              <details className="v2-panel v2-sources">
                <summary>
                  <strong>Sources received ({allSources(state).length})</strong>
                </summary>
                {allSources(state).map((s) => (
                  <div key={s.id} className="v2-source-row">
                    <strong>{s.title}</strong>
                    <small>
                      {s.type} · {s.received} · from {s.suppliedBy} ·{" "}
                      <span
                        className={`v2-status ${s.parse === "Parsed" ? "green" : "amber"}`}
                      >
                        {s.parse}
                      </span>
                    </small>
                    {s.note && <small>{s.note}</small>}
                  </div>
                ))}
              </details>
              {areas.map((area) => (
                <section key={area} className="v2-area">
                  <h2>{area}</h2>
                  {state.facts
                    .filter((f) => f.area === area)
                    .map((f) => (
                      <FactCard
                        key={f.id}
                        state={state}
                        f={f}
                        focused={focusFact === f.id}
                        waiveNote={waiveNote[f.id] || ""}
                        setWaiveNote={(v) =>
                          setWaiveNote({ ...waiveNote, [f.id]: v })
                        }
                        onReview={() => update((s) => reviewFact(s, f.id))}
                        onConfigure={() =>
                          update((s) => markConfigured(s, f.id))
                        }
                        onWaive={() =>
                          update((s) =>
                            waiveFact(s, f.id, waiveNote[f.id] || ""),
                          )
                        }
                      />
                    ))}
                </section>
              ))}
            </>
          )}

          {view === "checks" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">CHECKS</p>
                  <h1>Do the sources, and our own prompts, agree?</h1>
                  <p>
                    Run the consistency check whenever new information arrives.
                    Conflicts go to the customer in one clarification batch.
                  </p>
                </div>
                <button
                  className="v2-button"
                  onClick={() => {
                    update(runConsistencyCheck);
                    flash("Consistency check run on the current sources.");
                  }}
                >
                  {report.ran ? "Run again" : "Run consistency check"}
                </button>
              </div>
              {report.stale && (
                <div className="v2-toast" role="status">
                  A new source arrived after the last check. Run it again before
                  relying on these results.
                </div>
              )}
              <section className="v2-panel">
                <h2>Consistency</h2>
                {!report.ran ? (
                  <p>
                    Not run yet. {report.claimsChecked} statements from{" "}
                    {report.sourcesChecked} sources are waiting to be compared.
                  </p>
                ) : (
                  <>
                    <p className="v2-muted">
                      {report.claimsChecked} statements from{" "}
                      {report.sourcesChecked} sources compared ·{" "}
                      {report.conflicts.length} conflicts · {report.open.length}{" "}
                      open · {report.variations.length} legitimate variation
                      {report.variations.length === 1 ? "" : "s"}
                    </p>
                    {report.conflicts.map((c) => {
                      const q = state.questions.find(
                        (x) => x.id === c.questionId,
                      );
                      return (
                        <div className="v2-conflict" key={c.id}>
                          <div className="v2-section-head">
                            <div>
                              <p className="v2-eyebrow">
                                {c.needs === "customer"
                                  ? "SOURCES DISAGREE"
                                  : "OUR OWN INSTRUCTIONS DISAGREE"}{" "}
                                · {c.scope.toUpperCase()}
                              </p>
                              <h3>{c.topicLabel}</h3>
                            </div>
                            <span
                              className={`v2-status ${c.resolved ? "green" : "amber"}`}
                            >
                              {c.resolved ? "Resolved" : "Open"}
                            </span>
                          </div>
                          {c.claimIds.map((id) => {
                            const claim = claims.find((x) => x.id === id)!;
                            const src = allSources(state).find(
                              (x) => x.id === claim.sourceId,
                            );
                            return (
                              <blockquote key={id}>
                                “{claim.quote}”
                                <small>
                                  {src?.title} · {claim.anchor}
                                </small>
                              </blockquote>
                            );
                          })}
                          {c.resolved ? (
                            <p>
                              <strong>
                                {c.resolution?.how === "internal fix"
                                  ? "Fixed in our draft"
                                  : c.resolution?.how === "default"
                                    ? "Proceeding on default (unconfirmed)"
                                    : "Customer answer approved"}
                                :
                              </strong>{" "}
                              {c.resolution?.note}
                            </p>
                          ) : c.needs === "customer" ? (
                            q &&
                            (q.status === "Resolved" ||
                              q.status === "Defaulted") ? (
                              <button
                                className="v2-button"
                                onClick={() =>
                                  update((s) => reopenQuestion(s, q.id))
                                }
                              >
                                New evidence: ask the customer again
                              </button>
                            ) : (
                              <a
                                className="v2-link"
                                href="#clarification-batch"
                              >
                                Ask the customer in the batch below ↓
                              </a>
                            )
                          ) : (
                            <div className="v2-fix">
                              <p>Which instruction is intended?</p>
                              {c.claimIds.map((id) => (
                                <label key={id}>
                                  <input
                                    type="radio"
                                    name={`fix-${c.id}`}
                                    checked={fixChoice[c.id] === id}
                                    onChange={() =>
                                      setFixChoice({ ...fixChoice, [c.id]: id })
                                    }
                                  />{" "}
                                  {claims.find((x) => x.id === id)?.value}
                                </label>
                              ))}
                              <label className="v2-field">
                                Reason, recorded with the fix
                                <input
                                  value={fixNote[c.id] || ""}
                                  onChange={(e) =>
                                    setFixNote({
                                      ...fixNote,
                                      [c.id]: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <button
                                className="v2-button"
                                disabled={
                                  !fixChoice[c.id] || !fixNote[c.id]?.trim()
                                }
                                onClick={() =>
                                  update((s) =>
                                    resolveInternally(
                                      s,
                                      c.id,
                                      fixChoice[c.id],
                                      fixNote[c.id],
                                    ),
                                  )
                                }
                              >
                                Record fix
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {report.variations.map((v) => (
                      <div className="v2-conflict calm" key={v.id}>
                        <p className="v2-eyebrow">
                          NOT A CONFLICT · DIFFERENT SCOPES
                        </p>
                        <h3>{v.topicLabel}</h3>
                        {v.claimIds.map((id) => {
                          const claim = claims.find((x) => x.id === id)!;
                          return (
                            <p key={id}>
                              <strong>{claim.scope}:</strong> {claim.value}
                            </p>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </section>

              <section className="v2-panel" id="clarification-batch">
                <p className="v2-eyebrow">ONE BATCH PER RECIPIENT</p>
                <h2>Clarification batch</h2>
                <p className="v2-muted">
                  Questions are ranked by whether they block launch.
                  Non-critical questions can carry a default if there is no
                  reply; critical ones never do.
                </p>
                {[...state.questions]
                  .sort(
                    (a, b) =>
                      Number(questionCritical(state, b)) -
                      Number(questionCritical(state, a)),
                  )
                  .map((q) => (
                    <QuestionCard
                      key={q.id}
                      q={q}
                      critical={questionCritical(state, q)}
                      onText={(text) =>
                        update((s) => updateQuestion(s, q.id, { text }))
                      }
                      onApprove={() =>
                        update((s) =>
                          updateQuestion(s, q.id, { status: "Ready to send" }),
                        )
                      }
                      onReview={() => {
                        update((s) => reviewAnswer(s, q.id));
                        flash(
                          "Answer approved. The linked facts are now customer-confirmed.",
                        );
                      }}
                      onDefault={() => {
                        update((s) => applyDefault(s, q.id));
                        flash(
                          "Deadline passed with no reply: proceeding on the default and flagging it as unconfirmed.",
                        );
                      }}
                    />
                  ))}
                {Object.keys(recipients).map((role) => {
                  const ready = state.questions.filter(
                    (q) =>
                      q.recipientRole === role && q.status === "Ready to send",
                  );
                  const name = recipients[role].name;
                  return (
                    <div className="v2-recipient" key={role}>
                      <strong>
                        {name} · {role}
                      </strong>
                      <div className="v2-actions">
                        <button
                          className="v2-button"
                          disabled={!ready.length}
                          onClick={() => {
                            update((s) =>
                              sendRequest(
                                s,
                                role,
                                ready.map((q) => q.id),
                              ),
                            );
                            setPortalRole(role);
                            flash(
                              `Simulated request created for ${name}. No email or link was generated.`,
                            );
                          }}
                        >
                          Simulate sending {ready.length || ""} question
                          {ready.length === 1 ? "" : "s"} to {name}
                        </button>
                        {sentQuestionIds(state, role).length > 0 && (
                          <button
                            className="v2-link"
                            onClick={() => {
                              setPortalRole(role);
                              go("portal");
                            }}
                          >
                            Open the customer answer form →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {view === "qa" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">QA &amp; LAUNCH</p>
                  <h1>Test cases and launch gate</h1>
                  <p>
                    Cases are generated from reviewed facts. This app does not
                    run them: a specialist tries each scenario and records the
                    result. Changing a fact marks its earlier results “Needs
                    retest”.
                  </p>
                </div>
              </div>
              <section className="v2-panel">
                <h2>Launch checklist</h2>
                <ul className="v2-checklist">
                  {checklist.map((c) => (
                    <li key={c.id} className={c.pass ? "pass" : "open"}>
                      <b>{c.pass ? "✓" : "○"}</b>
                      <span>
                        {c.label}
                        <small>{c.detail}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              {cases.length === 0 && (
                <section className="v2-panel">
                  <p>
                    No reviewed facts to test yet. Review facts in Requirements
                    first.
                  </p>
                </section>
              )}
              {state.facts
                .filter((f) => cases.some((t) => t.factId === f.id))
                .map((f) => {
                  const mine = cases.filter((t) => t.factId === f.id);
                  const passing = mine.filter(
                    (t) => testStatus(state, t) === "Pass",
                  ).length;
                  return (
                    <details
                      className="v2-panel v2-testgroup"
                      key={f.id}
                      open={mine.some((t) => t.critical) || undefined}
                    >
                      <summary>
                        <strong>
                          {f.id} · {f.label}
                        </strong>{" "}
                        <span className="v2-muted">
                          {passing} of {mine.length} passing
                          {f.critical ? " · critical" : ""}
                        </span>
                      </summary>
                      {mine.map((t) => {
                        const result = testStatus(state, t);
                        return (
                          <div className="v2-testcase" key={t.id}>
                            <div className="v2-section-head">
                              <div>
                                <p className="v2-eyebrow">
                                  {t.kind.toUpperCase()}
                                  {t.critical ? " · CRITICAL" : ""} · {t.id}
                                </p>
                                <p>{t.scenario}</p>
                              </div>
                              <span className={`v2-status ${tone(result)}`}>
                                {result}
                              </span>
                            </div>
                            <p>
                              <strong>Expected:</strong> {t.expected}
                            </p>
                            <label className="v2-field">
                              Note
                              <input
                                value={
                                  testNotes[t.id] ??
                                  state.tests[t.id]?.note ??
                                  ""
                                }
                                onChange={(e) =>
                                  setTestNotes({
                                    ...testNotes,
                                    [t.id]: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <div className="v2-actions">
                              <button
                                className="v2-button secondary"
                                onClick={() =>
                                  update((s) =>
                                    recordTest(
                                      s,
                                      t.id,
                                      "Pass",
                                      testNotes[t.id] ?? "",
                                    ),
                                  )
                                }
                              >
                                Record pass
                              </button>
                              <button
                                className="v2-button secondary"
                                onClick={() =>
                                  update((s) =>
                                    recordTest(
                                      s,
                                      t.id,
                                      "Fail",
                                      testNotes[t.id] ?? "",
                                    ),
                                  )
                                }
                              >
                                Record fail
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </details>
                  );
                })}
            </>
          )}

          {view === "process" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">PROCESS &amp; OUTCOMES</p>
                  <h1>How the work is going, and what to automate next</h1>
                  <p>
                    You can only automate what you can see. This tracks the
                    steps, repeated manual work and outcomes.
                  </p>
                </div>
              </div>
              <section className="v2-panel">
                <h2>Time per stage (illustrative)</h2>
                <ul className="v2-process">
                  {stageDays.map((s) => (
                    <li key={s.name}>
                      <span>{s.name}</span>
                      <b>{s.days}</b>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="v2-panel">
                <h2>Repeated manual work</h2>
                <p className="v2-muted">
                  Rule: once a step has been done by hand {AUTOMATION_THRESHOLD}{" "}
                  times, it becomes an automation candidate. Counts are earlier
                  onboardings (fictional) plus actions you take in this session.
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
              <section className="v2-panel">
                <h2>After launch: issues become tests (illustrative)</h2>
                {seedIssues.map((i) => {
                  const done = state.extraTests.some(
                    (t) => t.id === `T-${i.id}`,
                  );
                  return (
                    <div className="v2-issue" key={i.id}>
                      <span>{i.text}</span>
                      <button
                        className="v2-button secondary"
                        disabled={done}
                        onClick={() => update((s) => convertIssue(s, i.id))}
                      >
                        {done ? "Added to QA" : "Turn into a test case"}
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="v2-panel">
                <h2>Updates and export</h2>
                <div className="v2-actions">
                  <button
                    className="v2-button secondary"
                    onClick={() => setOutput(weeklyCheckIn(state))}
                  >
                    Draft the weekly check-in
                  </button>
                  <button
                    className="v2-button secondary"
                    onClick={() => setOutput(slackUpdate(state))}
                  >
                    Draft a Slack update
                  </button>
                  <button
                    className="v2-button secondary"
                    onClick={() =>
                      download(
                        "onboarding-rows.csv",
                        exportCsv(state),
                        "text/csv",
                      )
                    }
                  >
                    Download rows (CSV)
                  </button>
                  <button
                    className="v2-button secondary"
                    onClick={() =>
                      download(
                        "onboarding.json",
                        exportJson(state),
                        "application/json",
                      )
                    }
                  >
                    Download JSON
                  </button>
                </div>
                <p className="v2-muted">
                  Plain rows that a table tool such as Coda could import.
                  Nothing is sent anywhere.
                </p>
                {output && <pre className="v2-pre">{output}</pre>}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function StepTracker({
  state,
  audience,
  role,
}: {
  state: PrototypeState;
  audience: "team" | "customer";
  role?: string;
}) {
  const steps = onboardingSteps(state);
  const step = currentStep(state);
  const needs = needsFromCustomer(state, role);
  return (
    <section className="v2-panel v2-tracker" aria-label="Onboarding progress">
      <p className="v2-eyebrow">
        STEP {step.n} OF {steps.length} · {step.name.toUpperCase()}
      </p>
      <ol className="v2-steps">
        {steps.map((s) => (
          <li key={s.n} className={s.status.toLowerCase()}>
            <b>{s.status === "Done" ? "✓" : s.n}</b>
            <span>
              {s.name}
              <small>{s.detail}</small>
              {audience === "team" && s.status !== "Upcoming" && (
                <ul className="v2-pieces">
                  {s.pieces.map((p) => (
                    <li key={p.label} className={p.done ? "done" : ""}>
                      {p.done ? "✓" : "○"} {p.label}
                    </li>
                  ))}
                </ul>
              )}
            </span>
          </li>
        ))}
      </ol>
      {audience === "customer" && (
        <>
          <strong>What we need from you to unblock</strong>
          {needs.length ? (
            <ul>
              {needs.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="v2-muted">Nothing outstanding from you right now.</p>
          )}
        </>
      )}
    </section>
  );
}

function FactCard({
  state,
  f,
  focused,
  waiveNote,
  setWaiveNote,
  onReview,
  onConfigure,
  onWaive,
}: {
  state: PrototypeState;
  f: Fact;
  focused: boolean;
  waiveNote: string;
  setWaiveNote: (v: string) => void;
  onReview: () => void;
  onConfigure: () => void;
  onWaive: () => void;
}) {
  const life = f.waived ? "Waived" : shownLifecycle(state, f);
  const value = shownValue(f);
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
      <div className="v2-fact-head">
        <strong>
          <span className="v2-fact-id">{f.id}</span> {f.label}
          {f.critical && <span className="v2-critical"> critical</span>}
        </strong>
        <span className="v2-badges">
          <span className={`v2-status ${f.waived ? "gray" : tone(life)}`}>
            {life}
          </span>
          <span className={`v2-status ${tone(f.approval)}`}>{f.approval}</span>
        </span>
      </div>
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
      <small className="v2-muted">
        Owner {f.owner} · {source ? `${source} · ` : ""}
        {f.anchor}
      </small>
      {f.evidence && (
        <details className="v2-history">
          <summary>Evidence</summary>
          <p>“{f.evidence}”</p>
        </details>
      )}
      {(canReview || canConfigure || canWaive) && (
        <div className="v2-actions">
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
                value={waiveNote}
                onChange={(e) => setWaiveNote(e.target.value)}
              />
              <button
                className="v2-button secondary"
                disabled={!waiveNote.trim()}
                onClick={onWaive}
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

function QuestionCard({
  q,
  critical,
  onText,
  onApprove,
  onReview,
  onDefault,
}: {
  q: Question;
  critical: boolean;
  onText: (text: string) => void;
  onApprove: () => void;
  onReview: () => void;
  onDefault: () => void;
}) {
  const latest = q.revisions.at(-1);
  const pending = q.revisions.length > q.reviewedRevision;
  return (
    <div className="v2-question">
      <div className="v2-section-head">
        <div>
          <p className="v2-eyebrow">
            {q.recipientRole.toUpperCase()} ·{" "}
            {critical ? "BLOCKS LAUNCH" : "NON-CRITICAL"}
          </p>
          <h3>{q.title}</h3>
        </div>
        <span className={`v2-status ${tone(q.status)}`}>{q.status}</span>
      </div>
      {q.status === "AI draft" ? (
        <label className="v2-field">
          Question wording (AI draft, edit before approving)
          <textarea value={q.text} onChange={(e) => onText(e.target.value)} />
        </label>
      ) : (
        <p>{q.text}</p>
      )}
      <p className="v2-muted">Why we are asking: {q.why}</p>
      <ul className="v2-optionlist">
        {q.options.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      <p className="v2-muted">
        {q.defaultIfNoReply
          ? `Default if no reply by the deadline: ${q.defaultIfNoReply}.`
          : "No default: this needs a customer answer before launch."}
      </p>
      {pending && latest && (
        <div className="v2-answer">
          <strong>Customer reply (evidence, not yet approved):</strong>
          <p>
            {latest.kind === "answer"
              ? latest.value
              : latest.kind === "unknown"
                ? "I don’t know"
                : "Someone else should answer"}
          </p>
          {latest.kind === "answer" && (
            <button className="v2-button" onClick={onReview}>
              Approve instruction
            </button>
          )}
        </div>
      )}
      <div className="v2-actions">
        {q.status === "AI draft" && (
          <button className="v2-button secondary" onClick={onApprove}>
            Approve question wording
          </button>
        )}
        {q.status === "Sent" && q.defaultIfNoReply && !critical && (
          <button className="v2-button secondary" onClick={onDefault}>
            Simulate: no reply by the deadline
          </button>
        )}
      </div>
    </div>
  );
}

function Action({
  icon,
  tone: t,
  title,
  subtitle,
  owner,
  due,
  button,
  onClick,
}: NextAction & { onClick: () => void }) {
  return (
    <div className="v2-action-row">
      <span className={`v2-action-icon ${t}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <span className="v2-action-owner">{owner}</span>
      <span className="v2-action-due">{due}</span>
      <button className="v2-link" onClick={onClick}>
        {button} →
      </button>
    </div>
  );
}
