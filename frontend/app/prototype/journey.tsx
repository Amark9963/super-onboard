"use client";

import { useState, type ReactNode } from "react";
import {
  allSources,
  areas,
  assignments,
  claims,
  configurable,
  consistencyReport,
  contactByName,
  convertIssue,
  coverage,
  coverageOf,
  currentStep,
  factById,
  isConfirmed,
  launchChecklist,
  markConfigured,
  needsReview,
  nextActions,
  onboardingSteps,
  prereqItems,
  questionCritical,
  readiness,
  recipientsInUse,
  recordTest,
  reopenQuestion,
  requestReadableCopy,
  resolveInternally,
  reviewAnswer,
  reviewSource,
  routingTable,
  runConsistencyCheck,
  seedIssues,
  sendDocumentRequest,
  sendRequest,
  sentQuestionIds,
  shownLifecycle,
  shownValue,
  slackUpdate,
  sourceCatalog,
  testCases,
  testStatus,
  togglePrereq,
  topics,
  topicsCovered,
  updateQuestion,
  uploadSource,
  waiveFact,
  weeklyCheckIn,
  type NextAction,
  type Question,
  type Source,
  type Step,
} from "./state";
import { documentRows, kickoffAgenda } from "./client";
import { CoverageBar, Person, Stepper, Tag, tone, type Ctx } from "./ui";

function friendly(a: NextAction): string {
  const rest = a.title.replace(/^[^:]+: /, "");
  if (a.id === "request-docs")
    return "Sending you the list of documents we need";
  if (a.id === "upload" || a.id === "review-sources")
    return "Reading the documents you sent";
  if (a.id === "run-check")
    return "Comparing the information you sent for contradictions";
  if (a.id.startsWith("conflict-")) return `Clarifying: ${rest}`;
  if (a.id.startsWith("review-")) return `Reviewing your answer: ${rest}`;
  if (a.id === "approve-wording" || a.id.startsWith("send-"))
    return "Preparing questions for you";
  if (a.id.startsWith("gap-")) return `Chasing missing information: ${rest}`;
  if (a.id === "prereqs" || a.id === "configure")
    return "Setting up your agent";
  if (a.id === "tests") return "Testing the agent against your scenarios";
  return a.title;
}

function StageHead({ step, blurb }: { step: Step; blurb: string }) {
  return (
    <header className="v2-stagehead">
      <div>
        <p className="v2-eyebrow">Stage {step.n} of 5</p>
        <h2>{step.name}</h2>
        <p className="v2-muted">{blurb}</p>
      </div>
      <Tag
        kind={
          step.status === "Done"
            ? "green"
            : step.status === "Current"
              ? "blue"
              : "gray"
        }
      >
        {step.status === "Upcoming" ? "Locked" : step.status}
      </Tag>
    </header>
  );
}

