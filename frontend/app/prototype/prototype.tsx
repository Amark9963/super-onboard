"use client";

import { useEffect, useMemo, useState } from "react";
import {
  categories,
  initialState,
  packageFiles,
  readiness,
  reviewAnswer,
  sources,
  submitAnswer,
  updateQuestion,
  zipFiles,
  type Category,
  type PrototypeState,
} from "./state";

type View =
  | "projects"
  | "overview"
  | "sources"
  | "knowledge"
  | "clarifications"
  | "package"
  | "actions"
  | "portal";
const views: View[] = [
  "projects",
  "overview",
  "sources",
  "knowledge",
  "clarifications",
  "package",
  "actions",
  "portal",
];
const nav: { view: View; label: string; icon: string }[] = [
  { view: "overview", label: "Overview", icon: "◫" },
  { view: "sources", label: "Sources", icon: "▤" },
  { view: "knowledge", label: "Knowledge", icon: "◇" },
  { view: "clarifications", label: "Clarifications", icon: "◎" },
  { view: "package", label: "Setup Package", icon: "▣" },
];
const short = (value: string) => value.replace(" & ", " + ");

export default function Prototype() {
  const [view, setView] = useState<View>("projects");
  const [state, setState] = useState<PrototypeState>(initialState);
  const [category, setCategory] = useState<Category>("Goals");
  const [selectedKnowledge, setSelectedKnowledge] = useState("goal");
  const [selectedSource, setSelectedSource] = useState("sop");
  const [selectedQuestion, setSelectedQuestion] = useState("q-emergency");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([
    "q-emergency",
    "q-integration",
  ]);
  const [sourceChooser, setSourceChooser] = useState(false);
  const [sourceMethod, setSourceMethod] = useState("Upload files");
  const [sourceTitle, setSourceTitle] = useState("");
  const [localSources, setLocalSources] = useState<string[]>([]);
  const [sourceNote, setSourceNote] = useState("");
  const [portalAnswers, setPortalAnswers] = useState<Record<string, string>>(
    {},
  );
  const [portalKinds, setPortalKinds] = useState<
    Record<string, "answer" | "unknown" | "delegate">
  >({});
  const [portalComments, setPortalComments] = useState<Record<string, string>>(
    {},
  );
  const [portalReview, setPortalReview] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [packageSection, setPackageSection] = useState(
    "01-customer-overview.md",
  );
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const readHash = () => {
      const route = window.location.hash.slice(1) as View;
      if (views.includes(route)) setView(route);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);
  const go = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
    setMobileMenu(false);
    setToast("");
  };
  const flash = (message: string) => setToast(message);
  const status = readiness(state);
  const files = useMemo(() => packageFiles(state), [state]);
  const activeQuestion =
    state.questions.find((q) => q.id === selectedQuestion) ||
    state.questions[0];
  const activeKnowledge =
    state.knowledge.find((k) => k.id === selectedKnowledge) ||
    state.knowledge[0];
  const activeSource =
    sources.find((s) => s.id === selectedSource) || sources[0];
  const sentQuestions = state.questions.filter(
    (q) => state.requestSent && state.sentQuestionIds?.includes(q.id),
  );
  const responsesReceived = state.questions.filter(
    (q) => q.revisions.length > q.reviewedRevision,
  ).length;
  const reviewedCount = state.knowledge.filter((k) =>
    ["Internally reviewed", "Customer confirmed"].includes(k.status),
  ).length;

  function openCategory(next: Category) {
    setCategory(next);
    setSelectedKnowledge(
      state.knowledge.find((k) => k.category === next)?.id || "goal",
    );
    go("knowledge");
  }
  function openKnowledge(id: string) {
    const item = state.knowledge.find((k) => k.id === id);
    if (item) {
      setCategory(item.category);
      setSelectedKnowledge(id);
      go("knowledge");
    }
  }
  function toggleSelected(id: string) {
    setSelectedQuestions((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }
  function submitPortal() {
    const entries = sentQuestions.filter(
      (q) => portalKinds[q.id] || portalAnswers[q.id]?.trim(),
    );
    if (!entries.length) {
      flash(
        "Choose an answer, I don't know, or someone else should answer for at least one question.",
      );
      return;
    }
    let next = state;
    for (const q of entries)
      next = submitAnswer(
        next,
        q.id,
        portalAnswers[q.id] || "",
        portalKinds[q.id] || "answer",
        portalComments[q.id] || "",
      );
    setState(next);
    setPortalReview(false);
    setReceipt(
      `${entries.length} answer${entries.length === 1 ? "" : "s"} recorded in this simulated session. Your prior versions remain visible below.`,
    );
    setPortalAnswers({});
    setPortalKinds({});
    setPortalComments({});
  }
  function saveDraft() {
    flash(
      "Draft kept in this browser session only. No server or email is involved.",
    );
  }
  function downloadZip() {
    const bytes = zipFiles(files);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `oakwood-setup-package-prototype-r${state.knowledgeRevision}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setState((current) => ({
      ...current,
      packageSnapshot: current.knowledgeRevision,
    }));
    flash(
      "Deterministic prototype ZIP downloaded. No package was stored on a server.",
    );
  }

  if (view === "portal")
    return (
      <div className="v2-portal">
        <header className="v2-portal-header">
          <div className="v2-brandmark">
            so<span>.</span>
          </div>
          <span>Fictional customer review · simulated</span>
        </header>
        <main className="v2-portal-main">
          <button className="v2-link" onClick={() => go("clarifications")}>
            ← Return to specialist preview
          </button>
          {!state.requestSent ? (
            <div className="v2-empty">
              <h1>No review request in this demo yet.</h1>
              <p>
                Approve draft questions and simulate sending a grouped request
                from the Clarification Center.
              </p>
              <button onClick={() => go("clarifications")}>
                Open Clarification Center
              </button>
            </div>
          ) : (
            <>
              <p className="v2-eyebrow">OAKWOOD PROPERTY GROUP · FICTIONAL</p>
              <h1>Help us get your agent setup details right.</h1>
              <p className="v2-lede">
                Avery from the implementation team has a few questions about
                your operating instructions. Answer what you can; you can come
                back and revise while this simulated review is open.
              </p>
              <div className="v2-portal-intro">
                <span>
                  <strong>{sentQuestions.length}</strong> questions in one
                  request
                </span>
                <span>For Maya Chen · Operations lead</span>
                <span>Demo link · no email sent</span>
              </div>
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
                    .filter(
                      (q) => portalKinds[q.id] || portalAnswers[q.id]?.trim(),
                    )
                    .map((q) => (
                      <div className="v2-summary-row" key={q.id}>
                        <strong>{q.title}</strong>
                        <p>
                          {portalKinds[q.id] === "unknown"
                            ? "I don't know"
                            : portalKinds[q.id] === "delegate"
                              ? "Someone else should answer"
                              : portalAnswers[q.id]}
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
                      <label className="v2-field">
                        Your answer
                        <textarea
                          value={portalAnswers[q.id] || ""}
                          onChange={(event) => {
                            setPortalAnswers({
                              ...portalAnswers,
                              [q.id]: event.target.value,
                            });
                            setPortalKinds({
                              ...portalKinds,
                              [q.id]: "answer",
                            });
                          }}
                          placeholder="Write the policy or next step in your own words"
                        />
                      </label>
                      <div className="v2-choices">
                        <label>
                          <input
                            type="radio"
                            name={`kind-${q.id}`}
                            checked={portalKinds[q.id] === "unknown"}
                            onChange={() =>
                              setPortalKinds({
                                ...portalKinds,
                                [q.id]: "unknown",
                              })
                            }
                          />{" "}
                          I don&apos;t know
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`kind-${q.id}`}
                            checked={portalKinds[q.id] === "delegate"}
                            onChange={() =>
                              setPortalKinds({
                                ...portalKinds,
                                [q.id]: "delegate",
                              })
                            }
                          />{" "}
                          Someone else should answer
                        </label>
                      </div>
                      <label className="v2-field">
                        Optional comment
                        <input
                          value={portalComments[q.id] || ""}
                          onChange={(event) =>
                            setPortalComments({
                              ...portalComments,
                              [q.id]: event.target.value,
                            })
                          }
                          placeholder="Add context for the implementation team"
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
                                    ? "I don't know"
                                    : "Someone else should answer"}
                              </p>
                              {r.comment && <p>Comment: {r.comment}</p>}
                            </div>
                          ))}
                        </details>
                      )}
                    </section>
                  ))}
                  <div className="v2-portal-footer">
                    <p>
                      Your name and role are self-declared in the real workflow.
                      A review link does not verify identity or provide legal
                      authorization.
                    </p>
                    <div className="v2-actions">
                      <button
                        className="v2-button secondary"
                        onClick={saveDraft}
                      >
                        Save draft locally
                      </button>
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

  return (
    <div className="v2-app">
      <aside className={`v2-sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="v2-logo">
          <div className="v2-logo-icon">
            s<span>o</span>
          </div>
          <div>
            <strong>super onboard</strong>
            <small>PREPARATION WORKSPACE</small>
          </div>
        </div>
        <div className="v2-side-section">WORKSPACE</div>
        <button
          className={`v2-side-link ${view === "projects" ? "active" : ""}`}
          onClick={() => go("projects")}
        >
          <span>▦</span> Projects
        </button>
        <button
          className={`v2-side-link ${view === "actions" ? "active" : ""}`}
          onClick={() => go("actions")}
        >
          <span>☷</span> My Actions <b>{responsesReceived + 2}</b>
        </button>
        <div className="v2-side-section customer">OAKWOOD PROPERTY GROUP</div>
        {nav.map((item) => (
          <button
            key={item.view}
            className={`v2-side-link ${view === item.view ? "active" : ""}`}
            onClick={() => go(item.view)}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
        <div className="v2-sidebar-bottom">
          <span className="v2-avatar">AM</span>
          <div>
            <strong>Avery Morgan</strong>
            <small>Implementation specialist</small>
          </div>
          <span className="v2-more">···</span>
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
            <button onClick={() => go("projects")}>Projects</button>
            <span>/</span>
            <button onClick={() => go("overview")}>
              Oakwood Property Group
            </button>
            <span>/</span>
            <strong>
              {view === "actions"
                ? "My Actions"
                : view === "projects"
                  ? "Projects"
                  : nav.find((n) => n.view === view)?.label}
            </strong>
          </div>
          <div className="v2-top-meta">
            <span className="v2-live-dot" /> Simulated prototype{" "}
            <span className="v2-top-avatar">AM</span>
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
          {view === "projects" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">YOUR WORKSPACE</p>
                  <h1>Customer projects</h1>
                  <p>
                    See what needs attention across onboarding preparations.
                  </p>
                </div>
                <button
                  className="v2-button"
                  onClick={() =>
                    flash(
                      "New project creation is simulated in this frontend prototype.",
                    )
                  }
                >
                  ＋ New onboarding project
                </button>
              </div>
              <div
                className="v2-project-card"
                onClick={() => go("overview")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && go("overview")}
              >
                <div className="v2-project-logo">O</div>
                <div className="v2-project-main">
                  <p className="v2-eyebrow">
                    RESIDENTIAL PROPERTY MANAGEMENT · FICTIONAL
                  </p>
                  <h2>Oakwood Property Group</h2>
                  <p>Inbound resident assistant · Maple Grove + Willow Court</p>
                  <div className="v2-project-meta">
                    <span>Avery Morgan · Owner</span>
                    <span>Last activity Oct 28</span>
                    <span>
                      {
                        state.questions.filter((q) => q.status !== "Resolved")
                          .length
                      }{" "}
                      open questions
                    </span>
                  </div>
                </div>
                <div className="v2-project-right">
                  <span className="v2-status amber">
                    {status.ready
                      ? "Ready for preparation"
                      : "Preparation incomplete"}
                  </span>
                  <strong>{status.critical} critical blockers</strong>
                  <span className="v2-link">Open project →</span>
                </div>
              </div>
            </>
          )}
          {view === "overview" && (
            <>
              <div className="v2-hero">
                <div>
                  <p className="v2-eyebrow">CUSTOMER OVERVIEW · FICTIONAL</p>
                  <h1>Oakwood Property Group</h1>
                  <p>
                    An inbound resident assistant that handles common questions
                    and routes urgent issues to the right human team.
                  </p>
                  <div className="v2-hero-meta">
                    <span>
                      Owner <strong>Avery Morgan</strong>
                    </span>
                    <span>
                      Scope <strong>2 properties</strong>
                    </span>
                    <span>
                      Stage{" "}
                      <strong>
                        {status.ready
                          ? "Ready for configuration preparation"
                          : "Knowledge review"}
                      </strong>
                    </span>
                  </div>
                </div>
                <button
                  className="v2-button light"
                  onClick={() => {
                    setSourceChooser(true);
                    go("sources");
                  }}
                >
                  ＋ Add customer information
                </button>
              </div>
              <div className="v2-metrics">
                <div>
                  <strong>{sources.length + localSources.length}</strong>
                  <span>Sources received</span>
                </div>
                <div>
                  <strong>{state.knowledge.length - reviewedCount}</strong>
                  <span>Items needing review</span>
                </div>
                <div>
                  <strong>
                    {
                      state.questions.filter(
                        (q) =>
                          q.status === "Sent" ||
                          q.status === "Response received",
                      ).length
                    }
                  </strong>
                  <span>Customer questions waiting</span>
                </div>
                <div>
                  <strong>{status.critical}</strong>
                  <span>Critical information blockers</span>
                </div>
              </div>
              <div className="v2-overview-grid">
                <section className="v2-panel v2-priority">
                  <div className="v2-section-head">
                    <div>
                      <p className="v2-eyebrow">PRIORITIZED FOR YOU</p>
                      <h2>Next actions</h2>
                    </div>
                    <button className="v2-link" onClick={() => go("actions")}>
                      View all →
                    </button>
                  </div>
                  {!status.ready && (
                    <Action
                      icon="!"
                      tone="red"
                      title="Confirm weekend emergency route"
                      subtitle="Conflicting SOP and call notes · Maple Grove"
                      owner="Avery Morgan"
                      due="Due today"
                      button="Resolve"
                      onClick={() => go("clarifications")}
                    />
                  )}
                  {responsesReceived > 0 && (
                    <Action
                      icon="↺"
                      tone="orange"
                      title="Review updated customer answer"
                      subtitle="The linked instruction requires a new specialist decision"
                      owner="Avery Morgan"
                      due="New reply"
                      button="Review"
                      onClick={() => go("clarifications")}
                    />
                  )}
                  <Action
                    icon="◇"
                    tone="blue"
                    title="Review pet-policy variation"
                    subtitle="Separate property scopes · source evidence available"
                    owner="Avery Morgan"
                    due="Oct 31"
                    button="Review"
                    onClick={() => openKnowledge("pets")}
                  />
                  <Action
                    icon="▤"
                    tone="green"
                    title="Request a readable move-in checklist"
                    subtitle="Scanned PDF needs attention"
                    owner="Avery Morgan"
                    due="Nov 2"
                    button="Open source"
                    onClick={() => {
                      setSelectedSource("scan");
                      go("sources");
                    }}
                  />
                </section>
                <section className="v2-panel v2-readiness">
                  <p className="v2-eyebrow">CONFIGURATION PREPARATION</p>
                  <h2>
                    {status.ready
                      ? "Ready for configuration preparation"
                      : "Preparation incomplete"}
                  </h2>
                  <p>
                    Known tasks completed{" "}
                    <strong>{status.ready ? "75%" : "42%"}</strong>
                  </p>
                  <div className="v2-progress">
                    <span style={{ width: status.ready ? "75%" : "42%" }} />
                  </div>
                  <small>
                    This tracks known tasks, not onboarding completeness or
                    launch readiness.
                  </small>
                  <div className="v2-divider" />
                  <strong>What is holding this up</strong>
                  {status.blockers.map((b) => (
                    <p className="v2-blocker" key={b}>
                      ● {b}
                    </p>
                  ))}
                  <button className="v2-link" onClick={() => go("package")}>
                    Review package readiness →
                  </button>
                </section>
              </div>
              <section className="v2-coverage">
                <div className="v2-section-head">
                  <div>
                    <p className="v2-eyebrow">FIVE KNOWLEDGE AREAS</p>
                    <h2>Knowledge coverage</h2>
                  </div>
                  <button className="v2-link" onClick={() => go("knowledge")}>
                    Explore all →
                  </button>
                </div>
                <div className="v2-category-grid">
                  {categories.map((cat, i) => {
                    const items = state.knowledge.filter(
                      (k) => k.category === cat,
                    );
                    const reviewed = items.filter((k) =>
                      ["Internally reviewed", "Customer confirmed"].includes(
                        k.status,
                      ),
                    ).length;
                    return (
                      <button
                        className="v2-category-card"
                        key={cat}
                        onClick={() => openCategory(cat)}
                      >
                        <span className="v2-category-icon">
                          {["◎", "↗", "▤", "◈", "⌘"][i]}
                        </span>
                        <strong>{cat}</strong>
                        <small>
                          {reviewed} reviewed · {items.length - reviewed}{" "}
                          awaiting
                        </small>
                        <span className="v2-card-arrow">↗</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="v2-bottom-grid">
                <section className="v2-panel">
                  <div className="v2-section-head">
                    <h2>Recent activity</h2>
                    <span>Fictional demo</span>
                  </div>
                  <div className="v2-timeline">
                    <p>
                      <b>●</b> Kickoff call transcript parsed{" "}
                      <small>Oct 28</small>
                    </p>
                    <p>
                      <b>●</b> Emergency routing conflict flagged{" "}
                      <small>Oct 27</small>
                    </p>
                    <p>
                      <b>●</b> Resident FAQ internally reviewed{" "}
                      <small>Oct 26</small>
                    </p>
                  </div>
                </section>
                <section className="v2-panel">
                  <div className="v2-section-head">
                    <h2>Latest setup package</h2>
                    <span className="v2-status amber">
                      {state.packageSnapshot === 0
                        ? "Not exported"
                        : status.stale
                          ? "Outdated"
                          : "Current"}
                    </span>
                  </div>
                  <p>
                    {state.packageSnapshot === 0
                      ? "No package downloaded yet"
                      : `Prototype export r${state.packageSnapshot}`}{" "}
                    · Deterministic Markdown
                  </p>
                  <p className="v2-muted">
                    Unresolved operational rules are excluded from agent-facing
                    sections.
                  </p>
                  <button className="v2-link" onClick={() => go("package")}>
                    Preview package →
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "actions" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">MY ACTIONS</p>
                  <h1>Work that needs a decision</h1>
                  <p>
                    Task status stays separate from whether knowledge is
                    reviewed or confirmed.
                  </p>
                </div>
              </div>
              <section className="v2-panel">
                <Action
                  icon="!"
                  tone="red"
                  title="Confirm weekend emergency route"
                  subtitle="Critical information blocker · Maple Grove"
                  owner="Avery Morgan"
                  due="Due today"
                  button="Open"
                  onClick={() => go("clarifications")}
                />
                {responsesReceived > 0 && (
                  <Action
                    icon="↺"
                    tone="orange"
                    title="Review customer answer"
                    subtitle="Response is evidence; specialist approval is still required"
                    owner="Avery Morgan"
                    due="New reply"
                    button="Review"
                    onClick={() => go("clarifications")}
                  />
                )}
                <Action
                  icon="◇"
                  tone="blue"
                  title="Review pet-policy variation"
                  subtitle="Source-backed candidate, not customer confirmed"
                  owner="Avery Morgan"
                  due="Oct 31"
                  button="Review"
                  onClick={() => openKnowledge("pets")}
                />
                <Action
                  icon="▤"
                  tone="green"
                  title="Get readable move-in checklist"
                  subtitle="Scanned PDF cannot be parsed in this prototype"
                  owner="Avery Morgan"
                  due="Nov 2"
                  button="Open"
                  onClick={() => {
                    setSelectedSource("scan");
                    go("sources");
                  }}
                />
              </section>
            </>
          )}
          {view === "sources" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">SOURCE LIBRARY</p>
                  <h1>Customer information</h1>
                  <p>
                    Originals, processing, AI extraction and staff review are
                    separate steps.
                  </p>
                </div>
                <button
                  className="v2-button"
                  onClick={() => setSourceChooser(true)}
                >
                  ＋ Add customer information
                </button>
              </div>
              {sourceChooser && (
                <div
                  className="v2-chooser"
                  role="dialog"
                  aria-label="Add customer information"
                >
                  <div className="v2-section-head">
                    <h2>Add customer information</h2>
                    <button
                      className="v2-icon-button"
                      aria-label="Close"
                      onClick={() => setSourceChooser(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="v2-chooser-options">
                    {[
                      "Upload files",
                      "Paste transcript",
                      "Import website",
                      "Add call/email note",
                    ].map((item) => (
                      <button
                        key={item}
                        className={sourceMethod === item ? "selected" : ""}
                        onClick={() => setSourceMethod(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <p className="v2-muted">
                    Simulated form · no file is uploaded, no site is fetched,
                    and nothing is saved on a server.
                  </p>
                  <label className="v2-field">
                    Source title
                    <input
                      value={sourceTitle}
                      onChange={(e) => setSourceTitle(e.target.value)}
                      placeholder={
                        sourceMethod === "Import website"
                          ? "Fictional website snapshot"
                          : "Name this source"
                      }
                    />
                  </label>
                  <button
                    className="v2-button"
                    disabled={!sourceTitle.trim()}
                    onClick={() => {
                      setLocalSources([...localSources, sourceTitle.trim()]);
                      setSourceTitle("");
                      setSourceChooser(false);
                      flash(
                        `“${sourceTitle}” added to this session as a simulated source. Parsing and extraction have not run.`,
                      );
                    }}
                  >
                    Add simulated source
                  </button>
                </div>
              )}
              <div className="v2-source-layout">
                <div className="v2-source-list">
                  <div className="v2-source-toolbar">
                    <strong>
                      {sources.length + localSources.length} sources
                    </strong>
                    <button
                      className="v2-link"
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          sourceRun: sources
                            .filter((x) => x.extraction.includes("candidates"))
                            .filter((x) => x.extraction !== "Zero candidates")
                            .map((x) => x.id),
                        }));
                        flash(
                          "Simulated per-source extraction jobs finished. Existing candidate counts remain examples; no AI call occurred.",
                        );
                      }}
                    >
                      Run simulated extract all
                    </button>
                  </div>
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      className={`v2-source-row ${selectedSource === source.id ? "selected" : ""}`}
                      onClick={() => setSelectedSource(source.id)}
                    >
                      <span
                        className={`v2-file-icon ${source.icon.toLowerCase()}`}
                      >
                        {source.icon}
                      </span>
                      <span className="v2-source-row-main">
                        <strong>{source.title}</strong>
                        <small>
                          {source.type} · {source.received}
                        </small>
                        <span className="v2-source-state">
                          {source.parse} <i>·</i>{" "}
                          {state.sourceRun.includes(source.id)
                            ? "Simulated extraction finished"
                            : source.extraction}
                        </span>
                      </span>
                      <span>›</span>
                    </button>
                  ))}
                  {localSources.map((title, i) => (
                    <div className="v2-source-row" key={`${title}-${i}`}>
                      <span className="v2-file-icon">NEW</span>
                      <span className="v2-source-row-main">
                        <strong>{title}</strong>
                        <small>Simulated session source</small>
                        <span className="v2-source-state">
                          Stored locally · parsing not run · extraction not run
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="v2-source-detail">
                  <div className="v2-source-detail-head">
                    <span
                      className={`v2-file-icon ${activeSource.icon.toLowerCase()}`}
                    >
                      {activeSource.icon}
                    </span>
                    <div>
                      <p className="v2-eyebrow">SOURCE DETAIL</p>
                      <h2>{activeSource.title}</h2>
                      <p>
                        {activeSource.type} · Version 1 · {activeSource.scope}
                      </p>
                    </div>
                  </div>
                  <div className="v2-source-steps">
                    <div>
                      <small>01 · Storage</small>
                      <strong>Stored</strong>
                    </div>
                    <div>
                      <small>02 · Parsing</small>
                      <strong>{activeSource.parse}</strong>
                    </div>
                    <div>
                      <small>03 · AI extraction</small>
                      <strong>
                        {state.sourceRun.includes(activeSource.id)
                          ? "Simulated finish"
                          : activeSource.extraction}
                      </strong>
                    </div>
                    <div>
                      <small>04 · Staff review</small>
                      <strong>{activeSource.review}</strong>
                    </div>
                  </div>
                  <p className="v2-muted">
                    Supplied by {activeSource.suppliedBy} · Received{" "}
                    {activeSource.received}
                  </p>
                  <div className="v2-evidence">
                    <div className="v2-section-head">
                      <strong>Example source excerpt</strong>
                      <span>{activeSource.anchor}</span>
                    </div>
                    <blockquote>{activeSource.excerpt}</blockquote>
                  </div>
                  {activeSource.note && (
                    <div className="v2-warning">{activeSource.note}</div>
                  )}
                  <div className="v2-actions">
                    <button
                      className="v2-button secondary"
                      onClick={() => {
                        setSourceNote(
                          `Simulated retry recorded for ${activeSource.title}. No parser or model ran.`,
                        );
                      }}
                    >
                      Retry this step (demo)
                    </button>
                    <button
                      className="v2-button"
                      onClick={() => {
                        setCategory("Team & Routing");
                        go("knowledge");
                      }}
                    >
                      View linked knowledge →
                    </button>
                  </div>
                  {sourceNote && <p className="v2-muted">{sourceNote}</p>}
                </div>
              </div>
            </>
          )}
          {view === "knowledge" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">KNOWLEDGE WORKSPACE</p>
                  <h1>What we know, and why</h1>
                  <p>
                    Five categories with evidence beside each interpretation. A
                    matched quote is not customer confirmation.
                  </p>
                </div>
                <button
                  className="v2-button secondary"
                  onClick={() =>
                    flash(
                      "Manual knowledge entry is a simulated prototype control; no source record was created.",
                    )
                  }
                >
                  ＋ Add manual note
                </button>
              </div>
              <div
                className="v2-tabs"
                role="tablist"
                aria-label="Knowledge categories"
              >
                {categories.map((item) => (
                  <button
                    role="tab"
                    aria-selected={category === item}
                    className={category === item ? "active" : ""}
                    key={item}
                    onClick={() => {
                      setCategory(item);
                      setSelectedKnowledge(
                        state.knowledge.find((k) => k.category === item)?.id ||
                          "goal",
                      );
                    }}
                  >
                    {short(item)}
                  </button>
                ))}
              </div>
              <div className="v2-knowledge-layout">
                <div className="v2-knowledge-list">
                  {state.knowledge
                    .filter((k) => k.category === category)
                    .map((item) => (
                      <button
                        key={item.id}
                        className={`v2-knowledge-card ${selectedKnowledge === item.id ? "selected" : ""}`}
                        onClick={() => setSelectedKnowledge(item.id)}
                      >
                        <div className="v2-card-top">
                          <span>{item.scope}</span>
                          <span
                            className={`v2-status ${item.status === "Customer confirmed" ? "green" : item.status === "Needs clarification" ? "red" : "amber"}`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                        <small>
                          Assignee: {item.assignee} · 1 linked source
                        </small>
                      </button>
                    ))}
                </div>
                <div className="v2-knowledge-detail">
                  <p className="v2-eyebrow">
                    {activeKnowledge.category.toUpperCase()} ·{" "}
                    {activeKnowledge.scope.toUpperCase()}
                  </p>
                  <h2>{activeKnowledge.title}</h2>
                  <p>{activeKnowledge.detail}</p>
                  <div className="v2-detail-grid">
                    <div>
                      <small>Knowledge state</small>
                      <strong>{activeKnowledge.status}</strong>
                    </div>
                    <div>
                      <small>Internal assignee</small>
                      <strong>{activeKnowledge.assignee}</strong>
                    </div>
                    <div>
                      <small>Extraction</small>
                      <strong>Example AI candidate</strong>
                    </div>
                    <div>
                      <small>Customer confirmation</small>
                      <strong>
                        {activeKnowledge.status === "Customer confirmed"
                          ? "Recorded after staff approval"
                          : "Not recorded"}
                      </strong>
                    </div>
                  </div>
                  <div className="v2-evidence">
                    <p className="v2-eyebrow">
                      SOURCE EVIDENCE · QUOTE MATCHED
                    </p>
                    <blockquote>{activeKnowledge.evidence}</blockquote>
                    <span>{activeKnowledge.anchor}</span>
                    <button
                      className="v2-link"
                      onClick={() => {
                        setSelectedSource(activeKnowledge.sourceId);
                        go("sources");
                      }}
                    >
                      Open source →
                    </button>
                  </div>
                  {activeKnowledge.critical &&
                    activeKnowledge.status !== "Customer confirmed" && (
                      <div className="v2-warning">
                        <strong>Operational instruction blocked.</strong> The
                        quote exists in the source, but the applicable route is
                        disputed and cannot enter the agent-facing package.
                      </div>
                    )}
                  <div className="v2-actions">
                    {activeKnowledge.status === "Needs review" && (
                      <button
                        className="v2-button"
                        onClick={() => {
                          setState((s) => ({
                            ...s,
                            knowledge: s.knowledge.map((k) =>
                              k.id === activeKnowledge.id
                                ? { ...k, status: "Internally reviewed" }
                                : k,
                            ),
                            knowledgeRevision: s.knowledgeRevision + 1,
                          }));
                          flash(
                            "Internal review recorded in this simulated session. This is not a customer confirmation.",
                          );
                        }}
                      >
                        Mark internally reviewed
                      </button>
                    )}
                    <button
                      className="v2-button secondary"
                      onClick={() => {
                        setSelectedQuestion(
                          activeKnowledge.id === "integration"
                            ? "q-integration"
                            : activeKnowledge.id === "pets"
                              ? "q-pets"
                              : "q-emergency",
                        );
                        go("clarifications");
                      }}
                    >
                      Open clarification →
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "clarifications" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">CLARIFICATION CENTER</p>
                  <h1>Ask the right question</h1>
                  <p>
                    AI-drafted examples require specialist review. Questions are
                    grouped by verified recipient before a simulated send.
                  </p>
                </div>
                <button
                  className="v2-button secondary"
                  onClick={() => go("portal")}
                >
                  Open customer portal preview ↗
                </button>
              </div>
              <div className="v2-clarify-layout">
                <div className="v2-question-list">
                  <div className="v2-section-head">
                    <h2>Questions</h2>
                    <span>{state.questions.length} total</span>
                  </div>
                  {state.questions.map((q) => (
                    <button
                      key={q.id}
                      className={`v2-question-row ${selectedQuestion === q.id ? "selected" : ""}`}
                      onClick={() => setSelectedQuestion(q.id)}
                    >
                      <span
                        className={`v2-question-dot ${q.status === "Resolved" ? "green" : q.status === "AI draft" ? "amber" : "blue"}`}
                      />
                      <span>
                        <strong>{q.title}</strong>
                        <small>
                          {q.status} · {q.recipientRole}
                        </small>
                      </span>
                      <span>›</span>
                    </button>
                  ))}
                </div>
                <div className="v2-question-detail">
                  <div className="v2-section-head">
                    <p className="v2-eyebrow">
                      QUESTION DETAIL · {activeQuestion.id.toUpperCase()}
                    </p>
                    <span className="v2-status amber">
                      {activeQuestion.status}
                    </span>
                  </div>
                  <h2>{activeQuestion.title}</h2>
                  <div className="v2-ai-note">
                    <span>✦</span>
                    <div>
                      <strong>AI-drafted example · simulated</strong>
                      <p>{activeQuestion.why}</p>
                      <small>Evidence: {activeQuestion.source}</small>
                    </div>
                  </div>
                  <label className="v2-field">
                    Customer-friendly question
                    <textarea
                      value={activeQuestion.text}
                      disabled={
                        !(["AI draft", "Ready to send"] as string[]).includes(
                          activeQuestion.status,
                        )
                      }
                      onChange={(e) =>
                        setState((s) =>
                          updateQuestion(s, activeQuestion.id, {
                            text: e.target.value,
                            status: "AI draft",
                          }),
                        )
                      }
                    />
                  </label>
                  <div className="v2-detail-grid">
                    <div>
                      <small>Suggested recipient role</small>
                      <strong>{activeQuestion.recipientRole}</strong>
                    </div>
                    <div>
                      <small>Linked knowledge</small>
                      <strong>
                        {activeQuestion.knowledgeIds.length} items
                      </strong>
                    </div>
                  </div>
                  <div className="v2-actions">
                    {activeQuestion.status === "AI draft" && (
                      <button
                        className="v2-button"
                        onClick={() => {
                          if (!activeQuestion.text.trim()) return;
                          setState((s) =>
                            updateQuestion(s, activeQuestion.id, {
                              status: "Ready to send",
                            }),
                          );
                          flash(
                            "Staff reviewed the question wording. No customer message was sent.",
                          );
                        }}
                      >
                        Approve question wording
                      </button>
                    )}
                    {activeQuestion.status === "Ready to send" && (
                      <button
                        className="v2-button secondary"
                        onClick={() =>
                          setState((s) =>
                            updateQuestion(s, activeQuestion.id, {
                              status: "AI draft",
                            }),
                          )
                        }
                      >
                        Return to draft
                      </button>
                    )}
                    {activeQuestion.knowledgeIds.map((id) => (
                      <button
                        className="v2-link"
                        key={id}
                        onClick={() => openKnowledge(id)}
                      >
                        View {state.knowledge.find((k) => k.id === id)?.title} →
                      </button>
                    ))}
                  </div>
                  {activeQuestion.revisions.length > 0 && (
                    <div className="v2-response-review">
                      <p className="v2-eyebrow">
                        CUSTOMER RESPONSE · SELF-DECLARED IDENTITY
                      </p>
                      <h3>
                        {activeQuestion.revisions.length >
                        activeQuestion.reviewedRevision
                          ? "Updated answer — review required"
                          : "Latest reviewed answer"}
                      </h3>
                      <blockquote>
                        {activeQuestion.revisions.at(-1)?.kind === "answer"
                          ? activeQuestion.revisions.at(-1)?.value
                          : activeQuestion.revisions.at(-1)?.kind === "unknown"
                            ? "I don't know"
                            : "Someone else should answer"}
                      </blockquote>
                      <p className="v2-muted">
                        Revision {activeQuestion.revisions.length} · Earlier
                        revisions retained · Recipient identity not verified by
                        this demo.
                      </p>
                      {activeQuestion.revisions.at(-1)?.kind === "answer" &&
                        activeQuestion.reviewedRevision <
                          activeQuestion.revisions.length && (
                          <>
                            <div className="v2-warning">
                              An expiring login-free link proves possession of
                              the link, not the respondent&apos;s identity.
                              Review the linked source, scope and response
                              revision before approving any high-impact
                              instruction.
                            </div>
                            <button
                              className="v2-button"
                              onClick={() => {
                                setState((s) =>
                                  reviewAnswer(s, activeQuestion.id),
                                );
                                flash(
                                  activeQuestion.id === "q-emergency"
                                    ? "Specialist approval recorded in this simulated session; linked emergency knowledge is now customer confirmed."
                                    : "Response reviewed in this simulated session. Linked knowledge updated.",
                                );
                              }}
                            >
                              {activeQuestion.id === "q-emergency"
                                ? "Approve instruction"
                                : "Accept response and update knowledge"}
                            </button>
                          </>
                        )}
                      <details className="v2-history">
                        <summary>View all response revisions</summary>
                        {activeQuestion.revisions.map((r, i) => (
                          <p key={i}>
                            <strong>{r.at}</strong> —{" "}
                            {r.kind === "answer" ? r.value : r.kind}
                          </p>
                        ))}
                      </details>
                    </div>
                  )}
                </div>
              </div>
              <section className="v2-panel v2-group-request">
                <div className="v2-section-head">
                  <div>
                    <p className="v2-eyebrow">ONE RECIPIENT · ONE REQUEST</p>
                    <h2>Group a customer review</h2>
                  </div>
                  <span className="v2-status blue">Simulated delivery</span>
                </div>
                <p>
                  Select staff-approved questions for Maya Chen, Operations
                  lead. The customer sees only selected wording and minimal
                  context.
                </p>
                <div className="v2-group-list">
                  {state.questions
                    .filter((q) => q.recipientRole === "Operations lead")
                    .map((q) => (
                      <label key={q.id}>
                        <input
                          type="checkbox"
                          checked={selectedQuestions.includes(q.id)}
                          onChange={() => toggleSelected(q.id)}
                        />{" "}
                        <span>
                          {q.title}
                          <small>{q.status}</small>
                        </span>
                      </label>
                    ))}
                </div>
                <div className="v2-actions">
                  <button
                    className="v2-button secondary"
                    onClick={() =>
                      flash(
                        `Preview: ${selectedQuestions.filter((id) => state.questions.find((q) => q.id === id)?.status === "Ready to send").length} staff-approved questions selected for Maya Chen. No email sent.`,
                      )
                    }
                  >
                    Preview shared request
                  </button>
                  <button
                    className="v2-button"
                    disabled={
                      state.requestSent ||
                      !selectedQuestions.some(
                        (id) =>
                          state.questions.find((q) => q.id === id)?.status ===
                          "Ready to send",
                      )
                    }
                    onClick={() => {
                      const approved = selectedQuestions.filter(
                        (id) =>
                          state.questions.find((q) => q.id === id)?.status ===
                          "Ready to send",
                      );
                      setSelectedQuestions(approved);
                      setState((s) => ({
                        ...s,
                        requestSent: true,
                        sentQuestionIds: approved,
                        questions: s.questions.map((q) =>
                          approved.includes(q.id)
                            ? { ...q, status: "Sent" }
                            : q,
                        ),
                      }));
                      flash(
                        "Simulated request created. No email, token, or backend link was generated. Open the local portal preview.",
                      );
                    }}
                  >
                    Simulate sending grouped request
                  </button>
                  {state.requestSent && (
                    <button className="v2-link" onClick={() => go("portal")}>
                      Open local customer portal →
                    </button>
                  )}
                </div>
              </section>
            </>
          )}
          {view === "package" && (
            <>
              <div className="v2-page-head">
                <div>
                  <p className="v2-eyebrow">AGENT SETUP PACKAGE</p>
                  <h1>Prepared for a human handoff</h1>
                  <p>
                    Deterministic Markdown from eligible knowledge. This does
                    not configure, test, or launch an agent.
                  </p>
                </div>
                <button className="v2-button" onClick={downloadZip}>
                  ↓ Download prototype ZIP
                </button>
              </div>
              <div
                className={`v2-package-banner ${status.ready ? "ready" : "blocked"}`}
              >
                <div>
                  <p className="v2-eyebrow">
                    PREVIEW R{state.knowledgeRevision} · TEMPLATE PROTOTYPE-1
                  </p>
                  <h2>
                    {status.stale
                      ? "Previous download outdated — regenerate"
                      : status.ready
                        ? "Ready for configuration preparation"
                        : "Draft — preparation incomplete"}
                  </h2>
                  <p>
                    {status.ready
                      ? "Critical information has a reviewed customer answer. Downstream setup remains manual."
                      : "Critical information blockers keep disputed instructions out of operational sections."}
                  </p>
                </div>
                <span>
                  {status.stale
                    ? "OUTDATED"
                    : status.ready
                      ? "REVIEWED"
                      : "DRAFT"}
                </span>
              </div>
              <div className="v2-package-layout">
                <div className="v2-package-files">
                  <h3>Package files</h3>
                  {Object.keys(files).map((name) => (
                    <button
                      className={packageSection === name ? "selected" : ""}
                      key={name}
                      onClick={() => setPackageSection(name)}
                    >
                      <span>▤</span>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="v2-package-preview">
                  <div className="v2-section-head">
                    <div>
                      <p className="v2-eyebrow">READ-ONLY PREVIEW</p>
                      <h2>{packageSection}</h2>
                    </div>
                    <button
                      className="v2-link"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(files[packageSection])
                          .then(
                            () =>
                              flash(
                                "Markdown copied from this simulated prototype.",
                              ),
                            () =>
                              flash("Clipboard unavailable in this browser."),
                          );
                      }}
                    >
                      Copy section ↗
                    </button>
                  </div>
                  <pre>{files[packageSection]}</pre>
                </div>
              </div>
              <section className="v2-panel v2-open-items">
                <div className="v2-section-head">
                  <div>
                    <p className="v2-eyebrow">OPEN ITEMS</p>
                    <h2>What still needs a decision</h2>
                  </div>
                  <span>{status.blockers.length} critical</span>
                </div>
                {status.blockers.map((b) => (
                  <Action
                    key={b}
                    icon="!"
                    tone="red"
                    title={b}
                    subtitle="Owned by Avery Morgan · blocks preparation"
                    owner="Avery Morgan"
                    due="Open"
                    button="Review"
                    onClick={() => go("clarifications")}
                  />
                ))}
                <Action
                  icon="↗"
                  tone="blue"
                  title="Connect PMS through approved setup process"
                  subtitle="Downstream dependency · no credentials stored here"
                  owner="Implementation team"
                  due="Later"
                  button="View"
                  onClick={() => openKnowledge("integration")}
                />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Action({
  icon,
  tone,
  title,
  subtitle,
  owner,
  due,
  button,
  onClick,
}: {
  icon: string;
  tone: string;
  title: string;
  subtitle: string;
  owner: string;
  due: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="v2-action-row">
      <span className={`v2-action-icon ${tone}`}>{icon}</span>
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
