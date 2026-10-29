"use client";

import { useState } from "react";
import {
  allSources,
  areas,
  configurable,
  coverageOf,
  isConfirmed,
  markConfigured,
  reviewFact,
  routingTable,
  shownLifecycle,
  shownValue,
  testCases,
  testStatus,
  waiveFact,
  type Fact,
  type PrototypeState,
} from "./state";
import { Tag, type Ctx } from "./ui";

function FactRow({
  state,
  f,
  onReview,
  onConfigure,
  waive,
}: {
  state: PrototypeState;
  f: Fact;
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
      className={`v3-fact ${coverageOf(f) === "empty" ? "gap" : ""}`}
    >
      <div className="label">
        <strong>
          <span className="id">{f.id}</span> {f.label}
        </strong>
        {f.critical && <Tag kind="red">Critical</Tag>}
        <small>Lands in: {f.lands}</small>
      </div>
      <div className="body">
        {value ? (
          <p className="value">{value}</p>
        ) : (
          <p className="value gap">Not received yet.</p>
        )}
        {f.customerAnswer && f.customerAnswer.value !== f.value && (
          <p className="v3-muted">Customer answer: {f.customerAnswer.value}</p>
        )}
        {f.note && <p className="v3-muted">{f.note}</p>}
        {f.waived && (
          <p className="v3-muted">
            Waived by {f.waived.owner}: {f.waived.reason}
          </p>
        )}
        {(f.sourceId || value) && (
          <small className="v3-muted">
            {source ? `${source} · ` : ""}
            {f.anchor}
          </small>
        )}
        {f.evidence && (
          <details className="v3-evidence">
            <summary>Evidence</summary>
            <p>“{f.evidence}”</p>
          </details>
        )}
      </div>
      <div className="state">
        <Tag kind={f.waived ? "gray" : undefined}>{life}</Tag>
        <Tag>{f.approval}</Tag>
        {mine.length > 0 && (
          <small className="v3-muted">
            Tests {passing}/{mine.length}
          </small>
        )}
      </div>
      {(canReview || canConfigure || canWaive) && (
        <div className="v3-actions wide">
          {canReview && (
            <button className="v3-btn secondary" onClick={onReview}>
              Mark reviewed
            </button>
          )}
          {canConfigure && (
            <button className="v3-btn secondary" onClick={onConfigure}>
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
                className="v3-btn secondary"
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

export function RequirementsTab({ ctx }: { ctx: Ctx }) {
  const { state, update } = ctx;
  const table = routingTable(state);
  return (
    <>
      <section className="v3-card">
        <div className="v3-cardhead">
          <div>
            <h3>Customer team: roles and rules in the system</h3>
            <p className="v3-muted">
              Who the agent hands off to, when, and the fallback. Roles only,
              never a static roster.
            </p>
          </div>
        </div>
        <table className="v3-table">
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
                  <small className="v3-muted block">{r.source}</small>
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
      </section>
      {areas.map((area) => (
        <section className="v3-card" key={area}>
          <div className="v3-cardhead">
            <h3>
              {area}{" "}
              <span className="v3-count">
                {state.facts.filter((f) => f.area === area).length}
              </span>
            </h3>
          </div>
          {state.facts
            .filter((f) => f.area === area)
            .map((f) => (
              <FactRow
                key={f.id}
                state={state}
                f={f}
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
