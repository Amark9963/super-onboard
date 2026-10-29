"use client";

import { useState } from "react";
import {
  AUTOMATION_THRESHOLD,
  OWNER,
  allSources,
  areas,
  assignments,
  configurable,
  consistencyReport,
  contactByName,
  coverageOf,
  currentStep,
  demoClient,
  exportCsv,
  exportJson,
  isConfirmed,
  markConfigured,
  nextActions,
  onboardingSteps,
  processCounts,
  reviewFact,
  routingTable,
  sentQuestionIds,
  shownLifecycle,
  shownValue,
  stageDays,
  submitAnswer,
  testCases,
  testStatus,
  topics,
  waiveFact,
  type Client,
  type Contact,
  type Fact,
  type PrototypeState,
  type Question,
  type Topic,
} from "./state";
import { Person, Stepper, Tag, download, type Ctx } from "./ui";

/* ------------------------------------------------------------------ login */
export function Login({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="v2-login">
      <div className="v2-login-side">
        <div className="v2-logo-icon">so</div>
        <h1>
          Keep requirements, configuration and tests linked from kickoff to
          go-live.
        </h1>
        <ul>
          <li>
            Upload the customer’s documents and see what the agent needs to
            know.
          </li>
          <li>Catch contradictions before the customer does.</li>
          <li>
            Ask the right person once, and always know who it’s waiting on.
          </li>
        </ul>
        <p className="v2-muted">
          Independent prototype with fictional data. Not affiliated with any
          voice-agent vendor.
        </p>
      </div>
      <form
        className="v2-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn();
        }}
      >
        <h2>Sign in</h2>
        <p className="v2-muted">
          Simulated sign-in for the demo. No account is created and nothing
          leaves your browser.
        </p>
        <label className="v2-field">
          Email
          <input type="email" defaultValue="avery.morgan@example.invalid" />
        </label>
        <label className="v2-field">
          Password
          <input type="password" defaultValue="demo-password" />
        </label>
        <button className="v2-button" type="submit">
          Sign in
        </button>
        <p className="v2-muted">
          Signing in as Avery Morgan, onboarding specialist.
        </p>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ dashboard */
