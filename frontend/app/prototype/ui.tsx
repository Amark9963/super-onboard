"use client";

import {
  coverageOf,
  isConfirmed,
  type PrototypeState,
  type Step,
} from "./state";

export type View =
  "clients" | "new" | "journey" | "spec" | "process" | "portal";

/** What every screen needs from the shell. */
export type Ctx = {
  state: PrototypeState;
  update: (fn: (s: PrototypeState) => PrototypeState) => void;
  flash: (message: string) => void;
  go: (view: View) => void;
  setPortalRole: (role: string) => void;
  setFocusFact: (id: string) => void;
};

export const tone = (s: string) =>
  [
    "Customer confirmed",
    "Customer approved",
    "Configured",
    "Tested",
    "Pass",
    "Resolved",
    "Received",
  ].includes(s)
    ? "green"
    : [
          "Needs clarification",
          "Needs retest",
          "Defaulted",
          "Needs a readable copy",
        ].includes(s)
      ? "amber"
      : ["Not received", "Fail", "Missing"].includes(s)
        ? "red"
        : ["Not reviewed", "Not run", "Waived"].includes(s)
          ? "gray"
          : "blue";

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function Tag({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind?: string;
}) {
  return (
    <span className={`v2-tag ${kind ?? tone(String(children))}`}>
      {children}
    </span>
  );
}

/** Stacked bar: how much of the spec is confirmed, known, being clarified, or still empty. */
export function CoverageBar({ state }: { state: PrototypeState }) {
  const facts = state.facts;
  const seg = {
    confirmed: facts.filter((f) => coverageOf(f) === "known" && isConfirmed(f))
      .length,
    known: facts.filter((f) => coverageOf(f) === "known" && !isConfirmed(f))
      .length,
    clarifying: facts.filter((f) => coverageOf(f) === "clarifying").length,
    waived: facts.filter((f) => coverageOf(f) === "waived").length,
    empty: facts.filter((f) => coverageOf(f) === "empty").length,
  };
  const items: [keyof typeof seg, string][] = [
    ["confirmed", "Customer-confirmed"],
    ["known", "Known, not yet confirmed"],
    ["clarifying", "Being clarified"],
    ["waived", "Waived"],
    ["empty", "Not received"],
  ];
  return (
    <div className="v2-coverage">
      <div
        className="v2-bar"
        role="img"
        aria-label={`${seg.confirmed + seg.known} of ${facts.length} required facts known`}
      >
        {items.map(([k]) =>
          seg[k] ? (
            <span key={k} className={`seg ${k}`} style={{ flex: seg[k] }} />
          ) : null,
        )}
      </div>
      <ul className="v2-legend">
        {items.map(([k, label]) => (
          <li key={k}>
            <i className={`seg ${k}`} /> {seg[k]} {label.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The five stages as a connected pipeline. */
export function Stepper({
  steps,
  active,
  onSelect,
}: {
  steps: Step[];
  active: number;
  onSelect?: (n: number) => void;
}) {
  return (
    <ol className="v2-stepper" aria-label="Onboarding stages">
      {steps.map((s) => {
        const body = (
          <>
            <span className="node">{s.status === "Done" ? "✓" : s.n}</span>
            <span className="label">
              <strong>{s.name}</strong>
              <small>
                {s.status === "Done"
                  ? "Done"
                  : s.status === "Current"
                    ? s.detail
                    : "Locked"}
              </small>
            </span>
          </>
        );
        return (
          <li
            key={s.n}
            className={`${s.status.toLowerCase()} ${active === s.n ? "active" : ""}`}
          >
            {onSelect ? (
              <button
                onClick={() => onSelect(s.n)}
                aria-current={active === s.n ? "step" : undefined}
              >
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
