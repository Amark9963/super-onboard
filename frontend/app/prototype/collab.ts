// How our own team works together: internal notes with @mentions, the second-person review, the
// handover note and each person's queue. Pure functions over the same state as everything else.

import {
  assignments,
  coverage,
  currentStep,
  factById,
  factsSignature,
  reviewApproved,
  reviewReady,
  reviewRequestStale,
  reviewStale,
  stamp,
  type Note,
  type NoteTarget,
  type PrototypeState,
  type TeamMember,
} from "./state.ts";
import { phaseProgress, planTasks, type Tab, type Task } from "./plan.ts";

export const me = (state: PrototypeState): TeamMember | undefined =>
  state.team.find((m) => m.id === state.me);

export function setMe(state: PrototypeState, id: string): PrototypeState {
  const m = state.team.find((x) => x.id === id);
  return m && m.status === "Active" && state.me !== id
    ? { ...state, me: id }
    : state;
}

// ---------------------------------------------------------------------------------------------
// Internal notes
// ---------------------------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** People @mentioned by full name or first name. Only active members count. */
export function mentionsIn(team: TeamMember[], text: string): string[] {
  const found: string[] = [];
  for (const m of team.filter((x) => x.status === "Active")) {
    const first = m.name.split(" ")[0];
    const re = new RegExp(
      `@(${escape(m.name)}|${escape(first)})(?![\\p{L}\\p{N}])`,
      "iu",
    );
    if (re.test(text)) found.push(m.name);
  }
  return found;
}

export function addNote(
  state: PrototypeState,
  target: NoteTarget,
  text: string,
): PrototypeState {
  const author = me(state);
  const clean = text.trim();
  if (!state.client || !author || !clean) return state;
  const note: Note = {
    id: state.notes.length + 1,
    target,
    author: author.name,
    text: clean,
    mentions: mentionsIn(state.team, clean).filter((n) => n !== author.name),
    at: stamp(state.clock + 1),
    seenBy: [],
  };
  return { ...state, notes: [...state.notes, note] };
}

export const notesFor = (state: PrototypeState, target: NoteTarget) =>
  state.notes.filter(
    (n) => n.target.kind === target.kind && n.target.id === target.id,
  );

/** The person opened what they were mentioned in. */
export function markSeen(state: PrototypeState, ids: number[]): PrototypeState {
  const who = me(state)?.name;
  if (!who) return state;
  const todo = state.notes.filter(
    (n) =>
      ids.includes(n.id) && n.mentions.includes(who) && !n.seenBy.includes(who),
  );
  if (!todo.length) return state;
  return {
    ...state,
    notes: state.notes.map((n) =>
      todo.includes(n) ? { ...n, seenBy: [...n.seenBy, who] } : n,
    ),
  };
}

export function targetLabel(
  state: PrototypeState,
  t: NoteTarget,
): { label: string; tab: Tab } {
  if (t.kind === "fact")
    return { label: factById(state, t.id)?.label ?? t.id, tab: "requirements" };
  if (t.kind === "question")
    return {
      label: state.questions.find((q) => q.id === t.id)?.title ?? t.id,
      tab: "clarifications",
    };
  if (t.kind === "conflict")
    return { label: t.id.replace(/-/g, " "), tab: "documents" };
  return { label: state.client?.name ?? "the onboarding", tab: "plan" };
}

// ---------------------------------------------------------------------------------------------
// Review: a second team member signs off before setup starts
// ---------------------------------------------------------------------------------------------

/** Who can review: a QA reviewer or the lead, never the owner of this onboarding. */
export const reviewers = (state: PrototypeState) =>
  state.team.filter(
    (m) =>
      m.status === "Active" &&
      (m.role === "QA reviewer" || m.role === "Onboarding lead") &&
      m.name !== state.client?.owner,
  );

export type ReviewCheck = { ok: boolean; why: string };

export function canRequestReview(
  state: PrototypeState,
  reviewerName: string,
): ReviewCheck {
  const c = state.client;
  if (!c) return { ok: false, why: "Start an onboarding first." };
  if (!reviewReady(state))
    return {
      ok: false,
      why: "Finish clarification first: conflicts resolved, answers approved, gaps closed.",
    };
  if (me(state)?.name !== c.owner)
    return { ok: false, why: `Only ${c.owner} can ask for the review.` };
  if (state.review?.status === "Requested" && !reviewRequestStale(state))
    return { ok: false, why: `Already waiting for ${state.review.reviewer}.` };
  if (reviewApproved(state)) return { ok: false, why: "Already approved." };
  if (!reviewers(state).some((m) => m.name === reviewerName))
    return { ok: false, why: "Choose a reviewer." };
  return { ok: true, why: "" };
}