export function Dashboard({ ctx }: { ctx: Ctx }) {
  const { state, go } = ctx;
  const client = state.client;
  const step = currentStep(state);
  const all = assignments(state);
  const waiting = all.filter((a) => a.side === "customer");
  const mine = all.filter((a) => a.side === "team");
  const report = consistencyReport(state);
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">Dashboard</p>
          <h1>Onboardings</h1>
          <p className="v2-muted">
            Every client from kickoff to go-live, and who each open item is
            waiting on.
          </p>
        </div>
        <button className="v2-button" onClick={() => go("new")}>
          ＋ New onboarding
        </button>
      </div>
      {client && (
        <div className="v2-metrics">
          <div>
            <strong>{step.n} of 5</strong>
            <span>Oakwood: current stage</span>
          </div>
          <div>
            <strong>{waiting.length}</strong>
            <span>Items waiting on the customer</span>
          </div>
          <div>
            <strong>{report.open.length}</strong>
            <span>Open conflicts</span>
          </div>
          <div>
            <strong>{mine.length}</strong>
            <span>Items on our team</span>
          </div>
        </div>
      )}
      {!client && (
        <section className="v2-card v2-start">
          <h3>No live onboarding yet</h3>
          <p className="v2-muted">
            Start one to see the whole journey: client details, documents,
            contradictions, clarifications, setup and go-live.
          </p>
          <button className="v2-button" onClick={() => go("new")}>
            Start an onboarding
          </button>
        </section>
      )}
      <table className="v2-table v2-clients">
        <thead>
          <tr>
            <th>Client</th>
            <th>Stage</th>
            <th>Waiting on</th>
            <th>Next step</th>
            <th>Go-live</th>
          </tr>
        </thead>
        <tbody>
          {client && (
            <tr
              className="link"
              onClick={() => go("journey")}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && go("journey")}
            >
              <td>
                <strong>{client.name}</strong>
                <small className="v2-muted v2-block">
                  {client.plan} plan · {client.owner}
                </small>
              </td>
              <td>
                <Tag kind="blue">
                  {step.n} of 5 · {step.name}
                </Tag>
              </td>
              <td>
                {waiting.length
                  ? `${new Set(waiting.map((w) => w.assignee)).size} customer contact${new Set(waiting.map((w) => w.assignee)).size === 1 ? "" : "s"}`
                  : "Our team"}
              </td>
              <td>{nextActions(state)[0]?.title ?? "Nothing waiting"}</td>
              <td>{client.goLive}</td>
            </tr>
          )}
          <tr className="static">
            <td>
              <strong>Birchwood Apartments</strong>
              <small className="v2-muted v2-block">
                Illustrative · 24/7 plan · Sam Rivera
              </small>
            </td>
            <td>
              <Tag kind="gray">1 of 5 · Kickoff and client details</Tag>
            </td>
            <td>Our team</td>
            <td>Run the kickoff call (Nov 3)</td>
            <td>Dec 4, 2026</td>
          </tr>
          <tr className="static">
            <td>
              <strong>Cedar &amp; Pine Realty</strong>
              <small className="v2-muted v2-block">
                Illustrative · After Hours plan · Sam Rivera
              </small>
            </td>
            <td>
              <Tag kind="green">5 of 5 · Live, week 2</Tag>
            </td>
            <td>Nobody</td>
            <td>Weekly review on Friday</td>
            <td>Live</td>
          </tr>
        </tbody>
      </table>
      <p className="v2-muted">
        Only the onboarding you start is a working example. The other rows are
        illustrative and fictional.
      </p>
      {client && waiting.length > 0 && (
        <section className="v2-card">
          <div className="v2-card-head">
            <h3>Waiting on the customer</h3>
            <button className="v2-link" onClick={() => go("assignments")}>
              See all assignments →
            </button>
          </div>
          {waiting.slice(0, 5).map((a) => (
            <div className="v2-assign" key={a.id}>
              <span>
                <strong>{a.title}</strong>
                <small className="v2-muted v2-block">{a.detail}</small>
              </span>
              <Person name={a.assignee} role={a.role} side="customer" />
              <small className="v2-muted">{a.due}</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ new onboarding wizard */
const planOptions: Client["plan"][] = ["After Hours", "24/7", "Concierge"];

export function NewOnboarding({
  ctx,
  onCreate,
}: {
  ctx: Ctx;
  onCreate: (client: Client) => void;
}) {
  const { go } = ctx;
  const [n, setN] = useState(1);
  const [name, setName] = useState(demoClient.name);
  const [vertical, setVertical] = useState(demoClient.vertical);
  const [plan, setPlan] = useState<Client["plan"]>(demoClient.plan);
  const [goLive, setGoLive] = useState(demoClient.goLive);
  const [propText, setPropText] = useState(
    demoClient.properties.map((p) => `${p.name}, ${p.units} units`).join("\n"),
  );
  const [contacts, setContacts] = useState<Contact[]>(
    demoClient.contacts.map((c) => ({ ...c, decides: [...c.decides] })),
  );
  const labels = ["Client details", "Customer team", "Review and create"];

  const properties = propText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [pn, rest] = l.split(",");
      return {
        name: pn.trim(),
        units: parseInt((rest ?? "").replace(/\D/g, ""), 10) || 0,
      };
    });
  const uncovered = topics.filter(
    (t) => !contacts.some((c) => c.decides.includes(t.id)),
  );
  const valid =
    name.trim() &&
    properties.length > 0 &&
    contacts.every((c) => c.name.trim());

  function toggleTopic(i: number, t: Topic) {
    setContacts(
      contacts.map((c, idx) =>
        idx !== i
          ? c
          : {
              ...c,
              decides: c.decides.includes(t)
                ? c.decides.filter((x) => x !== t)
                : [...c.decides, t],
            },
      ),
    );
  }
  function build(): Client {
    const units = properties.reduce((sum, p) => sum + p.units, 0);
    return {
      ...demoClient,
      name: name.trim(),
      vertical: vertical.trim() || demoClient.vertical,
      plan,
      goLive: goLive.trim() || demoClient.goLive,
      properties,
      scope: `${properties.length} propert${properties.length === 1 ? "y" : "ies"} · ${units} units`,
      contacts,
      owner: OWNER,
    };
  }

  return (
    <>
      <button className="v2-link" onClick={() => go("dashboard")}>
        ← Dashboard
      </button>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">New onboarding</p>
          <h1>Start an onboarding</h1>
          <p className="v2-muted">
            Prefilled with fictional demo data. Edit anything.
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
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="v2-field">
              Vertical
              <input
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
              />
            </label>
            <label className="v2-field">
              Plan
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as Client["plan"])}
              >
                {planOptions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="v2-field">
              Go-live target
              <input
                value={goLive}
                onChange={(e) => setGoLive(e.target.value)}
              />
            </label>
            <label className="v2-field wide">
              Properties (one per line: name, units)
              <textarea
                value={propText}
                onChange={(e) => setPropText(e.target.value)}
              />
            </label>
          </div>
        </section>
      )}
      {n === 2 && (
        <section className="v2-card">
          <p className="v2-muted">
            Who on the customer’s side will answer us, and what do they decide?
            Questions and document requests are assigned to the person who
            decides the topic.
          </p>
          {contacts.map((c, i) => (
            <div className="v2-contactedit" key={i}>
              <div className="v2-formgrid">
                <label className="v2-field">
                  Name
                  <input
                    value={c.name}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, idx) =>
                          idx === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="v2-field">
                  Role
                  <input
                    value={c.role}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, idx) =>
                          idx === i ? { ...x, role: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="v2-field wide">
                  Email
                  <input
                    value={c.email}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, idx) =>
                          idx === i ? { ...x, email: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <div className="v2-choices">
                {topics.map((t) => (
                  <label
                    key={t.id}
                    className={`v2-chip ${c.decides.includes(t.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      hidden
                      checked={c.decides.includes(t.id)}
                      onChange={() => toggleTopic(i, t.id)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {uncovered.length > 0 && (
            <p className="v2-warn">
              No one decides:{" "}
              {uncovered.map((t) => t.label.toLowerCase()).join(", ")}. Those
              items will fall back to the first contact.
            </p>
          )}
        </section>
      )}
      {n === 3 && (
        <div className="v2-grid2">
          <section className="v2-card">
            <h3>{name || "Client"}</h3>
            <p className="v2-muted">
              {vertical} · {plan} plan · go-live {goLive}
            </p>
            {properties.map((p) => (
              <p key={p.name}>
                {p.name}: {p.units} units
              </p>
            ))}
            <h3>Customer team</h3>
            {contacts.map((c) => (
              <p key={c.name}>
                <strong>{c.name}</strong> · {c.role}
                <small className="v2-muted v2-block">
                  Decides:{" "}
                  {c.decides
                    .map((d) => topics.find((t) => t.id === d)?.label)
                    .join(", ") || "nothing yet"}
                </small>
              </p>
            ))}
          </section>
          <section className="v2-card">
            <h3>What gets created</h3>
            <p className="v2-muted">
              A voice-agent onboarding with an empty spec of 20 required facts
              in five areas:
            </p>
            {areas.map((a) => (
              <p key={a}>
                <strong>{a}</strong>
              </p>
            ))}
            <p className="v2-muted">
              Next: send the document request, then upload what arrives.
            </p>
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
          <button
            className="v2-button"
            disabled={n === 1 && !(name.trim() && properties.length)}
            onClick={() => setN(n + 1)}
          >
            Continue
          </button>
        ) : (
          <button
            className="v2-button"
            disabled={!valid}
            onClick={() => onCreate(build())}
          >
            Create onboarding
          </button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ assignments */
export function Assignments({ ctx }: { ctx: Ctx }) {
  const { state, go } = ctx;
  const all = assignments(state);
  const customer = all.filter((a) => a.side === "customer");
  const people = [...new Set(customer.map((a) => a.assignee))];
  const team = all.filter((a) => a.side === "team");
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">{state.client?.name}</p>
          <h1>Assignments</h1>
          <p className="v2-muted">
            Every open item, and the person it is waiting on.
          </p>
        </div>
      </div>
      <section className="v2-card">
        <h3>Waiting on the customer</h3>
        {people.length === 0 && (
          <p className="v2-muted">
            Nothing is waiting on the customer yet. Send the document request in
            stage 1.
          </p>
        )}
        {people.map((p) => (
          <div className="v2-person-group" key={p}>
            <Person
              name={p}
              role={contactByName(state, p)?.role}
              side="customer"
            />
            {customer
              .filter((a) => a.assignee === p)
              .map((a) => (
                <div className="v2-assign" key={a.id}>
                  <span>
                    <strong>{a.title}</strong>
                    <small className="v2-muted v2-block">{a.detail}</small>
                  </span>
                  <small className="v2-muted">{a.due}</small>
                </div>
              ))}
          </div>
        ))}
      </section>
      <section className="v2-card">
        <h3>On our team</h3>
        {team.length === 0 && (
          <p className="v2-muted">Nothing needs us right now.</p>
        )}
        {team.map((a) => (
          <div className="v2-assign" key={a.id}>
            <span>
              <strong>{a.title}</strong>
              <small className="v2-muted v2-block">{a.detail}</small>
            </span>
            <Person name={a.assignee} role={a.role} side="team" />
            <small className="v2-muted">{a.due}</small>
          </div>
        ))}
        <button className="v2-link" onClick={() => go("journey")}>
          Open the journey →
        </button>
      </section>
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
        <small>Lands in: {f.lands}</small>
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
  const table = routingTable(state);
  return (
    <>
      <div className="v2-page-head">
        <div>
          <p className="v2-eyebrow">{state.client?.name}</p>
          <h1>Requirements</h1>
          <p className="v2-muted">
            The single source of truth: twenty required facts. Each links to its
            source, an owner, an approval, where it lands in the agent, and its
            tests.
          </p>
        </div>
      </div>
      <details className="v2-card v2-sources" open>
        <summary>
          <strong>Customer team: roles and rules in the system</strong>
        </summary>
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
      </details>
      <details className="v2-card v2-sources">
        <summary>
          <strong>Sources received ({allSources(state).length})</strong>
        </summary>
        {allSources(state).length === 0 && (
          <p className="v2-muted">
            No documents yet. Upload them in stage 2 of the journey.
          </p>
        )}
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
          <p className="v2-eyebrow">{state.client?.name}</p>
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
  name,
  setName,
}: {
  ctx: Ctx;
  name: string;
  setName: (n: string) => void;
}) {
  const { state, update, flash, go } = ctx;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState("");
  const sentIds = sentQuestionIds(state);
  const people = [
    ...new Set(
      state.questions
        .filter((q) => sentIds.includes(q.id))
        .map((q) => q.recipient),
    ),
  ];
  const person = people.includes(name) ? name : (people[0] ?? name);
  const questions = state.questions.filter(
    (q) => q.recipient === person && sentIds.includes(q.id),
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
      <div className="v2-roleswitch" role="status">
        You are now viewing as the customer: <strong>{person}</strong>
        {contactByName(state, person)
          ? `, ${contactByName(state, person)!.role}`
          : ""}
        .
        <button className="v2-link" onClick={() => go("journey")}>
          Return to the specialist view
        </button>
      </div>
      <header className="v2-portal-header">
        <div className="v2-brandmark">so</div>
        <span>Fictional customer view · simulated</span>
      </header>
      <main className="v2-portal-main">
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
            <p className="v2-eyebrow">{state.client?.name} · fictional</p>
            <h1>Help us get your agent setup details right.</h1>
            <p className="v2-lede">
              Avery from the implementation team has a few questions for you.
              Choose the closest answer or write your own; you can revise while
              this simulated review is open.
            </p>
            {people.length > 1 && (
              <div className="v2-choices" aria-label="Preview as contact">
                {people.map((p) => (
                  <button
                    key={p}
                    className={`v2-chip ${person === p ? "selected" : ""}`}
                    onClick={() => setName(p)}
                  >
                    Preview as {p}
                  </button>
                ))}
              </div>
            )}
            <div className="v2-portal-intro">
              <span>
                <strong>{questions.length}</strong> question
                {questions.length === 1 ? "" : "s"} assigned to {person}
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
