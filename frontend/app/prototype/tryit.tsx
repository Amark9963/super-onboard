"use client";

import { tryItSteps, type TryStep } from "./demo";
import type { Ctx } from "./ui";

/**
 * The "Try it" guide: a slim bar at the bottom that always shows the next step, and a list of all
 * steps that opens on demand. It never sits on top of the page content by default.
 */
export function TryIt({
  ctx,
  expanded,
  setExpanded,
  onClose,
  openTray,
}: {
  ctx: Ctx;
  expanded: boolean;
  setExpanded: (open: boolean) => void;
  onClose: () => void;
  openTray: () => void;
}) {
  const { state, go, setPortalName } = ctx;
  const steps = tryItSteps(state);
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const next = required.find((s) => !s.done);

  function run(step: TryStep) {
    setExpanded(false);
    const t = step.target;
    if (t.kind === "tray") return openTray();
    if (t.kind === "client") return go("client", t.tab);
    if (t.view === "portal") {
      const sent = state.questions.find(
        (q) => q.status === "Sent" || q.status === "Response received",
      );
      setPortalName(sent?.recipient ?? state.client?.contacts[0]?.name ?? "");
    }
    go(t.view);
  }

  return (
    <div className="v3-tryit" aria-label="Try it">
      {expanded && (
        <section className="list" aria-label="All steps">
          <header>
            <div>
              <p className="v3-mono">TRY IT · ABOUT FIVE MINUTES</p>
              <h2>Walk through an onboarding</h2>
            </div>
            <button className="v3-link" onClick={() => setExpanded(false)}>
              Hide list
            </button>
          </header>
          <p className="v3-muted">
            Everything is simulated, with fictional data. Steps tick off by
            themselves.
          </p>
          <ol>
            {steps.map((s, i) => {
              const isNext = next?.id === s.id;
              const blocked = s.needsClient && !state.client;
              return (
                <li
                  key={s.id}
                  className={`${s.done ? "done" : ""} ${isNext ? "next" : ""}`}
                >
                  <b>{s.done ? "✓" : s.optional ? "·" : i + 1}</b>
                  <span>
                    <strong>
                      {s.title}
                      {s.optional && <small> optional</small>}
                    </strong>
                    {!s.done && <small className="hint">{s.hint}</small>}
                  </span>
                  {!s.done && (
                    <button
                      className={`v3-btn ${isNext ? "" : "secondary"}`}
                      disabled={blocked}
                      onClick={() => run(s)}
                      title={blocked ? "Start an onboarding first" : undefined}
                    >
                      Go
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <div className="bar" role="region" aria-label="Next step">
        <span className="count">
          {done}/{required.length}
        </span>
        <span className="msg">
          {next ? (
            <>
              <small>Next step</small>
              <strong>{next.title}</strong>
            </>
          ) : (
            <>
              <small>Try it</small>
              <strong>You have been through the whole journey.</strong>
            </>
          )}
        </span>
        {next && (
          <button
            className="v3-btn go"
            disabled={next.needsClient && !state.client}
            onClick={() => run(next)}
          >
            Go
          </button>
        )}
        <button
          className="v3-btn secondary"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide steps" : "All steps"}
        </button>
        <button
          className="v3-link close"
          onClick={onClose}
          aria-label="Close the guide"
        >
          ×
        </button>
      </div>
    </div>
  );
}