export function requestReview(
  state: PrototypeState,
  reviewerName: string,
): PrototypeState {
  if (!canRequestReview(state, reviewerName).ok) return state;
  return {
    ...state,
    review: {
      status: "Requested",
      reviewer: reviewerName,
      requestedBy: state.client!.owner,
      round: (state.review?.round ?? 0) + 1,
      reason: "",
      sig: factsSignature(state),
      at: stamp(state.clock + 1),
    },
  };
}

export function decideReview(
  state: PrototypeState,
  decision: "approve" | "changes",
  reason: string,
): PrototypeState {
  const r = state.review;
  if (
    !r ||
    r.status !== "Requested" ||
    me(state)?.name !== r.reviewer ||
    !reviewReady(state) ||
    reviewRequestStale(state)
  )
    return state;
  if (decision === "changes" && !reason.trim()) return state;
  return {
    ...state,
    review: {
      ...r,
      status: decision === "approve" ? "Approved" : "Changes requested",
      reason: reason.trim(),
      sig: factsSignature(state),
      at: stamp(state.clock + 1),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Handover note: what the next owner needs, generated from what is already in the system
// ---------------------------------------------------------------------------------------------

const DECISIONS = ["approve", "fix", "waive", "default", "review-decision"];

export function handoverNote(state: PrototypeState): string {
  const c = state.client;
  if (!c) return "";
  const step = currentStep(state);
  const cov = coverage(state);
  const all = assignments(state);
  const theirs = all.filter((a) => a.side === "customer");
  const ours = all.filter((a) => a.side === "team");
  const line = (a: (typeof all)[number]) => `- ${a.assignee}: ${a.title}`;
  const decisions = state.activity
    .filter((e) => DECISIONS.includes(e.kind))
    .slice(-5)
    .map((e) => `- ${e.text}`);
  const notes = state.notes
    .slice(-4)
    .map(
      (n) =>
        `- ${n.author} on “${targetLabel(state, n.target).label}”: ${n.text}`,
    );
  const risks = state.facts
    .filter((f) => f.waived)
    .map((f) => `- Waived “${f.label}”: ${f.waived!.reason}`);
  const review = state.review
    ? reviewStale(state)
      ? "Approved earlier, but details changed since. Needs another review."
      : `${state.review.status} (${state.review.reviewer}, round ${state.review.round})`
    : "Not requested yet.";
  return [
    `Handover · ${c.name}`,
    `Owner now: ${c.owner} · stage ${step.n} of 5 (${step.name}) · go-live ${c.goLive}`,
    `Details: ${cov.known} of ${cov.total} known, ${cov.confirmed} confirmed by the customer, ${cov.empty} not received`,
    "",
    "Waiting on the customer:",
    ...(theirs.length ? theirs.map(line) : ["- Nothing"]),
    "",
    "Waiting on our team:",
    ...(ours.length ? ours.map(line) : ["- Nothing"]),
    "",
    `Second-person review: ${review}`,
    "",
    "Recent decisions:",
    ...(decisions.length ? decisions : ["- None yet"]),
    ...(risks.length ? ["", "Known risks:", ...risks] : []),
    ...(notes.length ? ["", "Latest team notes:", ...notes] : []),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// A person's queue
// ---------------------------------------------------------------------------------------------

export type QueueItem = {
  id: string;
  kind: "task" | "review" | "mention";
  title: string;
  detail: string;
  tab: Tab;
  task?: Task;
  noteIds?: number[];
};

export function myQueue(state: PrototypeState): QueueItem[] {
  const who = me(state)?.name;
  const c = state.client;
  if (!who || !c) return [];
  const out: QueueItem[] = [];
  if (
    state.review?.status === "Requested" &&
    !reviewRequestStale(state) &&
    state.review.reviewer === who &&
    !reviewApproved(state)
  )
    out.push({
      id: "review",
      kind: "review",
      title: `Review the approved details for ${c.name}`,
      detail: `Asked by ${state.review.requestedBy}`,
      tab: "requirements",
    });
  const unseen = state.notes.filter(
    (n) => n.mentions.includes(who) && !n.seenBy.includes(who),
  );
  for (const n of unseen)
    out.push({
      id: `note-${n.id}`,
      kind: "mention",
      title: `${n.author} mentioned you on “${targetLabel(state, n.target).label}”`,
      detail: n.text,
      tab: targetLabel(state, n.target).tab,
      noteIds: [n.id],
    });
  const phase =
    phaseProgress(state).find((p) => p.status === "Current")?.n ?? 5;
  const tasks = planTasks(state).filter(
    (t) =>
      t.side === "team" &&
      t.assignee === who &&
      t.status !== "Done" &&
      t.id !== "p3-review" &&
      t.phase <= phase,
  );
  for (const t of tasks.slice(0, 6))
    out.push({
      id: t.id,
      kind: "task",
      title: t.title,
      detail: c.name,
      tab: t.tab,
      task: t,
    });
  return out;
}
