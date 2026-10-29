"use client";

import { useState } from "react";
import {
  owners,
  areas,
  assignments,
  contactByName,
  demoClient,
  nextActions,
  sentQuestionIds,
  submitAnswer,
  topics,
  uploadSource,
  type Client,
  type Contact,
  type Question,
} from "./state";
import { phaseNames, phaseProgress, planTasks } from "./plan";
import { Avatar, Empty, Person, StatusDot, Tag, type Ctx } from "./ui";
import { ContactCard, ContactForm } from "./contacts";

/* ------------------------------------------------------------------ login */
export function Login({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="v3 v3-login">
      <div className="side">
        <i className="v3-logo-tile">so</i>
        <h1>
          Turn customer documents into confirmed requirements, and know who each
          open item is waiting on.
        </h1>
        <ul>
          <li>
            Upload a customer’s documents and see what the agent needs to know.
          </li>
          <li>Catch contradictions before the customer does.</li>
          <li>
            Ask the right person once, and always know who it is waiting on.
          </li>
        </ul>
        <p className="v3-muted">
          Independent prototype with fictional data. Not affiliated with any
          voice-agent vendor.
        </p>
      </div>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          onSignIn();
        }}
      >
        <h2>Sign in</h2>
        <p className="v3-muted">
          Simulated sign-in for the demo. No account is created and nothing
          leaves your browser.
        </p>
        <label className="v3-field">
          Email
          <input type="email" defaultValue="avery.morgan@example.invalid" />
        </label>
        <label className="v3-field">
          Password
          <input type="password" defaultValue="demo-password" />
        </label>
        <button className="v3-btn block" type="submit">
          Sign in
        </button>
        <p className="v3-muted">
          Signing in as Avery Morgan, onboarding specialist.
        </p>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ inbox */