function Card({
  title,
  children,
  aside,
}: {
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="v2-card">
      {(title || aside) && (
        <div className="v2-card-head">
          {title && <h3>{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function Locked({
  step,
  needs,
  onGo,
  goLabel,
}: {
  step: Step;
  needs: string[];
  onGo: () => void;
  goLabel: string;
}) {
  return (
    <>
      <StageHead
        step={step}
        blurb="This stage opens when the one before it is complete."
      />
      <Card>
        <div className="v2-locked">
          <span className="lock">🔒</span>
          <div>
            <strong>
              Not yet. {needs.length} thing{needs.length === 1 ? "" : "s"} still
              open before this stage:
            </strong>
            <ul>
              {needs.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <button className="v2-button" onClick={onGo}>
              {goLabel}
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}

export default function Journey({
  ctx,
  welcome,
  dismissWelcome,
}: {
  ctx: Ctx;
  welcome: boolean;
  dismissWelcome: () => void;
}) {
  const { state, update, flash, go, setFocusFact } = ctx;
  const client = state.client!;
  const steps = onboardingSteps(state);
  const current = currentStep(state);
  const [stage, setStage] = useState<number | null>(null);
  const [audience, setAudience] = useState<"team" | "customer">("team");
  const [draft, setDraft] = useState("");
  const active = stage ?? current.n;
  const actions = nextActions(state);
  const next = actions[0];

  function handle(a: NextAction) {
    if (a.id === "request-docs") {
      update(sendDocumentRequest);
      flash(
        "Simulated: the document request went to each contact. No email was sent.",
      );
      setStage(2);
      return;
    }
    if (a.id === "run-check") {
      update(runConsistencyCheck);
      setStage(3);
      return;
    }
    if (a.target.view === "spec") {
      if (a.target.factId) setFocusFact(a.target.factId);
      go("spec");
      return;
    }
    if (a.target.view === "process") return go("process");
    setStage(a.target.stage ?? 3);
  }

  return (
    <>
      {welcome && (
        <div className="v2-welcome" role="status">
          <span>
            <strong>Onboarding created from the voice-agent template.</strong>{" "}
            The spec of 20 required facts is empty. Start by sending the
            document request to the customer.
          </span>
          <button aria-label="Dismiss" onClick={dismissWelcome}>
            ×
          </button>
        </div>
      )}
      <header className="v2-clienthead">
        <div>
          <p className="v2-eyebrow">Onboarding</p>
          <h1>{client.name}</h1>
          <p className="v2-muted">
            {client.vertical} · {client.scope} · {client.plan} plan · Go-live
            target {client.goLive}
          </p>
          <p className="v2-team">
            Customer team:{" "}
            {client.contacts.map((c) => (
              <span key={c.name} className="v2-teamchip">
                {c.name} <small>{c.role}</small>
              </span>
            ))}
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
      </header>
      <CoverageBar state={state} />
      <Stepper
        steps={steps}
        active={audience === "team" ? active : current.n}
        onSelect={audience === "team" ? setStage : undefined}
      />

      {audience === "customer" ? (
        <CustomerView ctx={ctx} />
      ) : (
        <>
          <div className={`v2-next ${next ? "" : "clear"}`}>
            <div>
              <p className="v2-eyebrow">{next ? "Next step" : "All clear"}</p>
              <strong>
                {next ? next.title : "Nothing needs a decision right now."}
              </strong>
              {next && <small>{next.subtitle}</small>}
            </div>
            {next && (
              <button className="v2-button" onClick={() => handle(next)}>
                {next.id === "request-docs"
                  ? "Send document request"
                  : next.id === "run-check"
                    ? "Detect contradictions"
                    : next.button}{" "}
                →
              </button>
            )}
          </div>
          <div className="v2-draftbar">
            <button
              className="v2-link"
              onClick={() => setDraft(weeklyCheckIn(state))}
            >
              Draft weekly check-in
            </button>
            <button
              className="v2-link"
              onClick={() => setDraft(slackUpdate(state))}
            >
              Draft Slack update
            </button>
            {draft && (
              <button className="v2-link" onClick={() => setDraft("")}>
                Hide draft
              </button>
            )}
          </div>
          {draft && <pre className="v2-pre">{draft}</pre>}

          {active === 1 && <Stage1 ctx={ctx} step={steps[0]} />}
          {active === 2 && <Stage2 ctx={ctx} step={steps[1]} />}
          {active === 3 && <Stage3 ctx={ctx} step={steps[2]} />}
          {active === 4 && (
            <Stage4
              ctx={ctx}
              step={steps[3]}
              locked={steps[2].status !== "Done"}
              goStage={setStage}
            />
          )}
          {active === 5 && (
            <Stage5
              ctx={ctx}
              step={steps[4]}
              locked={steps[3].status !== "Done"}
              goStage={setStage}
            />
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ stage 1 */
function Stage1({ ctx, step }: { ctx: Ctx; step: Step }) {
  const { state, update, flash } = ctx;
  const client = state.client!;
  const agenda = kickoffAgenda(state);
  const rows = documentRows(state);
  return (
    <>
      <StageHead
        step={step}
        blurb="Who the client is, who on their side decides what, and what we ask them for."
      />
      <div className="v2-grid2">
        <Card title="Client profile">
          <dl className="v2-dl">
            <dt>Company</dt>
            <dd>{client.name}</dd>
            <dt>Vertical</dt>
            <dd>{client.vertical}</dd>
            <dt>Plan</dt>
            <dd>{client.plan}</dd>
            <dt>Channels</dt>
            <dd>{client.channels.join(", ")}</dd>
            <dt>Hours</dt>
            <dd>{client.hours}</dd>
            <dt>Kickoff call</dt>
            <dd>{client.kickoff}</dd>
            <dt>Go-live target</dt>
            <dd>{client.goLive}</dd>
            <dt>Their systems</dt>
            <dd>{client.systems.join(" · ")}</dd>
          </dl>
        </Card>
        <Card title="Properties">
          <table className="v2-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {client.properties.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="v2-muted">
            Property-specific rules (pets, hours) are kept per property in the
            spec.
          </p>
        </Card>
      </div>
      <Card title="Customer team: who decides what">
        <table className="v2-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Decides</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {client.contacts.map((c) => (
              <tr key={c.name}>
                <td>
                  <Person name={c.name} role={c.role} side="customer" />
                </td>
                <td>
                  {c.decides.map((t) => (
                    <Tag key={t} kind="gray">
                      {topics.find((x) => x.id === t)?.label}
                    </Tag>
                  ))}
                </td>
                <td className="v2-muted">{c.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="v2-muted">
          {topicsCovered(client)
            ? "Questions and document requests go to the person who decides the topic."
            : "Some topics have no owner yet. They fall back to the first contact."}
        </p>
      </Card>
      <Card title="Kickoff call agenda (generated from the spec)">
        <p className="v2-muted">
          Every required fact is a question for the call. Covered ones are
          already answered.
        </p>
        {agenda.map((a) => (
          <div className="v2-agenda" key={a.area}>
            <strong>{a.area}</strong>
            <span>
              {a.items.map((i) => (
                <span
                  key={i.id}
                  className={`v2-chip-fact ${i.covered ? "covered" : ""}`}
                >
                  {i.covered ? "✓ " : ""}
                  {i.label}
                </span>
              ))}
            </span>
          </div>
        ))}
      </Card>
      <Card
        title="Document request"
        aside={
          <button
            className="v2-button"
            disabled={state.docsRequested}
            onClick={() => {
              update(sendDocumentRequest);
              flash(
                "Simulated: the document request went to each contact. No email was sent.",
              );
            }}
          >
            {state.docsRequested ? "Request sent" : "Send document request"}
          </button>
        }
      >
        <p className="v2-muted">
          Each document is assigned to the contact who owns it. Our own call
          recording stays with our team.
        </p>
        <table className="v2-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Assigned to</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sourceId}>
                <td>
                  {r.label}
                  <small className="v2-muted v2-block">{r.area}</small>
                </td>
                <td>
                  <Person name={r.assignee} role={r.role} side={r.side} />
                </td>
                <td>
                  <Tag>
                    {state.docsRequested || r.status !== "Not received"
                      ? r.status
                      : "Not requested"}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ stage 2 */
function Extraction({ ctx, src }: { ctx: Ctx; src: Source }) {
  const { state, update } = ctx;
  const reviewed = state.reviewedSources.includes(src.id);
  return (
    <div className="v2-extract">
      {src.fills.length > 0 ? (
        <>
          <p className="v2-eyebrow">
            Simulated extraction · {src.fills.length} setup details read
          </p>
          <ul>
            {src.fills.map((f) => (
              <li key={f.factId}>
                <strong>{factById(state, f.factId)?.label}</strong>
                <span> {f.value}</span>
                <small className="v2-muted v2-block">
                  {f.anchor} · “{f.evidence}”
                </small>
              </li>
            ))}
          </ul>
          {reviewed ? (
            <Tag kind="green">Extraction reviewed</Tag>
          ) : (
            <button
              className="v2-button secondary"
              onClick={() => update((s) => reviewSource(s, src.id))}
            >
              Looks right
            </button>
          )}
        </>
      ) : (
        <p className="v2-muted">
          {src.parse === "Needs attention"
            ? "No text could be read. "
            : "Nothing is extracted from this file into the spec. "}
          {src.note}
        </p>
      )}
    </div>
  );
}

function Stage2({ ctx, step }: { ctx: Ctx; step: Step }) {
  const { state, update, go } = ctx;
  const rows = documentRows(state);
  const draftSrc = sourceCatalog.find((s) => s.id === "prompt-draft")!;
  const later = allSources(state).filter((s) => s.later);
  const table = routingTable(state);
  return (
    <>
      <StageHead
        step={step}
        blurb="Documents arrive at different times. Upload each one: it is logged and read into the spec with citations."
      />
      <Card title="Documents">
        <p className="v2-muted">
          Uploads are simulated with sample files. Extraction is simulated too:
          a real tool would read the file.
        </p>
        {rows.map((r) => (
          <div className="v2-doc" key={r.sourceId}>
            <div className="line">
              <div className="what">
                <strong>{r.label}</strong>
                <small className="v2-muted v2-block">
                  {r.source.title} · {r.source.type}
                </small>
              </div>
              <Person name={r.assignee} role={r.role} side={r.side} />
              <Tag>{r.status}</Tag>
              {r.status === "Not received" && (
                <button
                  className="v2-button secondary"
                  onClick={() => update((s) => uploadSource(s, r.sourceId))}
                >
                  Upload sample file
                </button>
              )}
            </div>
            {r.status !== "Not received" && (
              <Extraction ctx={ctx} src={r.source} />
            )}
            {r.status === "Needs a readable copy" && (
              <div className="v2-actions">
                <button
                  className="v2-button secondary"
                  disabled={state.copyRequested}
                  onClick={() => update(requestReadableCopy)}
                >
                  {state.copyRequested
                    ? "Readable copy requested"
                    : "Request a readable copy"}
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="v2-doc optional">
          <div className="line">
            <div className="what">
              <strong>Our draft agent instructions</strong>
              <small className="v2-muted v2-block">
                Optional · from our team · checked for contradictions too
              </small>
            </div>
            <Person
              name={state.client!.owner}
              role="Onboarding specialist"
              side="team"
            />
            <Tag>
              {state.addedSources.includes(draftSrc.id)
                ? "Received"
                : "Not received"}
            </Tag>
            {!state.addedSources.includes(draftSrc.id) && (
              <button
                className="v2-button secondary"
                onClick={() => update((s) => uploadSource(s, draftSrc.id))}
              >
                Add draft
              </button>
            )}
          </div>
        </div>
        {later.map((s) => (
          <div className="v2-doc" key={s.id}>
            <div className="line">
              <div className="what">
                <strong>{s.title}</strong>
                <small className="v2-muted v2-block">
                  Arrived later · {s.type}
                </small>
              </div>
              <Person
                name={s.suppliedBy}
                role={contactByName(state, s.suppliedBy)?.role}
                side="customer"
              />
              <Tag>Received</Tag>
            </div>
            <Extraction ctx={ctx} src={s} />
          </div>
        ))}
      </Card>
      <Card title="Customer team: roles and rules in the system">
        <p className="v2-muted">
          Who the agent hands off to, when, and the fallback. Built from what
          has been read so far. Roles only, never a static roster.
        </p>
        <table className="v2-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Who</th>
              <th>When</th>
              <th>Fallback</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.scenario}>
                <td>
                  <strong>{r.scenario}</strong>
                  <small className="v2-muted v2-block">{r.source}</small>
                </td>
                <td>{r.who}</td>
                <td>{r.when}</td>
                <td>{r.fallback}</td>
                <td>
                  <Tag>{r.status}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Spec coverage by area">
        {areas.map((a) => {
          const facts = state.facts.filter((f) => f.area === a);
          const known = facts.filter((f) => coverageOf(f) === "known").length;
          return (
            <div className="v2-areabar" key={a}>
              <span>{a}</span>
              <div className="v2-bar thin">
                <span className="seg known" style={{ flex: known }} />
                <span
                  className="seg empty"
                  style={{ flex: facts.length - known }}
                />
              </div>
              <small>
                {known} of {facts.length}
              </small>
            </div>
          );
        })}
        <button className="v2-link" onClick={() => go("spec")}>
          Open the requirements table →
        </button>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ stage 3 */
function SubStep({
  n,
  title,
  summary,
  status,
  action,
  children,
}: {
  n: number;
  title: string;
  summary: string;
  status: "done" | "current" | "todo";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`v2-sub ${status}`}>
      <header>
        <span className="num">{status === "done" ? "✓" : n}</span>
        <div>
          <h3>{title}</h3>
          <p className="v2-muted">{summary}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Stage3({ ctx, step }: { ctx: Ctx; step: Step }) {
  const { state, update, flash, go, setPortalRole } = ctx;
  const report = consistencyReport(state);
  const checkDone = report.ran && !report.stale && report.open.length === 0;
  const SENT = ["Sent", "Response received", "Resolved", "Defaulted"];
  const askDone =
    state.questions.length > 0 &&
    state.questions.every((q) => SENT.includes(q.status));
  const pending = state.questions.filter(
    (q) => q.revisions.length > q.reviewedRevision,
  );
  const approveDone =
    askDone &&
    pending.length === 0 &&
    state.questions.every(
      (q) => q.status === "Resolved" || q.status === "Defaulted",
    );
  const s1 = checkDone ? "done" : "current";
  const s2 = askDone ? "done" : report.ran ? "current" : "todo";
  const s3 = approveDone ? "done" : askDone ? "current" : "todo";
  const newDocs = allSources(state).filter(
    (s) => s.later && needsReview(s) && !state.reviewedSources.includes(s.id),
  );
  const gaps = state.facts.filter(
    (f) =>
      coverageOf(f) === "empty" &&
      !state.questions.some(
        (q) => q.factIds.includes(f.id) && SENT.includes(q.status),
      ) &&
      !(f.id === "F4" && state.copyRequested),
  );
  return (
    <>
      <StageHead
        step={step}
        blurb="Detect contradictions, ask the right customer contact once, and approve what comes back."
      />
      {newDocs.map((s) => (
        <Card key={s.id} title={`New document: ${s.title}`}>
          <p className="v2-muted">
            It arrived after the last check. Review the extraction, then run the
            check again.
          </p>
          <Extraction ctx={ctx} src={s} />
        </Card>
      ))}
      <div className="v2-stage3">
        <div>
          <SubStep
            n={1}
            title="Detect contradictions"
            status={s1}
            summary={
              state.addedSources.length === 0
                ? "Upload documents in stage 2 first."
                : !report.ran
                  ? `${report.claimsChecked} statements from ${report.sourcesChecked} sources have not been compared.`
                  : report.stale
                    ? "A new source arrived after the last check. Run it again."
                    : `${report.conflicts.length} conflicts found · ${report.open.length} open · ${report.variations.length} legitimate variation${report.variations.length === 1 ? "" : "s"}.`
            }
            action={
              <button
                className={`v2-button ${report.ran && !report.stale ? "secondary" : ""}`}
                disabled={state.addedSources.length === 0}
                onClick={() => {
                  update(runConsistencyCheck);
                  flash(
                    "Contradiction check run on the current sources and draft prompts.",
                  );
                }}
              >
                {report.ran ? "Run again" : "Detect contradictions"}
              </button>
            }
          >
            {report.ran &&
              report.conflicts.map((c) => (
                <ConflictRow key={c.id} ctx={ctx} c={c} />
              ))}
            {report.ran &&
              report.variations.map((v) => (
                <details className="v2-row calm" key={v.id}>
                  <summary>
                    <i className="dot green" />
                    <span className="title">{v.topicLabel}</span>
                    <Tag kind="gray">Different scopes, not a conflict</Tag>
                  </summary>
                  <div className="body">
                    {v.claimIds.map((id) => {
                      const cl = claims.find((x) => x.id === id)!;
                      return (
                        <p key={id}>
                          <strong>{cl.scope}:</strong> {cl.value}
                        </p>
                      );
                    })}
                  </div>
                </details>
              ))}
          </SubStep>

          <SubStep
            n={2}
            title="Ask the customer"
            status={s2}
            summary="Each question goes to the contact who decides the topic. Non-critical ones can default if nobody replies."
          >
            {state.questions.length === 0 && (
              <p className="v2-muted pad">
                Questions are drafted when the check finds a conflict or an open
                critical detail.
              </p>
            )}
            {[...state.questions]
              .sort(
                (a, b) =>
                  Number(questionCritical(state, b)) -
                  Number(questionCritical(state, a)),
              )
              .map((q) => (
                <QuestionRow key={q.id} ctx={ctx} q={q} />
              ))}
            {gaps.length > 0 && (
              <div className="v2-gaps">
                <p className="v2-eyebrow">Open gaps with no question yet</p>
                {gaps.map((g) => (
                  <GapRow key={g.id} ctx={ctx} fid={g.id} />
                ))}
              </div>
            )}
            <div className="v2-sendbar">
              {recipientsInUse(state).map((name) => {
                const ready = state.questions.filter(
                  (q) => q.recipient === name && q.status === "Ready to send",
                );
                return (
                  <span key={name}>
                    <button
                      className="v2-button"
                      disabled={!ready.length}
                      onClick={() => {
                        update((s) =>
                          sendRequest(
                            s,
                            name,
                            ready.map((q) => q.id),
                          ),
                        );
                        setPortalRole(name);
                        flash(
                          `Simulated request created for ${name}. No email or link was generated.`,
                        );
                      }}
                    >
                      Send {ready.length || ""} to {name}
                    </button>
                    {sentQuestionIds(state, name).length > 0 && (
                      <button
                        className="v2-link"
                        onClick={() => {
                          setPortalRole(name);
                          go("portal");
                        }}
                      >
                        Open {name.split(" ")[0]}’s answer form →
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </SubStep>

          <SubStep
            n={3}
            title="Approve answers"
            status={s3}
            summary="A reply is evidence. It becomes confirmed only after a specialist approves it."
          >
            {pending.length === 0 && (
              <p className="v2-muted pad">
                Replies will appear here once the customer answers.
              </p>
            )}
            {pending.map((q) => {
              const latest = q.revisions[q.revisions.length - 1];
              return (
                <div className="v2-reply" key={q.id}>
                  <div>
                    <strong>{q.title}</strong>
                    <small className="v2-muted v2-block">
                      Reply from {q.recipient}
                    </small>
                    <p>
                      {latest.kind === "answer"
                        ? latest.value
                        : latest.kind === "unknown"
                          ? "“I don’t know”"
                          : "“Someone else should answer”"}
                    </p>
                  </div>
                  {latest.kind === "answer" && (
                    <button
                      className="v2-button"
                      onClick={() => {
                        update((s) => reviewAnswer(s, q.id));
                        flash(
                          "Approved. The linked facts are now customer-confirmed.",
                        );
                      }}
                    >
                      Approve instruction
                    </button>
                  )}
                </div>
              );
            })}
          </SubStep>
        </div>
        <aside className="v2-exit">
          <h3>
            Exit criteria{" "}
            <small>
              {step.pieces.filter((p) => p.done).length} of {step.pieces.length}
            </small>
          </h3>
          <ul>
            {step.pieces.map((p) => (
              <li key={p.label} className={p.done ? "done" : ""}>
                <b>{p.done ? "✓" : "○"}</b> {p.label}
              </li>
            ))}
          </ul>
          <p className="v2-muted">Stage 4 opens when all are done.</p>
        </aside>
      </div>
    </>
  );
}

function GapRow({ ctx, fid }: { ctx: Ctx; fid: string }) {
  const { state, update } = ctx;
  const f = factById(state, fid)!;
  const [reason, setReason] = useState("");
  return (
    <div className="v2-gap">
      <div>
        <strong>
          {f.id} · {f.label}
        </strong>
        <small className="v2-muted v2-block">{f.note}</small>
      </div>
      <div className="v2-actions">
        {f.id === "F4" && state.addedSources.includes("scan") && (
          <button
            className="v2-button secondary"
            onClick={() => update(requestReadableCopy)}
          >
            Request a readable copy
          </button>
        )}
        <input
          aria-label={`Reason to waive ${f.label}`}
          placeholder="Reason to waive"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="v2-button secondary"
          disabled={!reason.trim() || f.critical}
          onClick={() => update((s) => waiveFact(s, fid, reason))}
        >
          Waive with reason
        </button>
      </div>
    </div>
  );
}

function ConflictRow({
  ctx,
  c,
}: {
  ctx: Ctx;
  c: ReturnType<typeof consistencyReport>["conflicts"][number];
}) {
  const { state, update } = ctx;
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const q = state.questions.find((x) => x.id === c.questionId);
  return (
    <details className="v2-row" open={!c.resolved || undefined}>
      <summary>
        <i className={`dot ${c.resolved ? "green" : "red"}`} />
        <span className="title">{c.topicLabel}</span>
        <Tag kind="gray">{c.scope}</Tag>
        <Tag kind="gray">
          {c.needs === "customer" ? "Sources disagree" : "Our draft disagrees"}
        </Tag>
        <Tag kind={c.resolved ? "green" : "amber"}>
          {c.resolved ? "Resolved" : "Open"}
        </Tag>
      </summary>
      <div className="body">
        {c.claimIds.map((id) => {
          const cl = claims.find((x) => x.id === id)!;
          const src = allSources(state).find((x) => x.id === cl.sourceId);
          return (
            <blockquote key={id}>
              “{cl.quote}”
              <small>
                {src?.title} · {cl.anchor}
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
          q && (q.status === "Resolved" || q.status === "Defaulted") ? (
            <button
              className="v2-button"
              onClick={() => update((s) => reopenQuestion(s, q.id))}
            >
              New evidence: ask {q.recipient} again
            </button>
          ) : (
            <p className="v2-muted">
              {q
                ? `Question assigned to ${q.recipient}. Send it in step 2 below.`
                : "Run the check to draft the question."}
            </p>
          )
        ) : (
          <div className="v2-fix">
            <p>Which instruction is intended?</p>
            {c.claimIds.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name={`fix-${c.id}`}
                  checked={choice === id}
                  onChange={() => setChoice(id)}
                />{" "}
                {claims.find((x) => x.id === id)?.value}
              </label>
            ))}
            <label className="v2-field">
              Reason, recorded with the fix
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              className="v2-button"
              disabled={!choice || !note.trim()}
              onClick={() =>
                update((s) => resolveInternally(s, c.id, choice, note))
              }
            >
              Record fix
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function QuestionRow({ ctx, q }: { ctx: Ctx; q: Question }) {
  const { state, update } = ctx;
  const critical = questionCritical(state, q);
  return (
    <details className="v2-row">
      <summary>
        <i className={`dot ${critical ? "red" : "blue"}`} />
        <span className="title">{q.title}</span>
        <Person
          name={q.recipient}
          role={contactByName(state, q.recipient)?.role}
          side="customer"
        />
        <Tag kind={critical ? "red" : "gray"}>
          {critical ? "Blocks launch" : "Non-critical"}
        </Tag>
        <Tag>{q.status}</Tag>
      </summary>
      <div className="body">
        {q.status === "AI draft" ? (
          <label className="v2-field">
            Question wording (AI draft, edit before approving)
            <textarea
              value={q.text}
              onChange={(e) =>
                update((s) => updateQuestion(s, q.id, { text: e.target.value }))
              }
            />
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
        {q.status === "AI draft" && (
          <button
            className="v2-button secondary"
            onClick={() =>
              update((s) =>
                updateQuestion(s, q.id, { status: "Ready to send" }),
              )
            }
          >
            Approve question wording
          </button>
        )}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ stage 4 */
function Stage4({
  ctx,
  step,
  locked,
  goStage,
}: {
  ctx: Ctx;
  step: Step;
  locked: boolean;
  goStage: (n: number) => void;
}) {
  const { state, update } = ctx;
  if (locked)
    return (
      <Locked
        step={step}
        needs={
          readiness(state).blockers.length
            ? readiness(state).blockers
            : ["Finish the remaining pieces in stage 3."]
        }
        onGo={() => goStage(3)}
        goLabel="Go to stage 3"
      />
    );
  const facts = state.facts.filter(configurable);
  const cases = testCases(state);
  return (
    <>
      <StageHead
        step={step}
        blurb="Set the agent up from confirmed facts only, then test every scenario and record the result."
      />
      <Card
        title="Launch prerequisites"
        aside={
          <span className="v2-muted">
            {prereqItems.filter((p) => state.prereqs[p.id]).length} of{" "}
            {prereqItems.length} done
          </span>
        }
      >
        <p className="v2-muted">
          Typical setup items for a voice agent on this kind of platform, based
          on public setup pages. Replace with your own checklist.
        </p>
        <ul className="v2-checklist boxes">
          {prereqItems.map((p) => (
            <li key={p.id} className={state.prereqs[p.id] ? "pass" : "open"}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(state.prereqs[p.id])}
                  onChange={() => update((s) => togglePrereq(s, p.id))}
                />{" "}
                {p.label}
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title="Configure"
        aside={
          <span className="v2-muted">
            {facts.filter((f) => f.lifecycle === "Configured").length} of{" "}
            {facts.length} configured
          </span>
        }
      >
        <table className="v2-table">
          <tbody>
            {facts.map((f) => (
              <tr key={f.id}>
                <td className="id">{f.id}</td>
                <td>
                  <strong>{f.label}</strong>
                  <small className="v2-muted v2-block">{shownValue(f)}</small>
                </td>
                <td>
                  <Tag kind="gray">Lands in: {f.lands}</Tag>
                </td>
                <td>
                  <Tag>{shownLifecycle(state, f)}</Tag>
                </td>
                <td className="right">
                  {f.lifecycle !== "Configured" &&
                    (!f.critical || isConfirmed(f)) && (
                      <button
                        className="v2-button secondary"
                        onClick={() => update((s) => markConfigured(s, f.id))}
                      >
                        Mark configured
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card
        title="Test"
        aside={
          <span className="v2-muted">
            {cases.filter((t) => testStatus(state, t) === "Pass").length} of{" "}
            {cases.length} passing
          </span>
        }
      >
        <p className="v2-muted">
          Cases are generated from reviewed facts. This app does not run them:
          try each scenario, then record the result. Changing a fact marks its
          earlier results “Needs retest”.
        </p>
        <TestGroups ctx={ctx} />
      </Card>
    </>
  );
}

function TestGroups({ ctx }: { ctx: Ctx }) {
  const { state, update } = ctx;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const cases = testCases(state);
  return (
    <>
      {state.facts
        .filter((f) => cases.some((t) => t.factId === f.id))
        .map((f) => {
          const mine = cases.filter((t) => t.factId === f.id);
          const passing = mine.filter(
            (t) => testStatus(state, t) === "Pass",
          ).length;
          return (
            <details className="v2-row" key={f.id}>
              <summary>
                <i
                  className={`dot ${passing === mine.length ? "green" : "gray"}`}
                />
                <span className="title">
                  {f.id} · {f.label}
                </span>
                {f.critical && <Tag kind="red">Critical</Tag>}
                <Tag kind="gray">
                  {passing} of {mine.length} passing
                </Tag>
              </summary>
              <div className="body">
                {mine.map((t) => {
                  const result = testStatus(state, t);
                  return (
                    <div className="v2-testcase" key={t.id}>
                      <div className="head">
                        <div>
                          <p className="v2-eyebrow">
                            {t.kind}
                            {t.critical ? " · critical" : ""} · {t.id}
                          </p>
                          <p>{t.scenario}</p>
                          <p className="v2-muted">Expected: {t.expected}</p>
                        </div>
                        <Tag kind={tone(result)}>{result}</Tag>
                      </div>
                      <div className="v2-actions">
                        <button
                          className="v2-button secondary"
                          onClick={() =>
                            update((s) =>
                              recordTest(s, t.id, "Pass", notes[t.id] ?? ""),
                            )
                          }
                        >
                          Record pass
                        </button>
                        <button
                          className="v2-button secondary"
                          onClick={() =>
                            update((s) =>
                              recordTest(s, t.id, "Fail", notes[t.id] ?? ""),
                            )
                          }
                        >
                          Record fail
                        </button>
                        <input
                          aria-label={`Note for ${t.id}`}
                          placeholder="Note (optional)"
                          value={notes[t.id] ?? state.tests[t.id]?.note ?? ""}
                          onChange={(e) =>
                            setNotes({ ...notes, [t.id]: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
    </>
  );
}

/* ------------------------------------------------------------------ stage 5 */
function Stage5({
  ctx,
  step,
  locked,
  goStage,
}: {
  ctx: Ctx;
  step: Step;
  locked: boolean;
  goStage: (n: number) => void;
}) {
  const { state, update } = ctx;
  const checklist = launchChecklist(state);
  if (locked)
    return (
      <Locked
        step={step}
        needs={checklist
          .filter((c) => !c.pass)
          .map((c) => `${c.label}: ${c.detail}`)}
        onGo={() => goStage(4)}
        goLabel="Go to stage 4"
      />
    );
  return (
    <>
      <StageHead
        step={step}
        blurb="Launch only when the gate is clear, then tune weekly from real calls."
      />
      <Card title="Launch gate">
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
      </Card>
      <Card title="After launch">
        <p className="v2-muted">
          Weekly check-in for the first four weeks, then monthly. Problems found
          in real calls become tests (illustrative issues below).
        </p>
        {seedIssues.map((i) => {
          const done = state.extraTests.some((t) => t.id === `T-${i.id}`);
          return (
            <div className="v2-issue" key={i.id}>
              <span>{i.text}</span>
              <button
                className="v2-button secondary"
                disabled={done}
                onClick={() => update((s) => convertIssue(s, i.id))}
              >
                {done ? "Added to tests" : "Turn into a test case"}
              </button>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ customer view */
function CustomerView({ ctx }: { ctx: Ctx }) {
  const { state, go, setPortalRole } = ctx;
  const items = assignments(state).filter((a) => a.side === "customer");
  const actions = nextActions(state);
  const cov = coverage(state);
  const people = [...new Set(items.map((i) => i.assignee))];
  return (
    <>
      <p className="v2-muted">
        This is what the customer sees: the same data, without internal detail.
      </p>
      <div className="v2-grid2">
        <Card title="What we need from you to unblock">
          {people.length === 0 && (
            <p className="v2-muted">Nothing outstanding from you right now.</p>
          )}
          {people.map((p) => (
            <div key={p} className="v2-needs">
              <Person
                name={p}
                role={contactByName(state, p)?.role}
                side="customer"
              />
              <ul>
                {items
                  .filter((i) => i.assignee === p)
                  .map((i) => (
                    <li key={i.id}>
                      {i.title} <small className="v2-muted">· {i.due}</small>
                    </li>
                  ))}
              </ul>
              {sentQuestionIds(state, p).length > 0 && (
                <button
                  className="v2-link"
                  onClick={() => {
                    setPortalRole(p);
                    go("portal");
                  }}
                >
                  Open the answer form →
                </button>
              )}
            </div>
          ))}
        </Card>
        <Card title="What we are working on">
          <ul>
            {actions.slice(0, 4).map((a) => (
              <li key={a.id}>{friendly(a)}</li>
            ))}
            {!actions.length && <li>Preparing for launch.</li>}
          </ul>
          <p className="v2-muted">
            {cov.known} of {cov.total} setup details known · {cov.confirmed}{" "}
            confirmed by you.
          </p>
          <p className="v2-muted">
            Next update: weekly check-in on Friday. We will tell you as soon as
            each item is done.
          </p>
        </Card>
      </div>
    </>
  );
}
