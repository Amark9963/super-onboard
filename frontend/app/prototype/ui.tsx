"use client";

import { coverageOf, isConfirmed, type PrototypeState } from "./state";
import { phaseProgress, type Tab, type TaskStatus } from "./plan";

export type View =
  "login" | "inbox" | "clients" | "new" | "client" | "insights" | "portal";

/** What every screen needs from the shell. */
export type Ctx = {
  state: PrototypeState;
  update: (fn: (s: PrototypeState) => PrototypeState) => void;
  flash: (message: string) => void;
  go: (view: View, tab?: Tab) => void;
  setPortalName: (name: string) => void;
};

const GREEN = [
  "Customer confirmed",
  "Customer approved",
  "Resolved",
  "Received",
  "Known",
  "Done",
  "Published",
];
const AMBER = [
  "Needs clarification",
  "Needs retest",
  "Defaulted",
  "Needs a readable copy",
  "Disputed",
  "In progress",
  "Draft",
];
const RED = ["Not received", "Fail", "Missing", "Blocked"];
const GRAY = ["Not reviewed", "Not run", "Waived", "To do"];

export const tone = (s: string) =>
  GREEN.includes(s)
    ? "green"
    : AMBER.includes(s)
      ? "amber"
      : RED.includes(s)
        ? "red"
        : GRAY.includes(s)
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
    <span className={`v3-tag ${kind ?? tone(String(children))}`}>
      {children}
    </span>
  );
}

type Side = "customer" | "team" | "system";
const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

export function Avatar({ name, side }: { name: string; side: Side }) {
  return (
    <i className={`v3-avatar ${side}`}>
      {side === "system" ? "⚙" : initials(name)}
    </i>
  );
}

/** A person with the side they are on, so it is always clear who an item is assigned to. */
export function Person({
  name,
  role,
  side,
  compact,
}: {
  name: string;
  role?: string;
  side: Side;
  compact?: boolean;
}) {
  return (
    <span className="v3-person">
      <Avatar name={name} side={side} />
      <span>
        <strong>{name}</strong>
        {!compact && (
          <small>
            {side === "customer"
              ? "Customer"
              : side === "team"
                ? "Our team"
                : "Automatic"}
            {role ? ` · ${role}` : ""}
          </small>
        )}
      </span>
    </span>
  );
}

export const statusIcon: Record<TaskStatus, string> = {
  Done: "✓",
  "In progress": "◐",
  "To do": "○",
  Blocked: "!",
};

export function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`v3-statusdot ${tone(status)}`}
      title={status}
      aria-label={status}
    >
      {statusIcon[status]}
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
    ["known", "Known"],
    ["clarifying", "Being clarified"],
    ["waived", "Waived"],
    ["empty", "Not received"],
  ];
  return (
    <div className="v3-coverage">
      <div
        className="v3-bar"
        role="img"
        aria-label={`${seg.confirmed + seg.known} of ${facts.length} required facts known`}
      >
        {items.map(([k]) =>
          seg[k] ? (
            <span key={k} className={`seg ${k}`} style={{ flex: seg[k] }} />
          ) : null,
        )}
      </div>
      <ul className="v3-legend">
        {items.map(([k, label]) => (
          <li key={k}>
            <i className={`seg ${k}`} /> {seg[k]} {label.toLowerCase()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The five phases as a segmented progress bar with counts. */
export function PhaseBar({ state }: { state: PrototypeState }) {
  const phases = phaseProgress(state);
  return (
    <ol className="v3-phasebar" aria-label="Onboarding phases">
      {phases.map((p) => (
        <li key={p.n} className={p.status.toLowerCase()}>
          <span
            className="fill"
            style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }}
          />
          <strong>{p.name}</strong>
          <small>
            {p.status === "Upcoming"
              ? "Not started"
              : `${p.done} of ${p.total} done`}
          </small>
        </li>
      ))}
    </ol>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="v3-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export const tabLabels: Record<Tab, string> = {
  plan: "Plan",
  documents: "Documents",
  clarifications: "Clarifications",
  requirements: "Requirements",
  activity: "Activity",
};
export const tabOrder: Tab[] = [
  "plan",
  "documents",
  "clarifications",
  "requirements",
  "activity",
];
