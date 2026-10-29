"use client";

import { useState } from "react";
import {
  agentStatus,
  configurable,
  coverageOf,
  isConfirmed,
  launchChecklist,
  markConfigured,
  onboardingSteps,
  prereqItems,
  publishAgent,
  readiness,
  recordTest,
  shownLifecycle,
  shownValue,
  testCases,
  testStatus,
  togglePrereq,
  type Landing,
} from "./state";
import { Tag, tone, type Ctx } from "./ui";

const groups: { lands: Landing; title: string; blurb: string }[] = [
  {
    lands: "Context",
    title: "Prompt and context",
    blurb: "Agent objectives, scope and property context",
  },
  {
    lands: "Call routing",
    title: "Call routing and escalation",
    blurb: "Who the agent hands off to, when, and the fallback",
  },
  {
    lands: "Knowledge",
    title: "Knowledge",
    blurb: "What the agent can answer from the customer's content",
  },
  {
    lands: "Skill",
    title: "Skills",
    blurb: "Scenario handling: what to collect and what to do",
  },
  {
    lands: "Integration",
    title: "Integrations",
    blurb: "Systems the agent reads from and writes to",
  },
];

function Locked({ ctx, what }: { ctx: Ctx; what: string }) {
  const { state, go } = ctx;
  const blockers = readiness(state).blockers;
  return (
    <section className="v3-card v3-locked">
      <span className="lock">🔒</span>
      <div>
        <h3>{what} opens when clarification is done</h3>
        <p className="v3-muted">
          The agent is built only from confirmed details. These are still open:
        </p>
        <ul>
          {(blockers.length
            ? blockers
            : ["Finish the remaining tasks in Clarifications."]
          ).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <div className="v3-actions">
          <button
            className="v3-btn"
            onClick={() => go("client", "clarifications")}
          >
            Go to Clarifications
          </button>
          <button
            className="v3-btn secondary"
            onClick={() => go("client", "documents")}
          >
            Go to Documents
          </button>
        </div>
      </div>
    </section>
  );
}

const unlocked = (ctx: Ctx) => onboardingSteps(ctx.state)[2].status === "Done";

export function AgentTab({ ctx }: { ctx: Ctx }) {
  const { state, update, flash } = ctx;
  if (!unlocked(ctx)) return <Locked ctx={ctx} what="The agent" />;
  const client = state.client!;
  const st = agentStatus(state);
  const canPublish = st.allConfigured && !(st.published && !st.unpublished);
  return (
    <div className="v3-split">
      <div>
        <section className="v3-card v3-agenthead">
          <div>
            <p className="v3-mono">AGENT</p>
            <h2>{client.name} receptionist</h2>
            <div className="v3-tags">
              <Tag kind="blue">Inbound</Tag>
              {client.channels.map((c) => (
                <Tag key={c} kind="gray">
                  {c.replace(/^Inbound /, "")}
                </Tag>
              ))}
              <Tag>
                {st.published && !st.unpublished ? "Published" : "Draft"}
              </Tag>
            </div>
          </div>
          <span className="v3-muted">
            {st.configured} of {st.total} details configured
          </span>
        </section>
        {groups.map((g) => {
          const facts = state.facts.filter((f) => f.lands === g.lands);
          return (
            <section className="v3-card" key={g.lands}>
              <div className="v3-cardhead">
                <div>
                  <h3>{g.title}</h3>
                  <p className="v3-muted">{g.blurb}</p>
                </div>
              </div>
              {facts.map((f) => {
                const can =
                  configurable(f) &&
                  f.lifecycle !== "Configured" &&
                  (!f.critical || isConfirmed(f));
                const life = f.waived ? "Waived" : shownLifecycle(state, f);
                return (
                  <div className="v3-cfg" key={f.id}>
                    <span className="id">{f.id}</span>
                    <span className="body">
                      <strong>{f.label}</strong>
                      <small>
                        {f.value ?? shownValue(f) ?? "Not received"}
                      </small>
                      {f.customerAnswer &&
                        f.customerAnswer.value !== f.value && (
                          <small>
                            Customer answer: {f.customerAnswer.value}
                          </small>
                        )}
                      <small className="v3-muted">{f.anchor}</small>
                    </span>
                    <Tag
                      kind={
                        f.area === "Goals" && coverageOf(f) === "known"
                          ? "gray"
                          : undefined
                      }
                    >
                      {f.area === "Goals" && coverageOf(f) === "known"
                        ? "Informs the prompt"
                        : life}
                    </Tag>
                    {can ? (
                      <button
                        className="v3-btn secondary"
                        onClick={() => update((s) => markConfigured(s, f.id))}
                      >
                        Mark configured
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <aside className="v3-side">
        <section className="v3-card">
          <h3>Versions</h3>
          <div className="v3-version draft">
            <span>
              <strong>Draft</strong>
              <small>{st.label}</small>
            </span>
            <button
              className="v3-btn"
              disabled={!canPublish}
              onClick={() => {
                update((s) => publishAgent(s));
                flash(
                  "Published. The draft is now locked as a version that tests run against.",
                );
              }}
            >
              Publish
            </button>
          </div>
          {!st.allConfigured && (
            <p className="v3-muted">
              Configure every detail first. {st.total - st.configured} left.
            </p>
          )}
          {state.agentVersions
            .slice()
            .reverse()
            .map((v) => (
              <div className="v3-version" key={v.n}>
                <span>
                  <strong>v{v.n}</strong>
                  <small>{v.note}</small>
                </span>
                <Tag kind="green">Locked</Tag>
              </div>
            ))}
          {state.agentVersions.length === 0 && (
            <p className="v3-muted">No published versions yet.</p>
          )}
        </section>
        <section className="v3-card">
          <h3>Go-live setup</h3>
          <p className="v3-muted">
            Typical items for a voice agent on this kind of platform, from
            public setup pages. Replace with your own checklist.
          </p>
          <ul className="v3-checks">
            {prereqItems.map((p) => (
              <li key={p.id}>
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
        </section>
      </aside>
    </div>
  );
}

export function TestsTab({ ctx }: { ctx: Ctx }) {
  const { state, update } = ctx;
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!unlocked(ctx)) return <Locked ctx={ctx} what="Testing" />;
  const cases = testCases(state);
  const gate = launchChecklist(state);
  const st = agentStatus(state);
  const passing = cases.filter((t) => testStatus(state, t) === "Pass").length;
  return (
    <div className="v3-split">
      <div>
        <section className="v3-card v3-agenthead">
          <div>
            <p className="v3-mono">TESTING</p>
            <h2>
              {passing} of {cases.length} scenarios passing
            </h2>
            <p className="v3-muted">
              Against: {st.label}. This app does not run the scenarios: try each
              one, then record the result. Changing a detail marks its results
              “Needs retest”.
            </p>
          </div>
        </section>
        {state.facts
          .filter((f) => cases.some((t) => t.factId === f.id))
          .map((f) => {
            const mine = cases.filter((t) => t.factId === f.id);
            const ok = mine.filter(
              (t) => testStatus(state, t) === "Pass",
            ).length;
            return (
              <details
                className="v3-group"
                key={f.id}
                open={f.critical || undefined}
              >
                <summary>
                  <span className="chev" />
                  <strong>
                    {f.id} · {f.label}
                  </strong>
                  {f.critical && <Tag kind="red">Critical</Tag>}
                  <span className="count">
                    {ok} of {mine.length} passing
                  </span>
                </summary>
                {mine.map((t) => {
                  const result = testStatus(state, t);
                  return (
                    <article
                      className={`v3-scenario ${tone(result)}`}
                      key={t.id}
                    >
                      <header>
                        <span className="v3-mono">
                          SCENARIO {t.id} · {t.kind.toUpperCase()}
                          {t.critical ? " · CRITICAL" : ""}
                        </span>
                        <Tag>{result}</Tag>
                      </header>
                      <div className="rows">
                        <div className="row">
                          <span className="label">SCENARIO</span>
                          <span>{t.scenario}</span>
                        </div>
                        <div className="row">
                          <span className="label">EXPECTED</span>
                          <span>{t.expected}</span>
                        </div>
                        {state.tests[t.id]?.note && (
                          <div className="row">
                            <span className="label">NOTE</span>
                            <span>{state.tests[t.id].note}</span>
                          </div>
                        )}
                      </div>
                      <footer>
                        <button
                          className="v3-btn secondary"
                          onClick={() =>
                            update((s) =>
                              recordTest(s, t.id, "Pass", notes[t.id] ?? ""),
                            )
                          }
                        >
                          Record pass
                        </button>
                        <button
                          className="v3-btn secondary"
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
                          value={notes[t.id] ?? ""}
                          onChange={(e) =>
                            setNotes({ ...notes, [t.id]: e.target.value })
                          }
                        />
                      </footer>
                    </article>
                  );
                })}
              </details>
            );
          })}
      </div>
      <aside className="v3-side">
        <section className="v3-card">
          <h3>Launch gate</h3>
          <ul className="v3-gate">
            {gate.map((c) => (
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
      </aside>
    </div>
  );
}
