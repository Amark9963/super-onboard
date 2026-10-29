"use client";

import { useState } from "react";
import {
  assignments,
  consistencyReport,
  nextActions,
  runConsistencyCheck,
  sendDocumentRequest,
  slackUpdate,
  topics,
  weeklyCheckIn,
  type NextAction,
} from "./state";
import { phaseNames, planTasks, type Tab, type Task } from "./plan";
import {
  Avatar,
  PhaseBar,
  Person,
  StatusDot,
  Tag,
  tabLabels,
  tabOrder,
  type Ctx,
} from "./ui";
import { DocumentsTab } from "./documents";
import { ClarificationsTab } from "./clarifications";
import { AgentTab, TestsTab } from "./agent";
import { RequirementsTab } from "./requirements";

/** Where a next action is worked on. */
export function tabFor(a: NextAction): Tab {
  if (
    ["request-docs", "upload", "review-sources", "run-check"].includes(a.id) ||
    a.id.startsWith("conflict-")
  )
    return "documents";
  if (
    ["approve-wording"].includes(a.id) ||
    a.id.startsWith("send-") ||
    a.id.startsWith("review-") ||
    a.id.startsWith("gap-")
  )
    return "clarifications";
  if (["prereqs", "configure", "publish"].includes(a.id)) return "agent";
  if (a.id === "tests") return "tests";
  return "plan";
}