export function Inbox({ ctx }: { ctx: Ctx }) {
  const { state, go } = ctx;
  if (!state.client)
    return (
      <Empty
        title="Your inbox is clear"
        action={
          <button className="v3-btn" onClick={() => go("new")}>
            Start an onboarding
          </button>
        }
      >
        Tasks that need you, and customer replies, appear here once an
        onboarding is running.
      </Empty>
    );
  const tasks = planTasks(state);
  const phase =
    phaseProgress(state).find((p) => p.status === "Current")?.n ?? 5;
  const mine = tasks
    .filter((t) => t.side === "team" && t.status !== "Done" && t.phase <= phase)
    .slice(0, 7);
  const waiting = tasks
    .filter((t) => t.side === "customer" && t.status !== "Done")
    .slice(0, 6);
  const recent = [...state.activity].reverse().slice(0, 7);
  return (
    <>
      <div className="v3-pagehead">
        <div>
          <h1>Inbox</h1>
          <p className="v3-muted">
            What needs you, what is waiting on the customer, and what just
            happened.
          </p>
        </div>
      </div>
      <div className="v3-split">
        <div>
          <section className="v3-card">
            <h3>Needs your attention</h3>
            {mine.length === 0 && (
              <p className="v3-muted">Nothing needs you right now.</p>
            )}
            {mine.map((t) => (
              <div className="v3-task" key={t.id}>
                <StatusDot status={t.status} />
                <span className="title">
                  {t.title}
                  <small className="v3-muted block">{state.client!.name}</small>
                </span>
                <span className="side" />
                <span className="due">{t.due}</span>
                <button className="v3-link" onClick={() => go("client", t.tab)}>
                  Open
                </button>
              </div>
            ))}
          </section>
          <section className="v3-card">
            <h3>Waiting on the customer</h3>
            {waiting.length === 0 && (
              <p className="v3-muted">Nothing is waiting on the customer.</p>
            )}
            {waiting.map((t) => (
              <div className="v3-task" key={t.id}>
                <StatusDot status={t.status} />
                <span className="title">{t.title}</span>
                <Person
                  name={t.assignee}
                  role={t.role}
                  side="customer"
                  compact
                />
                <span className="due">{t.due}</span>
                <button className="v3-link" onClick={() => go("client", t.tab)}>
                  Open
                </button>
              </div>
            ))}
          </section>
        </div>
        <aside className="v3-side">
          <section className="v3-card">
            <h3>Recent activity</h3>
            {recent.length === 0 && <p className="v3-muted">Nothing yet.</p>}
            {recent.map((e) => (
              <div className="v3-event" key={e.id}>
                <Avatar name={e.actor.name} side={e.actor.side} />
                <span className="text">
                  <strong>{e.actor.name}</strong> {e.text}
                </span>
                <small className="v3-muted">{e.at}</small>
              </div>
            ))}
            <button
              className="v3-link"
              onClick={() => go("client", "activity")}
            >
              See all activity →
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ clients */
export function Clients({ ctx }: { ctx: Ctx }) {
  const { state, go } = ctx;
  const client = state.client;
  const waiting = assignments(state).filter((a) => a.side === "customer");
  const people = [...new Set(waiting.map((w) => w.assignee))];
  const phases = phaseProgress(state);
  const next = nextActions(state)[0];
  return (
    <>
      <div className="v3-pagehead">
        <div>
          <h1>Clients</h1>
          <p className="v3-muted">
            Every onboarding from kickoff to go-live, and who each one is
            waiting on.
          </p>
        </div>
        <button className="v3-btn" onClick={() => go("new")}>
          ＋ New onboarding
        </button>
      </div>
      {!client && (
        <section className="v3-card v3-start">
          <h3>No live onboarding yet</h3>
          <p className="v3-muted">
            Start one to see the whole journey: client details, documents,
            contradictions, clarifications, setup and go-live.
          </p>
          <button className="v3-btn" onClick={() => go("new")}>
            Start an onboarding
          </button>
        </section>
      )}
      <table className="v3-table v3-clients">
        <thead>
          <tr>
            <th>Client</th>
            <th>Progress</th>
            <th>Waiting on</th>
            <th>Next step</th>
            <th>Go-live</th>
          </tr>
        </thead>
        <tbody>
          {client && (
            <tr
              className="link"
              onClick={() => go("client", "plan")}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && go("client", "plan")}
            >
              <td>
                <strong>{client.name}</strong>
                <small className="v3-muted block">
                  {client.plan} plan · {client.owner}
                </small>
              </td>
              <td>
                <span className="v3-mini" aria-label="Phase progress">
                  {phases.map((p) => (
                    <i key={p.n} className={p.status.toLowerCase()} />
                  ))}
                </span>
                <small className="v3-muted block">
                  {phases.find((p) => p.status === "Current")?.name ??
                    "Go live and tune"}
                </small>
              </td>
              <td>
                {people.length ? (
                  people.map((p) => <Avatar key={p} name={p} side="customer" />)
                ) : (
                  <span className="v3-muted">Our team</span>
                )}
              </td>
              <td>{next ? next.title : "Nothing waiting"}</td>
              <td>{client.goLive}</td>
            </tr>
          )}
          <tr className="static">
            <td>
              <strong>Birchwood Apartments</strong>
              <small className="v3-muted block">
                Illustrative · 24/7 plan · Sam Rivera
              </small>
            </td>
            <td>
              <span className="v3-mini">
                <i className="current" />
                <i className="upcoming" />
                <i className="upcoming" />
                <i className="upcoming" />
                <i className="upcoming" />
              </span>
              <small className="v3-muted block">
                Kickoff and client details
              </small>
            </td>
            <td>
              <span className="v3-muted">Our team</span>
            </td>
            <td>Run the kickoff call (Nov 3)</td>
            <td>Dec 4, 2026</td>
          </tr>
          <tr className="static">
            <td>
              <strong>Cedar &amp; Pine Realty</strong>
              <small className="v3-muted block">
                Illustrative · After Hours plan · Sam Rivera
              </small>
            </td>
            <td>
              <span className="v3-mini">
                <i className="done" />
                <i className="done" />
                <i className="done" />
                <i className="done" />
                <i className="current" />
              </span>
              <small className="v3-muted block">Live, week 2</small>
            </td>
            <td>
              <span className="v3-muted">Nobody</span>
            </td>
            <td>Weekly review on Friday</td>
            <td>Live</td>
          </tr>
        </tbody>
      </table>
      <p className="v3-muted">
        Only the onboarding you start is a working example. The other rows are
        illustrative and fictional.
      </p>
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
  const team = owners(ctx.state);
  const [owner, setOwnerName] = useState(
    team.find((m) => m.name === demoClient.owner)?.name ??
      team[0]?.name ??
      demoClient.owner,
  );
  const [propText, setPropText] = useState(
    demoClient.properties.map((p) => `${p.name}, ${p.units} units`).join("\n"),
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false);
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
  const valid = name.trim() && properties.length > 0 && contacts.length > 0;

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
      owner,
    };
  }

  return (
    <>
      <button className="v3-link" onClick={() => go("clients")}>
        ← Clients
      </button>
      <div className="v3-pagehead">
        <div>
          <h1>New onboarding</h1>
          <p className="v3-muted">
            Client details are prefilled with fictional demo data. You add the
            customer team yourself, or use the sample team.
          </p>
        </div>
      </div>
      <ol className="v3-wizard">
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
        <section className="v3-card">
          <div className="v3-formgrid">
            <label className="v3-field">
              Company
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="v3-field">
              Vertical
              <input
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
              />
            </label>
            <label className="v3-field">
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
            <label className="v3-field">
              Go-live target
              <input
                value={goLive}
                onChange={(e) => setGoLive(e.target.value)}
              />
            </label>
            <label className="v3-field">
              Onboarding owner (from your team)
              <select
                value={owner}
                onChange={(e) => setOwnerName(e.target.value)}
              >
                {team.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="v3-field wide">
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
        <section className="v3-card">
          <p className="v3-muted">
            Who on the customer’s side will answer us, and what do they decide?
            Questions and document requests go to the person who decides the
            topic.
          </p>
          {contacts.map((c) => (
            <ContactCard
              key={c.name}
              c={c}
              onRemove={() =>
                setContacts(contacts.filter((x) => x.name !== c.name))
              }
            />
          ))}
          {contacts.length === 0 && !adding && (
            <div className="v3-emptyteam">
              <strong>No customer team members yet</strong>
              <p className="v3-muted">
                Add the people who will answer our questions and send us
                documents.
              </p>
            </div>
          )}
          {adding ? (
            <ContactForm
              existing={contacts}
              onAdd={(c) => {
                setContacts([...contacts, c]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <div className="v3-actions">
              <button
                className="v3-btn secondary"
                onClick={() => setAdding(true)}
              >
                ＋ Add team member
              </button>
              {contacts.length === 0 && (
                <button
                  className="v3-link"
                  onClick={() =>
                    setContacts(
                      demoClient.contacts.map((c) => ({
                        ...c,
                        decides: [...c.decides],
                      })),
                    )
                  }
                >
                  Use the sample team for the demo
                </button>
              )}
            </div>
          )}
          {uncovered.length > 0 && contacts.length > 0 && (
            <p className="v3-warn">
              No one decides:{" "}
              {uncovered.map((t) => t.label.toLowerCase()).join(", ")}. Those
              items fall back to the first contact.
            </p>
          )}
        </section>
      )}
      {n === 3 && (
        <div className="v3-grid2">
          <section className="v3-card">
            <h3>{name || "Client"}</h3>
            <p className="v3-muted">
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
                <small className="v3-muted block">
                  Decides:{" "}
                  {c.decides
                    .map((d) => topics.find((t) => t.id === d)?.label)
                    .join(", ") || "nothing yet"}
                </small>
              </p>
            ))}
          </section>
          <section className="v3-card">
            <h3>What gets created</h3>
            <p className="v3-muted">
              A voice-agent onboarding with an empty spec of 20 required facts,
              and a plan with five phases:
            </p>
            {phaseNames.map((p, i) => (
              <p key={p}>
                {i + 1}. {p}
              </p>
            ))}
            <p className="v3-muted">Areas: {areas.join(", ")}.</p>
          </section>
        </div>
      )}
      <div className="v3-actions">
        {n > 1 && (
          <button className="v3-btn secondary" onClick={() => setN(n - 1)}>
            Back
          </button>
        )}
        {n < 3 ? (
          <button
            className="v3-btn"
            disabled={
              (n === 1 && !(name.trim() && properties.length)) ||
              (n === 2 && (contacts.length === 0 || adding))
            }
            onClick={() => setN(n + 1)}
          >
            Continue
          </button>
        ) : (
          <button
            className="v3-btn"
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

/* ------------------------------------------------------------------ customer portal */
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
  const client = state.client!;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState("");
  const person =
    client.contacts.find((c) => c.name === name)?.name ??
    client.contacts[0].name;
  const role = contactByName(state, person)?.role ?? "";
  const sentIds = sentQuestionIds(state);
  const questions = state.questions.filter(
    (q) => q.recipient === person && sentIds.includes(q.id),
  );
  const tasks = planTasks(state).filter(
    (t) => t.side === "customer" && t.assignee === person,
  );
  const phases = phaseProgress(state);

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
      `${entries.length} answer${entries.length === 1 ? "" : "s"} recorded in this simulated session. Earlier versions stay visible below.`,
    );
    setChoice({});
    setDetail({});
  }

  return (
    <div className="v3 v3-portal">
      <div className="v3-roleswitch" role="status">
        You are viewing the customer portal as <strong>{person}</strong>, {role}
        .
        <button className="v3-link" onClick={() => go("client", "plan")}>
          Return to the specialist view
        </button>
      </div>
      <header className="topbar">
        <i className="v3-logo-tile">so</i>
        <strong>{client.name}</strong>
        <span className="v3-muted">Onboarding portal · fictional</span>
        <span className="who">
          {client.contacts.map((c) => (
            <button
              key={c.name}
              className={`v3-chip ${c.name === person ? "on" : ""}`}
              onClick={() => setName(c.name)}
            >
              View as {c.name}
            </button>
          ))}
        </span>
      </header>
      <main className="body">
        <section className="hero">
          <p className="v3-mono">WELCOME</p>
          <h1>
            Hi {person.split(" ")[0]}, here’s where your agent setup stands.
          </h1>
          <p>
            Your implementation specialist is {client.owner}. Target go-live is{" "}
            {client.goLive}. You only see what needs you.
          </p>
        </section>
        <div className="v3-grid2">
          <section className="v3-card">
            <h3>Project plan</h3>
            {phases.map((p) => (
              <div className="v3-planrow" key={p.n}>
                <span>
                  <strong>{p.name}</strong>
                  <small className="v3-muted">
                    {p.status === "Upcoming"
                      ? "Not started"
                      : `${p.done} of ${p.total} done`}
                  </small>
                </span>
                <span className="v3-bar thin">
                  <span
                    className={`seg ${p.status === "Done" ? "confirmed" : "known"}`}
                    style={{ flex: p.done }}
                  />
                  <span
                    className="seg rest"
                    style={{ flex: Math.max(p.total - p.done, 0) }}
                  />
                </span>
              </div>
            ))}
          </section>
          <section className="v3-card">
            <h3>Your tasks</h3>
            {tasks.length === 0 && (
              <p className="v3-muted">Nothing is assigned to you yet.</p>
            )}
            {tasks.map((t) => (
              <div className="v3-task compact" key={t.id}>
                <StatusDot status={t.status} />
                <span className="title">{t.title}</span>
                <span className="due">{t.due}</span>
                {t.id.startsWith("p2-") &&
                  t.status !== "Done" &&
                  t.status !== "Blocked" && (
                    <button
                      className="v3-btn secondary"
                      onClick={() =>
                        update((s) => uploadSource(s, t.id.slice(3)))
                      }
                    >
                      Upload
                    </button>
                  )}
              </div>
            ))}
          </section>
        </div>
        {receipt && (
          <div className="v3-banner success" role="status">
            {receipt}
          </div>
        )}
        {questions.length === 0 && (
          <p className="v3-muted">No questions are waiting for you.</p>
        )}
        {questions.length > 0 && !review && (
          <>
            <h2 className="v3-sectiontitle">Questions for you</h2>
            {questions.map((q, index) => (
              <section className="v3-card" key={q.id}>
                <div className="v3-cardhead">
                  <span className="v3-mono">QUESTION {index + 1}</span>
                  <Tag>
                    {q.revisions.length
                      ? `Answered ${q.revisions.length}×`
                      : "Not answered"}
                  </Tag>
                </div>
                <h3 className="q">{q.text}</h3>
                <p className="v3-muted">
                  Context shared with you: {q.source}. No full source document
                  is included.
                </p>
                <div
                  className="v3-options"
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
                        onChange={() => setChoice({ ...choice, [q.id]: value })}
                      />{" "}
                      {label}
                    </label>
                  ))}
                </div>
                <label className="v3-field">
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
                  <details className="v3-evidence">
                    <summary>Your earlier answers</summary>
                    {q.revisions.map((r, i) => (
                      <p key={i}>
                        <strong>{r.at}:</strong>{" "}
                        {r.kind === "answer"
                          ? r.value
                          : r.kind === "unknown"
                            ? "I don’t know"
                            : "Someone else should answer"}
                      </p>
                    ))}
                  </details>
                )}
              </section>
            ))}
            <div className="v3-actions">
              <button className="v3-btn" onClick={() => setReview(true)}>
                Review answers →
              </button>
            </div>
            <p className="v3-muted">
              Your name and role are self-declared in a real workflow. A review
              link does not verify identity or provide legal authorization.
            </p>
          </>
        )}
        {review && (
          <section className="v3-card">
            <h3>Check before submitting</h3>
            {questions
              .filter((q) => choice[q.id] || detail[q.id]?.trim())
              .map((q) => (
                <p key={q.id}>
                  <strong>{q.title}:</strong>{" "}
                  {choice[q.id] === "unknown"
                    ? "I don’t know"
                    : choice[q.id] === "delegate"
                      ? "Someone else should answer"
                      : composed(q)}
                </p>
              ))}
            <div className="v3-actions">
              <button
                className="v3-btn secondary"
                onClick={() => setReview(false)}
              >
                Edit answers
              </button>
              <button className="v3-btn" onClick={submit}>
                Submit selected answers
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
