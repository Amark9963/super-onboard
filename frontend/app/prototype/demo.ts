// The guided "Try it" path. Every step's completion is derived from state, so the checklist can
// never disagree with what the viewer actually did.

import {
  consistencyReport,
  documentRequests,
  onboardingSteps,
  reviewApproved,
  reviewReady,
  type PrototypeState,
} from "./state.ts";
import type { Tab } from "./plan.ts";

export type TryTarget =
  | { kind: "view"; view: "new" | "team" | "portal" }
  | { kind: "client"; tab: Tab }
  | { kind: "tray" };

export type TryStep = {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  /** Needs an onboarding to exist before it can be tried. */
  needsClient: boolean;
  target: TryTarget;
  optional?: boolean;
};

export function tryItSteps(state: PrototypeState): TryStep[] {
  const report = consistencyReport(state);
  const steps = state.client ? onboardingSteps(state) : null;
  return [
    {
      id: "create",
      title: "Start an onboarding",
      hint: "Clients → New onboarding. Add the customer team, or use the sample team.",
      done: Boolean(state.client),
      needsClient: false,
      target: { kind: "view", view: "new" },
    },
    {
      id: "request",
      title: "Send the document request",
      hint: "On the Plan, use Next up. Each document is assigned to the contact who owns it.",
      done: state.docsRequested,
      needsClient: true,
      target: { kind: "client", tab: "plan" },
    },
    {
      id: "upload",
      title: "Upload the sample documents and check each extraction",
      hint: "Documents tab: drop the samples, then press “Looks right” on each one.",
      done: Boolean(
        steps &&
        documentRequests.every((d) =>
          state.addedSources.includes(d.sourceId),
        ) &&
        steps[1].status === "Done",
      ),
      needsClient: true,
      target: { kind: "client", tab: "documents" },
    },
    {
      id: "detect",
      title: "Detect contradictions",
      hint: "Same tab. The handbook and the kickoff call disagree about weekend flooding. Add the draft instructions first to see the conflict inside our own draft.",
      done: report.ran,
      needsClient: true,
      target: { kind: "client", tab: "documents" },
    },
    {
      id: "send",
      title: "Approve the questions and send them to the customer",
      hint: "Clarifications tab. Each question is assigned to the contact who decides that topic.",
      done: state.requests.length > 0,
      needsClient: true,
      target: { kind: "client", tab: "clarifications" },
    },
    {
      id: "answer",
      title: "Answer as the customer",
      hint: "Opens the customer portal as Maya Chen. Pick an option and submit.",
      done: state.questions.some((q) => q.revisions.length > 0),
      needsClient: true,
      target: { kind: "view", view: "portal" },
    },
    {
      id: "approve",
      title: "Approve the answers and close the gaps",
      hint: "Back in Clarifications: approve each reply, and waive the open gaps with a reason.",
      done: reviewReady(state),
      needsClient: true,
      target: { kind: "client", tab: "clarifications" },
    },
    {
      id: "review",
      title: "Get a teammate’s review",
      hint: "Requirements tab: ask Riley Kim to review. Then switch to Riley in the sidebar (Viewing as) and approve.",
      done: reviewApproved(state),
      needsClient: true,
      target: { kind: "client", tab: "requirements" },
    },
    {
      id: "finish",
      title: "Finish setup and go-live",
      hint: "Plan tab: setup and go-live tasks unlock once clarification is done. Answer any new question first.",
      done: Boolean(steps && steps.every((s) => s.status === "Done")),
      needsClient: true,
      target: { kind: "client", tab: "plan" },
    },
    {
      id: "note",
      title: "Leave a team note and mention someone",
      hint: "Any question, detail or conflict has internal notes. Type @Riley to mention a teammate. Optional.",
      done: state.notes.length > 0,
      needsClient: true,
      target: { kind: "client", tab: "requirements" },
      optional: true,
    },
    {
      id: "team",
      title: "Invite a teammate",
      hint: "Team page → Invite member. Optional.",
      done: state.team.some((m) => m.status === "Invited"),
      needsClient: false,
      target: { kind: "view", view: "team" },
      optional: true,
    },
  ];
}