export default function Workspace({
  ctx,
  tab,
  welcome,
  dismissWelcome,
}: {
  ctx: Ctx;
  tab: Tab;
  welcome: boolean;
  dismissWelcome: () => void;
}) {
  const { state, go } = ctx;
  const client = state.client!;
  const [draft, setDraft] = useState("");
  const report = consistencyReport(state);
  const customerWaiting = assignments(state).filter(
    (a) => a.side === "customer",
  ).length;
  const badge: Partial<Record<Tab, number>> = {
    documents: report.open.length,
    clarifications: customerWaiting,
  };
  return (
    <>
      {welcome && tab === "plan" && (
        <div className="v3-banner success" role="status">
          <span>
            <strong>Onboarding created from the voice-agent template.</strong>{" "}
            The spec of 20 required facts is empty. Start with the document
            request.
          </span>
          <button aria-label="Dismiss" onClick={dismissWelcome}>
            ×
          </button>
        </div>
      )}
      <header className="v3-wshead">
        <div className="v3-wsid">
          <i className="v3-logo-tile">{client.name[0]}</i>
          <div>
            <h1>{client.name}</h1>
            <p className="v3-muted">
              {client.vertical} · {client.scope} ·{" "}
              {client.goLive ? `Go-live ${client.goLive}` : ""}
            </p>
          </div>
          <Tag kind="blue">{client.plan} plan</Tag>
        </div>
        <div className="v3-wsactions">
          <button
            className="v3-btn secondary"
            onClick={() => setDraft(draft ? "" : weeklyCheckIn(state))}
          >
            Weekly check-in
          </button>
          <button
            className="v3-btn secondary"
            onClick={() => setDraft(draft ? "" : slackUpdate(state))}
          >
            Slack update
          </button>
          <button className="v3-btn secondary" onClick={() => go("portal")}>
            Preview as customer
          </button>
        </div>
      </header>
      {draft && <pre className="v3-pre">{draft}</pre>}
      <PhaseBar state={state} />
      <nav className="v3-tabs" aria-label="Workspace">
        {tabOrder.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => go("client", t)}
            aria-current={tab === t ? "page" : undefined}
          >
            {tabLabels[t]}
            {badge[t] ? <b>{badge[t]}</b> : null}
          </button>
        ))}
      </nav>
      <div className="v3-tabbody">
        {tab === "plan" && <PlanTab ctx={ctx} />}
        {tab === "documents" && <DocumentsTab ctx={ctx} />}
        {tab === "clarifications" && <ClarificationsTab ctx={ctx} />}
        {tab === "requirements" && <RequirementsTab ctx={ctx} />}
        {tab === "agent" && <AgentTab ctx={ctx} />}
        {tab === "tests" && <TestsTab ctx={ctx} />}
        {tab === "activity" && <ActivityTab ctx={ctx} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ plan */
function TaskRow({ t, ctx }: { t: Task; ctx: Ctx }) {
  return (
    <div className={`v3-task ${t.status === "Done" ? "done" : ""}`}>
      <StatusDot status={t.status} />
      <span className="title">{t.title}</span>
      <Person name={t.assignee} role={t.role} side={t.side} compact />
      <span className="side">
        {t.side === "customer" ? "Customer" : "Our team"}
      </span>
      <span className="due">{t.due}</span>
      <button className="v3-link" onClick={() => ctx.go("client", t.tab)}>
        Open
      </button>
    </div>
  );
}

function PlanTab({ ctx }: { ctx: Ctx }) {
  const { state, update, flash, go } = ctx;
  const client = state.client!;
  const tasks = planTasks(state);
  const next = nextActions(state).slice(0, 3);
  const firstOpenPhase =
    phaseNames.findIndex((_, i) =>
      tasks.some((t) => t.phase === i + 1 && t.status !== "Done"),
    ) + 1 || 5;

  function act(a: NextAction) {
    if (a.id === "request-docs") {
      update(sendDocumentRequest);
      flash(
        "Simulated: the document request went to each contact. No email was sent.",
      );
    } else if (a.id === "run-check") {
      update(runConsistencyCheck);
    }
    go("client", tabFor(a));
  }

  return (
    <div className="v3-split">
      <div>
        {phaseNames.map((name, i) => {
          const mine = tasks.filter((t) => t.phase === i + 1);
          const done = mine.filter((t) => t.status === "Done").length;
          return (
            <details
              className="v3-phase"
              key={name}
              open={i + 1 === firstOpenPhase || undefined}
            >
              <summary>
                <span className="chev" />
                <strong>
                  {i + 1}. {name}
                </strong>
                <span className="count">
                  {done} of {mine.length}
                </span>
                <Tag
                  kind={
                    done === mine.length && mine.length
                      ? "green"
                      : i + 1 === firstOpenPhase
                        ? "blue"
                        : "gray"
                  }
                >
                  {done === mine.length && mine.length
                    ? "Done"
                    : i + 1 === firstOpenPhase
                      ? "Current"
                      : "Upcoming"}
                </Tag>
              </summary>
              <div className="v3-tasks">
                <div className="v3-taskhead">
                  <span />
                  <span>Task</span>
                  <span>Assigned to</span>
                  <span>Side</span>
                  <span>Due</span>
                  <span />
                </div>
                {mine.map((t) => (
                  <TaskRow key={t.id} t={t} ctx={ctx} />
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <aside className="v3-side">
        <section className="v3-card">
          <h3>Next up</h3>
          {next.length === 0 && (
            <p className="v3-muted">Nothing needs a decision right now.</p>
          )}
          {next.map((a) => (
            <div className="v3-nextup" key={a.id}>
              <span>
                <strong>{a.title}</strong>
                <small>{a.subtitle}</small>
              </span>
              <button className="v3-btn" onClick={() => act(a)}>
                {a.id === "request-docs"
                  ? "Send"
                  : a.id === "run-check"
                    ? "Run"
                    : "Open"}
              </button>
            </div>
          ))}
        </section>
        <section className="v3-card">
          <h3>Properties</h3>
          <dl className="v3-props">
            <dt>Owner</dt>
            <dd>
              <Person name={client.owner} side="team" compact />
            </dd>
            <dt>Plan</dt>
            <dd>{client.plan}</dd>
            <dt>Kickoff</dt>
            <dd>{client.kickoff}</dd>
            <dt>Go-live</dt>
            <dd>{client.goLive}</dd>
            <dt>Channels</dt>
            <dd>{client.channels.join(", ")}</dd>
            <dt>Their systems</dt>
            <dd>{client.systems.join(" · ")}</dd>
          </dl>
        </section>
        <section className="v3-card">
          <h3>Customer team</h3>
          {client.contacts.map((c) => (
            <div className="v3-contact" key={c.name}>
              <Person name={c.name} role={c.role} side="customer" />
              <small className="v3-muted">
                Decides:{" "}
                {c.decides
                  .map((d) =>
                    topics.find((x) => x.id === d)?.label.toLowerCase(),
                  )
                  .join(", ")}
              </small>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ activity */
function ActivityTab({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const [filter, setFilter] = useState<"all" | "customer" | "team" | "system">(
    "all",
  );
  const events = [...state.activity]
    .reverse()
    .filter((e) => filter === "all" || e.actor.side === filter);
  return (
    <>
      <div className="v3-toolbar">
        <div className="v3-seg" role="group" aria-label="Filter activity">
          {(["all", "customer", "team", "system"] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "Everything"
                : f === "customer"
                  ? "Customer"
                  : f === "team"
                    ? "Our team"
                    : "Automatic"}
            </button>
          ))}
        </div>
        <span className="v3-muted">{events.length} events</span>
      </div>
      <section className="v3-card v3-feed">
        {events.length === 0 && (
          <p className="v3-muted">Nothing has happened yet.</p>
        )}
        {events.map((e) => (
          <div className="v3-event" key={e.id}>
            <Avatar name={e.actor.name} side={e.actor.side} />
            <span className="text">
              <strong>{e.actor.name}</strong> {e.text}
            </span>
            <small className="v3-muted">{e.at}</small>
          </div>
        ))}
      </section>
      <p className="v3-muted">
        Customer actions are shown in green, our team in grey and automatic
        checks in indigo.
      </p>
    </>
  );
}
