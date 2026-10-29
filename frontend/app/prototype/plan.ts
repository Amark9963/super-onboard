// The onboarding plan: phases containing tasks, each with an owner (customer or team), a status
// and a due date. Derived entirely from state, so it can never drift from the actual work.

import {
  agentPublished,
  agentStatus,
  allSources,
  consistencyReport,
  contactByName,
  coverageOf,
  documentRequests,
  factById,
  needsReview,
  prereqItems,
  sourceCatalog,
  testCases,
  testStatus,
  topicsCovered,
  type PrototypeState,
} from "./state.ts";
import { documentRows } from "./client.ts";

export type TaskStatus = "Done" | "In progress" | "To do" | "Blocked";
export type Tab =
  | "plan"
  | "documents"
  | "clarifications"
  | "requirements"
  | "agent"
  | "tests"
  | "activity";
export type Task = {
  id: string;
  phase: 1 | 2 | 3 | 4 | 5;
  title: string;
  side: "customer" | "team";
  assignee: string;
  role: string;
  status: TaskStatus;
  due: string;
  tab: Tab;
};

export const phaseNames = [
  "Kickoff and client details",
  "Collect information",
  "Clarify and confirm",
  "Configure and test",
  "Go live and tune",
];

export function planTasks(state: PrototypeState): Task[] {
  const client = state.client;
  if (!client) return [];
  const owner = client.owner;
  const tasks: Task[] = [];
  const add = (x: Omit<Task, "role"> & { role?: string }) =>
    tasks.push({
      role:
        x.side === "team"
          ? "Onboarding specialist"
          : (contactByName(state, x.assignee)?.role ?? ""),
      ...x,
    });
  const report = consistencyReport(state);
  const allUploaded = documentRequests.every((d) =>
    state.addedSources.includes(d.sourceId),
  );

  // Phase 1
  add({
    id: "p1-client",
    phase: 1,
    title: "Capture the client details",
    side: "team",
    assignee: owner,
    status: "Done",
    due: "Oct 22",
    tab: "plan",
  });
  add({
    id: "p1-team",
    phase: 1,
    title: "Confirm who on the customer team decides what",
    side: "team",
    assignee: owner,
    status: topicsCovered(client) ? "Done" : "In progress",
    due: "Oct 22",
    tab: "plan",
  });
  add({
    id: "p1-request",
    phase: 1,
    title: "Send the document request",
    side: "team",
    assignee: owner,
    status: state.docsRequested ? "Done" : "In progress",
    due: "Oct 23",
    tab: "documents",
  });

  // Phase 2
  for (const r of documentRows(state)) {
    const waived = r.sourceId === "scan" && factById(state, "F4")?.waived;
    const uploaded = state.addedSources.includes(r.sourceId);
    const unreadable = r.status === "Needs a readable copy";
    const status: TaskStatus =
      waived || (uploaded && !unreadable)
        ? "Done"
        : unreadable
          ? state.copyRequested
            ? "In progress"
            : "Blocked"
          : state.docsRequested
            ? "In progress"
            : "To do";
    add({
      id: `p2-${r.sourceId}`,
      phase: 2,
      side: r.side,
      assignee: r.assignee,
      status,
      due: "Oct 25",
      tab: "documents",
      title: unreadable
        ? `Send a readable copy: ${r.label}`
        : r.side === "team"
          ? `Upload the ${r.label.toLowerCase()}`
          : `Send: ${r.label}`,
    });
    if (uploaded && needsReview(r.source))
      add({
        id: `p2-review-${r.sourceId}`,
        phase: 2,
        title: `Check the extraction: ${r.label}`,
        side: "team",
        assignee: owner,
        status: state.reviewedSources.includes(r.sourceId)
          ? "Done"
          : "In progress",
        due: "Oct 26",
        tab: "documents",
      });
  }
  for (const s of allSources(state).filter((x) => x.later))
    add({
      id: `p2-review-${s.id}`,
      phase: 2,
      title: `Check the extraction: ${s.title}`,
      side: "team",
      assignee: owner,
      status: state.reviewedSources.includes(s.id) ? "Done" : "In progress",
      due: "Today",
      tab: "documents",
    });

  // Phase 3
  add({
    id: "p3-check",
    phase: 3,
    title: "Detect contradictions in the documents and our draft",
    side: "team",
    assignee: owner,
    due: "Oct 27",
    tab: "documents",
    status:
      report.ran && !report.stale
        ? "Done"
        : state.addedSources.length
          ? "In progress"
          : "To do",
  });
  for (const c of report.conflicts.filter((x) => x.needs === "internal"))
    add({
      id: `p3-fix-${c.id}`,
      phase: 3,
      title: `Fix conflicting instructions: ${c.topicLabel}`,
      side: "team",
      assignee: owner,
      status: c.resolved ? "Done" : "In progress",
      due: "Oct 27",
      tab: "documents",
    });
  for (const q of state.questions) {
    const sent = [
      "Sent",
      "Response received",
      "Resolved",
      "Defaulted",
    ].includes(q.status);
    add({
      id: `p3-send-${q.id}`,
      phase: 3,
      title: `Approve and send: ${q.title}`,
      side: "team",
      assignee: owner,
      due: "Oct 27",
      tab: "clarifications",
      status: sent
        ? "Done"
        : q.status === "Ready to send"
          ? "In progress"
          : "To do",
    });
    add({
      id: `p3-answer-${q.id}`,
      phase: 3,
      title: `Answer: ${q.title}`,
      side: "customer",
      assignee: q.recipient,
      due: "Within 3 business days",
      tab: "clarifications",
      status:
        q.revisions.length > 0 ||
        q.status === "Resolved" ||
        q.status === "Defaulted"
          ? "Done"
          : sent
            ? "In progress"
            : "To do",
    });
    add({
      id: `p3-approve-${q.id}`,
      phase: 3,
      title: `Approve the answer: ${q.title}`,
      side: "team",
      assignee: owner,
      due: "On reply",
      tab: "clarifications",
      status:
        q.status === "Resolved" || q.status === "Defaulted"
          ? "Done"
          : q.revisions.length > q.reviewedRevision
            ? "In progress"
            : "To do",
    });
  }
  if (allUploaded)
    for (const f of state.facts.filter(
      (x) => !x.critical && (coverageOf(x) === "empty" || x.waived),
    ))
      add({
        id: `p3-gap-${f.id}`,
        phase: 3,
        title: `Close the gap: ${f.label}`,
        side: "team",
        assignee: owner,
        status: f.waived ? "Done" : "To do",
        due: "Nov 2",
        tab: "clarifications",
      });

  // Phase 4
  const status4 = agentStatus(state);
  for (const p of prereqItems)
    add({
      id: `p4-${p.id}`,
      phase: 4,
      title: p.label,
      side: "team",
      assignee: owner,
      status: state.prereqs[p.id] ? "Done" : "To do",
      due: "Nov 12",
      tab: "agent",
    });
  add({
    id: "p4-configure",
    phase: 4,
    title: `Configure the agent from confirmed details (${status4.configured} of ${status4.total})`,
    side: "team",
    assignee: owner,
    status: status4.allConfigured
      ? "Done"
      : status4.configured
        ? "In progress"
        : "To do",
    due: "Nov 13",
    tab: "agent",
  });
  add({
    id: "p4-publish",
    phase: 4,
    title: "Publish the agent version",
    side: "team",
    assignee: owner,
    status: agentPublished(state) ? "Done" : "To do",
    due: "Nov 13",
    tab: "agent",
  });
  const cases = testCases(state);
  const passing = cases.filter((t) => testStatus(state, t) === "Pass").length;
  add({
    id: "p4-tests",
    phase: 4,
    title: `Run the test scenarios (${passing} of ${cases.length} passing)`,
    side: "team",
    assignee: owner,
    status:
      cases.length > 0 && passing === cases.length
        ? "Done"
        : passing
          ? "In progress"
          : "To do",
    due: "Nov 17",
    tab: "tests",
  });

  // Phase 5
  add({
    id: "p5-gate",
    phase: 5,
    title: "Pass the launch gate",
    side: "team",
    assignee: owner,
    status: "To do",
    due: "Nov 19",
    tab: "tests",
  });
  add({
    id: "p5-checkins",
    phase: 5,
    title: "Hold weekly check-ins for the first four weeks",
    side: "team",
    assignee: owner,
    status: "To do",
    due: "From Nov 20",
    tab: "activity",
  });
  return tasks;
}

export type PhaseProgress = {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  done: number;
  total: number;
  status: "Done" | "Current" | "Upcoming";
};

export function phaseProgress(state: PrototypeState): PhaseProgress[] {
  const tasks = planTasks(state);
  let reached = false;
  return phaseNames.map((name, i) => {
    const mine = tasks.filter((t) => t.phase === i + 1);
    const done = mine.filter((t) => t.status === "Done").length;
    const complete = mine.length > 0 && done === mine.length;
    const status = reached ? "Upcoming" : complete ? "Done" : "Current";
    if (!complete) reached = true;
    return {
      n: (i + 1) as PhaseProgress["n"],
      name,
      done,
      total: mine.length,
      status,
    };
  });
}

export const sourceTitle = (id: string) =>
  sourceCatalog.find((s) => s.id === id)?.title ?? id;
