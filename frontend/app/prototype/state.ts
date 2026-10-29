// Pure, deterministic state for the onboarding-process prototype. No network, no backend:
// everything here is simulated, fictional data (Oakwood Property Group). Keep this file free of
// TypeScript-only runtime syntax (enums, namespaces) so Node can run it directly in tests.
//
// The central object is the intake spec: 20 required facts across five areas. Each fact has a
// source, an owner, a lifecycle status and a separate approval state.

export type Area =
  "Goals" | "Team & rules" | "FAQs" | "Scenarios" | "Integrations";
export type Lifecycle =
  | "Not received"
  | "Received"
  | "Extracted"
  | "Needs clarification"
  | "Customer confirmed"
  | "Configured"
  | "Tested";
export type Approval =
  "Not reviewed" | "Specialist reviewed" | "Customer approved";

export type Source = {
  id: string;
  title: string;
  type: string;
  received: string;
  suppliedBy: string;
  parse: "Parsed" | "Needs attention";
  flagged?: boolean;
  anchor: string;
  excerpt: string;
  note?: string;
};

/** A statement a source makes about how something should work. The consistency check compares them. */
export type Claim = {
  id: string;
  sourceId: string;
  anchor: string;
  topic: string;
  topicLabel: string;
  scope: string;
  value: string;
  quote: string;
  factIds: string[];
};

export type Fact = {
  id: string;
  area: Area;
  label: string;
  value: string | null;
  sourceId: string | null;
  anchor: string;
  evidence: string;
  owner: string;
  lifecycle: Lifecycle;
  approval: Approval;
  critical?: boolean;
  note?: string;
  waived?: { reason: string; owner: string };
  /** Bumps when the meaning changes, so earlier test results can be flagged stale. */
  rev: number;
  /** The customer's reviewed wording, kept beside the source-based value. */
  customerAnswer?: { questionId: string; value: string; revision: number };
};

export type AnswerRevision = {
  value: string;
  kind: "answer" | "unknown" | "delegate";
  at: string;
  comment: string;
};
export type QuestionStatus =
  | "AI draft"
  | "Ready to send"
  | "Sent"
  | "Response received"
  | "Resolved"
  | "Defaulted";
export type Question = {
  id: string;
  title: string;
  text: string;
  why: string;
  source: string;
  recipientRole: string;
  status: QuestionStatus;
  factIds: string[];
  options: string[];
  defaultIfNoReply?: string;
  revisions: AnswerRevision[];
  reviewedRevision: number;
  conflictId?: string;
};

export type Conflict = {
  id: string;
  topicLabel: string;
  scope: string;
  claimIds: string[];
  needs: "customer" | "internal";
  factIds: string[];
  questionId?: string;
};
export type Variation = { id: string; topicLabel: string; claimIds: string[] };
export type Resolution = {
  conflictId: string;
  how: "customer answer" | "internal fix" | "default";
  note: string;
  claimSig: string;
  chosenClaimId?: string;
};
export type SentRequest = {
  id: string;
  recipientRole: string;
  recipientName: string;
  questionIds: string[];
};

export type TestKind =
  | "Normal"
  | "Negative"
  | "Boundary"
  | "After-hours"
  | "Transfer"
  | "Emergency"
  | "Unsupported question"
  | "Integration failure"
  | "From issue";
export type TestCase = {
  id: string;
  factId: string;
  kind: TestKind;
  scenario: string;
  expected: string;
  critical: boolean;
};
export type TestResult = "Pass" | "Fail";
export type TestRecord = { result: TestResult; note: string; factRev: number };
export type Issue = {
  id: string;
  text: string;
  factId: string;
  expected: string;
};

export type PrototypeState = {
  facts: Fact[];
  questions: Question[];
  requests: SentRequest[];
  resolutions: Record<string, Resolution>;
  tests: Record<string, TestRecord>;
  extraTests: TestCase[];
  addedSources: string[];
  /** Bumps whenever a new source arrives; a check run before that is stale. */
  sourceRevision: number;
  /** sourceRevision at the last consistency check; null means it has never been run. */
  consistencyRun: number | null;
  manualLog: Record<string, number>;
};

export const areas: Area[] = [
  "Goals",
  "Team & rules",
  "FAQs",
  "Scenarios",
  "Integrations",
];

export const recipients: Record<string, { name: string }> = {
  "Operations lead": { name: "Maya Chen" },
  "Property manager": { name: "Priya Shah" },
};

export const OWNER = "Avery Morgan";

// ---------------------------------------------------------------------------------------------
// Sources and claims
// ---------------------------------------------------------------------------------------------

export const baseSources: Source[] = [
  {
    id: "sop",
    title: "Oakwood operations handbook",
    type: "PDF · 24 pages",
    received: "Oct 22, 2026",
    suppliedBy: "Maya Chen",
    parse: "Parsed",
    anchor: "p. 7 · Pets / p. 12 · Emergency calls",
    excerpt:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor. If unavailable, take a callback number and alert the property manager.",
  },
  {
    id: "transcript",
    title: "Implementation kickoff call",
    type: "Transcript · TXT",
    received: "Oct 24, 2026",
    suppliedBy: "Maya Chen",
    parse: "Parsed",
    anchor: "18:42 · Maya Chen",
    excerpt:
      "On weekends at Maple Grove, the front desk usually handles urgent calls first. I need to check whether that still applies to flooding emergencies.",
  },
  {
    id: "roster",
    title: "Team & escalation contacts",
    type: "Spreadsheet · XLSX",
    received: "Oct 23, 2026",
    suppliedBy: "Jordan Lee",
    parse: "Parsed",
    anchor: "Escalation sheet · B4–F8",
    excerpt:
      "Maintenance supervisor: on-call role. Property manager: fallback role. Weekend schedule: maintained in the external scheduling system; do not copy a static roster.",
  },
  {
    id: "faq",
    title: "Resident FAQ snapshot",
    type: "Website · HTML",
    received: "Oct 25, 2026",
    suppliedBy: "Public oakwood.example",
    parse: "Parsed",
    anchor: "FAQ / office-hours",
    excerpt:
      "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m. Messages received outside these hours are returned the next business day.",
  },
  {
    id: "prompt-draft",
    title: "Draft agent instructions v0.3",
    type: "Internal draft · Markdown",
    received: "Oct 28, 2026",
    suppliedBy: "Avery Morgan",
    parse: "Parsed",
    anchor: "§3 Transfers / §7 Weekend rules",
    excerpt:
      "§3: Always transfer after-hours emergency calls to the on-call supervisor. §7: On weekends do not transfer calls; take a callback number and promise a call back.",
    note: "Written by the implementation team, not the customer.",
  },
  {
    id: "scan",
    title: "Archived move-in checklist",
    type: "PDF · scanned",
    received: "Oct 26, 2026",
    suppliedBy: "Jordan Lee",
    parse: "Needs attention",
    flagged: true,
    anchor: "No readable text",
    excerpt: "No text could be extracted from this scan.",
    note: "Request a text-based copy, or waive the fact with a reason.",
  },
];

export const lateSource: Source = {
  id: "email-maya",
  title: "Email from Maya Chen",
  type: "Email · EML",
  received: "Oct 29, 2026",
  suppliedBy: "Maya Chen",
  parse: "Parsed",
  anchor: "Email body",
  excerpt:
    "Our target is 90% of calls answered during staffed hours. Residents locked out of their unit should go to the on-call maintenance supervisor. Both properties allow two cats.",
  note: "Simulated late-arriving source.",
};

export const claims: Claim[] = [
  {
    id: "c-sop-route",
    sourceId: "sop",
    anchor: "Handbook · p. 12",
    topic: "weekend-flood-route",
    topicLabel: "Weekend flooding route",
    scope: "Maple Grove",
    value: "Transfer to the on-call maintenance supervisor",
    quote:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor.",
    factIds: ["T2", "S1"],
  },
  {
    id: "c-call-route",
    sourceId: "transcript",
    anchor: "Kickoff call · 18:42",
    topic: "weekend-flood-route",
    topicLabel: "Weekend flooding route",
    scope: "Maple Grove",
    value: "Front desk handles urgent calls first",
    quote:
      "On weekends at Maple Grove, the front desk usually handles urgent calls first.",
    factIds: ["T2", "S1"],
  },
  {
    id: "c-pets-mg",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    topic: "pet-limit",
    topicLabel: "Pet limit",
    scope: "Maple Grove",
    value: "2 cats",
    quote: "Maple Grove: up to two cats.",
    factIds: ["F2"],
  },
  {
    id: "c-pets-wc",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    topic: "pet-limit",
    topicLabel: "Pet limit",
    scope: "Willow Court",
    value: "1 cat with written approval",
    quote: "Willow Court: one cat with written approval.",
    factIds: ["F3"],
  },
  {
    id: "c-pets-late",
    sourceId: "email-maya",
    anchor: "Email · last line",
    topic: "pet-limit",
    topicLabel: "Pet limit",
    scope: "Company-wide",
    value: "2 cats",
    quote: "Both properties allow two cats.",
    factIds: ["F2", "F3"],
  },
  {
    id: "c-draft-transfer",
    sourceId: "prompt-draft",
    anchor: "Draft instructions · §3",
    topic: "emergency-transfer",
    topicLabel: "After-hours emergency transfers",
    scope: "Company-wide",
    value: "Always transfer after-hours emergencies",
    quote:
      "Always transfer after-hours emergency calls to the on-call supervisor.",
    factIds: [],
  },
  {
    id: "c-draft-weekend",
    sourceId: "prompt-draft",
    anchor: "Draft instructions · §7",
    topic: "emergency-transfer",
    topicLabel: "After-hours emergency transfers",
    scope: "Company-wide",
    value: "Never transfer on weekends; take a callback number",
    quote:
      "On weekends do not transfer calls; take a callback number and promise a call back.",
    factIds: [],
  },
];

// ---------------------------------------------------------------------------------------------
// Initial state: 13 known, 3 awaiting clarification, 4 empty; 3 customer-confirmed
// ---------------------------------------------------------------------------------------------

const fact = (
  f: Partial<Fact> & Pick<Fact, "id" | "area" | "label">,
): Fact => ({
  value: null,
  sourceId: null,
  anchor: "Not yet received",
  evidence: "",
  owner: OWNER,
  lifecycle: "Extracted",
  approval: "Not reviewed",
  rev: 1,
  ...f,
});

const initialFacts: Fact[] = [
  fact({
    id: "G1",
    area: "Goals",
    label: "Primary objective",
    value:
      "Reduce unanswered resident calls while keeping people in the loop for urgent issues.",
    sourceId: "transcript",
    anchor: "Kickoff call · 04:15",
    evidence:
      "The team wants fewer missed resident calls without replacing its human escalation process.",
    lifecycle: "Customer confirmed",
    approval: "Customer approved",
  }),
  fact({
    id: "G2",
    area: "Goals",
    label: "Success measure",
    lifecycle: "Not received",
    note: "No numeric target has been given.",
  }),
  fact({
    id: "G3",
    area: "Goals",
    label: "Call types in and out of scope",
    value:
      "In: leasing FAQs, maintenance requests, office hours. Out: payment disputes, legal questions.",
    sourceId: "transcript",
    anchor: "Kickoff call · 11:20",
    evidence:
      "We want it to handle the routine questions, not billing disputes.",
  }),
  fact({
    id: "G4",
    area: "Goals",
    label: "Properties and channels",
    value: "Maple Grove and Willow Court; inbound voice only.",
    sourceId: "transcript",
    anchor: "Kickoff call · 02:10",
    evidence: "Two properties to start, phone calls only.",
    lifecycle: "Customer confirmed",
    approval: "Customer approved",
  }),
  fact({
    id: "T1",
    area: "Team & rules",
    label: "Roles and responsibilities",
    value:
      "Maintenance supervisor (on-call), property manager (fallback), leasing desk (office hours).",
    sourceId: "roster",
    anchor: "Escalation sheet · B4–F8",
    evidence:
      "Maintenance supervisor: on-call role. Property manager: fallback role.",
    lifecycle: "Customer confirmed",
    approval: "Customer approved",
  }),
  fact({
    id: "T2",
    area: "Team & rules",
    label: "Weekend emergency routing",
    value:
      "Candidate only: on-call supervisor per the handbook; the kickoff call says front desk first.",
    sourceId: "sop",
    anchor: "Handbook · p. 12 + kickoff call 18:42",
    evidence:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor.",
    lifecycle: "Needs clarification",
    critical: true,
    note: "Two sources disagree.",
  }),
  fact({
    id: "T3",
    area: "Team & rules",
    label: "Escalation order and fallback",
    value:
      "On-call maintenance supervisor, then property manager; otherwise take a callback number.",
    sourceId: "sop",
    anchor: "Handbook · p. 12",
    evidence:
      "If unavailable, take a callback number and alert the property manager.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "T4",
    area: "Team & rules",
    label: "Weekend coverage source",
    value:
      "Maintained in the external scheduling system; do not copy a static roster.",
    sourceId: "roster",
    anchor: "Escalation sheet · row 8",
    evidence: "Weekend schedule: maintained in the external scheduling system.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "F1",
    area: "FAQs",
    label: "Office hours",
    value:
      "Monday–Friday, 9 a.m.–5 p.m.; after-hours messages return next business day.",
    sourceId: "faq",
    anchor: "Resident FAQ · office-hours",
    evidence: "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "F2",
    area: "FAQs",
    label: "Pet policy, Maple Grove",
    value: "Up to two cats.",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    evidence: "Maple Grove: up to two cats.",
  }),
  fact({
    id: "F3",
    area: "FAQs",
    label: "Pet policy, Willow Court",
    value: "One cat with written approval.",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    evidence: "Willow Court: one cat with written approval.",
  }),
  fact({
    id: "F4",
    area: "FAQs",
    label: "Move-in checklist",
    sourceId: "scan",
    anchor: "Scanned PDF · no readable text",
    lifecycle: "Not received",
    note: "The scan has no extractable text. Request a text copy or waive with a reason.",
  }),
  fact({
    id: "S1",
    area: "Scenarios",
    label: "Flooding emergency",
    value:
      "Collect property and unit, callback number and safety concern; escalation route depends on weekend routing.",
    sourceId: "sop",
    anchor: "Handbook · p. 12",
    evidence:
      "If unavailable, take a callback number and alert the property manager.",
    lifecycle: "Needs clarification",
    critical: true,
  }),
  fact({
    id: "S2",
    area: "Scenarios",
    label: "Maintenance request",
    value:
      "Collect unit, issue and access permission; create a work-order request for the team.",
    sourceId: "transcript",
    anchor: "Kickoff call · 22:05",
    evidence:
      "For regular repairs, we just need the unit, the problem and whether we can enter.",
  }),
  fact({
    id: "S3",
    area: "Scenarios",
    label: "Locked out of unit",
    lifecycle: "Not received",
    note: "Not yet discussed.",
  }),
  fact({
    id: "S4",
    area: "Scenarios",
    label: "Unsupported question",
    value:
      "Say the team will follow up, take a callback number, and return the call next business day.",
    anchor: "Implementation team standard",
    evidence: "Our standard handling for anything outside the knowledge base.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "I1",
    area: "Integrations",
    label: "Property-system name",
    value:
      "Resident and work-order system (PMS); product name to be confirmed.",
    sourceId: "transcript",
    anchor: "Kickoff call · 32:10",
    evidence:
      "We use our property management system for resident and work-order context.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "I2",
    area: "Integrations",
    label: "Authorization owner",
    lifecycle: "Not received",
    critical: true,
    note: "Nobody has said who can authorize access. No credentials are requested or stored here.",
  }),
  fact({
    id: "I3",
    area: "Integrations",
    label: "Allowed operations",
    value:
      "Proposed by us: read-only lookup of resident and work-order status.",
    anchor: "Implementation team proposal",
    evidence: "Our proposal; the customer has not agreed.",
    lifecycle: "Needs clarification",
    critical: true,
  }),
  fact({
    id: "I4",
    area: "Integrations",
    label: "Failure fallback",
    value: "Proposed by us: take a message; never guess live data.",
    anchor: "Implementation team proposal",
    evidence: "Our proposal; the customer has not reviewed it.",
  }),
];

export const initialState: PrototypeState = {
  facts: initialFacts,
  requests: [],
  resolutions: {},
  tests: {},
  extraTests: [],
  addedSources: [],
  sourceRevision: 1,
  consistencyRun: null,
  manualLog: {},
  questions: [
    {
      id: "q-emergency",
      title: "Weekend flooding route",
      text: "For a flooding emergency at Maple Grove on a weekend, who should the agent route the caller to first?",
      why: "The handbook and the kickoff call give different weekend directions for the same property.",
      source: "Handbook p. 12 + kickoff call 18:42",
      recipientRole: "Operations lead",
      status: "AI draft",
      factIds: ["T2", "S1"],
      options: [
        "Route to the on-call maintenance supervisor first",
        "Route to the front desk first, then the supervisor",
        "Something else (explain below)",
      ],
      revisions: [],
      reviewedRevision: 0,
      conflictId: "weekend-flood-route",
    },
    {
      id: "q-integration",
      title: "Property-system access",
      text: "Who can authorize read-only lookups in the property system, and what should the agent do when a lookup is unavailable?",
      why: "The authorization owner is unknown and the allowed operations are only our proposal.",
      source: "Kickoff call 32:10",
      recipientRole: "Operations lead",
      status: "AI draft",
      factIds: ["I2", "I3"],
      options: [
        "Maya Chen authorizes read-only lookups",
        "Someone else authorizes (name them below)",
        "No lookups for now",
      ],
      revisions: [],
      reviewedRevision: 0,
    },
    {
      id: "q-pets",
      title: "Pet limits by property",
      text: "What is the correct pet limit at each property, including any exceptions?",
      why: "The handbook sets limits per property; a later email says both allow two cats.",
      source: "Handbook p. 7",
      recipientRole: "Property manager",
      status: "AI draft",
      factIds: ["F2", "F3"],
      options: [
        "Per property: two cats at Maple Grove, one cat at Willow Court",
        "Two cats at both properties",
        "Something else (explain below)",
      ],
      defaultIfNoReply:
        "Keep the limits per property and flag them as unconfirmed",
      revisions: [],
      reviewedRevision: 0,
      conflictId: "pet-limit",
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

export const factById = (state: PrototypeState, id: string) =>
  state.facts.find((f) => f.id === id);
export const shownValue = (f: Fact) => f.customerAnswer?.value ?? f.value;
export const isConfirmed = (f: Fact) => f.approval === "Customer approved";
export const allSources = (state: PrototypeState): Source[] => [
  ...baseSources,
  ...(state.addedSources.includes(lateSource.id) ? [lateSource] : []),
];
const bump = (state: PrototypeState, key: string): PrototypeState => ({
  ...state,
  manualLog: { ...state.manualLog, [key]: (state.manualLog[key] ?? 0) + 1 },
});

export type Coverage = "known" | "clarifying" | "empty" | "waived";
export function coverageOf(f: Fact): Coverage {
  if (f.waived) return "waived";
  if (f.lifecycle === "Not received") return "empty";
  if (f.lifecycle === "Needs clarification") return "clarifying";
  return "known";
}
export function coverage(state: PrototypeState) {
  const c = {
    total: state.facts.length,
    known: 0,
    clarifying: 0,
    empty: 0,
    waived: 0,
    confirmed: 0,
  };
  for (const f of state.facts) {
    c[coverageOf(f)]++;
    if (isConfirmed(f)) c.confirmed++;
  }
  return c;
}
/** Lifecycle as shown: a configured fact whose every test passes is "Tested". */
export function shownLifecycle(state: PrototypeState, f: Fact): Lifecycle {
  if (f.lifecycle !== "Configured") return f.lifecycle;
  const mine = testCases(state).filter((t) => t.factId === f.id);
  return mine.length > 0 && mine.every((t) => testStatus(state, t) === "Pass")
    ? "Tested"
    : "Configured";
}
/** Goals describe intent, not agent behaviour: they are reviewed but never configured or tested. */
export const configurable = (f: Fact) => usable(f) && f.area !== "Goals";
/** A fact the agent can be built and tested from. */
export const usable = (f: Fact) =>
  !f.waived &&
  f.value !== null &&
  f.lifecycle !== "Not received" &&
  f.lifecycle !== "Needs clarification" &&
  f.approval !== "Not reviewed";

// ---------------------------------------------------------------------------------------------
// Sources arriving late
// ---------------------------------------------------------------------------------------------

export function addSource(state: PrototypeState): PrototypeState {
  if (state.addedSources.includes(lateSource.id)) return state;
  const fill = (
    f: Fact,
    value: string,
    anchor: string,
    evidence: string,
  ): Fact => ({
    ...f,
    value,
    sourceId: lateSource.id,
    anchor,
    evidence,
    lifecycle: "Extracted",
    approval: "Not reviewed",
    note: undefined,
    rev: f.rev + 1,
  });
  return {
    ...state,
    addedSources: [...state.addedSources, lateSource.id],
    sourceRevision: state.sourceRevision + 1,
    facts: state.facts.map((f) =>
      f.id === "G2"
        ? fill(
            f,
            "Answer 90% of calls during staffed hours.",
            "Email · first line",
            "Our target is 90% of calls answered during staffed hours.",
          )
        : f.id === "S3"
          ? fill(
              f,
              "Transfer to the on-call maintenance supervisor.",
              "Email · second line",
              "Residents locked out of their unit should go to the on-call maintenance supervisor.",
            )
          : f,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Consistency check
// ---------------------------------------------------------------------------------------------

const overlaps = (a: string, b: string) =>
  a === b || a === "Company-wide" || b === "Company-wide";

export function detectConflicts(state: PrototypeState): {
  conflicts: Conflict[];
  variations: Variation[];
} {
  const present = new Set(allSources(state).map((s) => s.id));
  const active = claims.filter((c) => present.has(c.sourceId));
  const conflicts: Conflict[] = [];
  const variations: Variation[] = [];
  for (const topic of [...new Set(active.map((c) => c.topic))]) {
    const group = active.filter((c) => c.topic === topic);
    const clashing = new Set<string>();
    for (const a of group)
      for (const b of group)
        if (a.id < b.id && a.value !== b.value && overlaps(a.scope, b.scope)) {
          clashing.add(a.id);
          clashing.add(b.id);
        }
    const label = group[0].topicLabel;
    if (clashing.size) {
      const involved = group.filter((c) => clashing.has(c.id));
      conflicts.push({
        id: topic,
        topicLabel: label,
        scope:
          involved.find((c) => c.scope !== "Company-wide")?.scope ??
          "Company-wide",
        claimIds: involved.map((c) => c.id).sort(),
        needs: involved.every((c) => c.sourceId === "prompt-draft")
          ? "internal"
          : "customer",
        factIds: [...new Set(involved.flatMap((c) => c.factIds))],
        questionId: state.questions.find((q) => q.conflictId === topic)?.id,
      });
    } else if (new Set(group.map((c) => c.value)).size > 1) {
      variations.push({
        id: topic,
        topicLabel: label,
        claimIds: group.map((c) => c.id),
      });
    }
  }
  return { conflicts, variations };
}

export function consistencyReport(state: PrototypeState) {
  const { conflicts, variations } = detectConflicts(state);
  const rows = conflicts.map((c) => {
    const r = state.resolutions[c.id];
    const resolution = r && r.claimSig === c.claimIds.join("|") ? r : undefined;
    return { ...c, resolution, resolved: Boolean(resolution) };
  });
  const present = new Set(allSources(state).map((s) => s.id));
  const active = claims.filter((c) => present.has(c.sourceId));
  return {
    ran: state.consistencyRun !== null,
    stale:
      state.consistencyRun !== null &&
      state.consistencyRun !== state.sourceRevision,
    claimsChecked: active.length,
    sourcesChecked: new Set(active.map((c) => c.sourceId)).size,
    conflicts: rows,
    open: rows.filter((c) => !c.resolved),
    variations,
  };
}

export function runConsistencyCheck(state: PrototypeState): PrototypeState {
  return { ...state, consistencyRun: state.sourceRevision };
}

/** Fix a contradiction inside our own draft by choosing the intended instruction. */
export function resolveInternally(
  state: PrototypeState,
  conflictId: string,
  chosenClaimId: string,
  note: string,
): PrototypeState {
  const conflict = detectConflicts(state).conflicts.find(
    (c) => c.id === conflictId,
  );
  if (
    !conflict ||
    conflict.needs !== "internal" ||
    !conflict.claimIds.includes(chosenClaimId) ||
    !note.trim() ||
    consistencyReport(state).conflicts.find((c) => c.id === conflictId)
      ?.resolved
  )
    return state;
  return {
    ...state,
    resolutions: {
      ...state.resolutions,
      [conflictId]: {
        conflictId,
        how: "internal fix",
        note: note.trim(),
        claimSig: conflict.claimIds.join("|"),
        chosenClaimId,
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Questions, requests and answers
// ---------------------------------------------------------------------------------------------

export function updateQuestion(
  state: PrototypeState,
  id: string,
  patch: Partial<Question>,
): PrototypeState {
  return {
    ...state,
    questions: state.questions.map((q) =>
      q.id === id ? { ...q, ...patch } : q,
    ),
  };
}

export const questionCritical = (state: PrototypeState, q: Question) =>
  q.factIds.some((id) => factById(state, id)?.critical);

export function sendRequest(
  state: PrototypeState,
  role: string,
  questionIds: string[],
): PrototypeState {
  const ids = questionIds.filter((id) => {
    const q = state.questions.find((item) => item.id === id);
    return q && q.recipientRole === role && q.status === "Ready to send";
  });
  if (!ids.length) return state;
  return {
    ...state,
    requests: [
      ...state.requests,
      {
        id: `req-${state.requests.length + 1}`,
        recipientRole: role,
        recipientName: recipients[role]?.name ?? role,
        questionIds: ids,
      },
    ],
    questions: state.questions.map((q) =>
      ids.includes(q.id) ? { ...q, status: "Sent" as const } : q,
    ),
  };
}

export function sentQuestionIds(state: PrototypeState, role?: string) {
  return state.requests
    .filter((r) => !role || r.recipientRole === role)
    .flatMap((r) => r.questionIds);
}

/** A resolved question whose conflict has come back (new evidence) can be asked again. */
export function reopenQuestion(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const q = state.questions.find((x) => x.id === id);
  if (!q || (q.status !== "Resolved" && q.status !== "Defaulted")) return state;
  return {
    ...state,
    requests: state.requests.map((r) => ({
      ...r,
      questionIds: r.questionIds.filter((x) => x !== id),
    })),
    questions: state.questions.map((x) =>
      x.id === id ? { ...x, status: "Ready to send" as const } : x,
    ),
  };
}

export function submitAnswer(
  state: PrototypeState,
  id: string,
  value: string,
  kind: AnswerRevision["kind"],
  comment = "",
): PrototypeState {
  const question = state.questions.find((q) => q.id === id);
  if (
    !question ||
    !sentQuestionIds(state).includes(id) ||
    !["Sent", "Response received", "Resolved", "Defaulted"].includes(
      question.status,
    )
  )
    return state;
  if (kind === "answer" && !value.trim()) return state;
  const revision: AnswerRevision = {
    value: value.trim(),
    kind,
    comment: comment.trim(),
    at: `Revision ${question.revisions.length + 1} · simulated session`,
  };
  const resolutions = { ...state.resolutions };
  if (question.conflictId) delete resolutions[question.conflictId];
  return {
    ...state,
    resolutions,
    questions: state.questions.map((q) =>
      q.id === id
        ? {
            ...q,
            status: "Response received" as const,
            revisions: [...q.revisions, revision],
          }
        : q,
    ),
    facts: state.facts.map((f) =>
      question.factIds.includes(f.id)
        ? {
            ...f,
            lifecycle: "Needs clarification" as const,
            approval: "Not reviewed" as const,
            note: undefined,
            rev: f.rev + 1,
          }
        : f,
    ),
  };
}

export function reviewAnswer(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const question = state.questions.find((q) => q.id === id);
  const latest = question?.revisions.at(-1);
  if (
    !question ||
    !latest ||
    question.reviewedRevision === question.revisions.length ||
    latest.kind !== "answer"
  )
    return state;
  const revision = question.revisions.length;
  const resolutions = { ...state.resolutions };
  const conflict =
    question.conflictId &&
    detectConflicts(state).conflicts.find((c) => c.id === question.conflictId);
  if (conflict)
    resolutions[conflict.id] = {
      conflictId: conflict.id,
      how: "customer answer",
      note: latest.value,
      claimSig: conflict.claimIds.join("|"),
    };
  return {
    ...state,
    resolutions,
    questions: state.questions.map((q) =>
      q.id === id
        ? { ...q, status: "Resolved" as const, reviewedRevision: revision }
        : q,
    ),
    facts: state.facts.map((f) =>
      question.factIds.includes(f.id)
        ? {
            ...f,
            value: f.value ?? latest.value,
            lifecycle: "Customer confirmed" as const,
            approval: "Customer approved" as const,
            customerAnswer: { questionId: id, value: latest.value, revision },
            note: undefined,
            rev: f.rev + 1,
          }
        : f,
    ),
  };
}

/** Simulates the deadline passing with no reply. Never allowed for critical questions. */
export function applyDefault(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const q = state.questions.find((x) => x.id === id);
  if (
    !q ||
    !q.defaultIfNoReply ||
    q.status !== "Sent" ||
    q.revisions.length > 0 ||
    questionCritical(state, q)
  )
    return state;
  const resolutions = { ...state.resolutions };
  const conflict =
    q.conflictId &&
    detectConflicts(state).conflicts.find((c) => c.id === q.conflictId);
  if (conflict)
    resolutions[conflict.id] = {
      conflictId: conflict.id,
      how: "default",
      note: q.defaultIfNoReply,
      claimSig: conflict.claimIds.join("|"),
    };
  return {
    ...state,
    resolutions,
    questions: state.questions.map((x) =>
      x.id === id ? { ...x, status: "Defaulted" as const } : x,
    ),
    facts: state.facts.map((f) =>
      q.factIds.includes(f.id)
        ? {
            ...f,
            approval:
              f.approval === "Not reviewed"
                ? ("Specialist reviewed" as const)
                : f.approval,
            note: `Proceeding on default, not confirmed by the customer: ${q.defaultIfNoReply}.`,
            rev: f.rev + 1,
          }
        : f,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Fact actions
// ---------------------------------------------------------------------------------------------

export function reviewFact(state: PrototypeState, id: string): PrototypeState {
  const f = factById(state, id);
  if (
    !f ||
    f.value === null ||
    f.approval !== "Not reviewed" ||
    f.lifecycle === "Needs clarification"
  )
    return state;
  return bump(
    {
      ...state,
      facts: state.facts.map((x) =>
        x.id === id ? { ...x, approval: "Specialist reviewed" as const } : x,
      ),
    },
    "review-fact",
  );
}

export function markConfigured(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const f = factById(state, id);
  if (
    !f ||
    !configurable(f) ||
    f.lifecycle === "Configured" ||
    (f.critical && !isConfirmed(f))
  )
    return state;
  return bump(
    {
      ...state,
      facts: state.facts.map((x) =>
        x.id === id ? { ...x, lifecycle: "Configured" as const } : x,
      ),
    },
    "configure",
  );
}

export function waiveFact(
  state: PrototypeState,
  id: string,
  reason: string,
): PrototypeState {
  const f = factById(state, id);
  if (!f || coverageOf(f) !== "empty" || f.critical || !reason.trim())
    return state;
  return {
    ...state,
    facts: state.facts.map((x) =>
      x.id === id
        ? { ...x, waived: { reason: reason.trim(), owner: OWNER } }
        : x,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Readiness, tests, launch checklist
// ---------------------------------------------------------------------------------------------

export function readiness(state: PrototypeState) {
  const report = consistencyReport(state);
  const criticalOpen = state.facts.filter((f) => f.critical && !isConfirmed(f));
  const blockers = [
    ...(!report.ran
      ? ["The consistency check has not been run."]
      : report.stale
        ? [
            "A new source arrived after the last consistency check; run it again.",
          ]
        : []),
    ...report.open.map(
      (c) =>
        `Open conflict: ${c.topicLabel} (${c.claimIds.length} statements disagree).`,
    ),
    ...criticalOpen.map((f) => `${f.label} needs a reviewed customer answer.`),
  ];
  const risks = [
    ...state.facts
      .filter((f) => f.waived)
      .map((f) => `${f.label} waived: ${f.waived!.reason}`),
    ...state.questions
      .filter((q) => q.status === "Defaulted")
      .map((q) => `${q.title}: proceeding on default, not customer confirmed.`),
  ];
  return {
    ready: blockers.length === 0,
    critical: criticalOpen.length,
    openConflicts: report.open.length,
    blockers,
    risks,
  };
}

/** Manual test cases for every usable fact. Nothing here is executed by the app. */
export function testCases(state: PrototypeState): TestCase[] {
  const cases: TestCase[] = [];
  for (const f of state.facts.filter(usable)) {
    const make = (kind: TestKind, scenario: string, expected: string) =>
      cases.push({
        id: `T-${f.id}-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        factId: f.id,
        kind,
        scenario,
        expected,
        critical: Boolean(f.critical),
      });
    // Goals describe intent, not agent behaviour, so they are not tested directly.
    if (f.area === "Goals") continue;
    make("Normal", `A caller asks about “${f.label}”.`, shownValue(f) ?? "");
    make(
      "Negative",
      `A caller asks for something “${f.label}” does not allow.`,
      "Declines or escalates; does not invent a permission.",
    );
    if (f.critical)
      make(
        "Boundary",
        `A caller's situation sits at the edge of “${f.label}”.`,
        "Applies the stated rule; escalates when unsure.",
      );
    if (f.area === "Team & rules") {
      make(
        "After-hours",
        "The call arrives on a weekend or after hours.",
        "Follows the reviewed after-hours route.",
      );
      make(
        "Transfer",
        "The transfer target is unavailable.",
        "Takes a callback number and alerts the fallback role.",
      );
    }
    if (f.critical)
      make(
        "Emergency",
        "A resident reports an active emergency such as flooding.",
        "Collects location, callback number and safety context, then follows the confirmed route.",
      );
    if (f.area === "FAQs")
      make(
        "Unsupported question",
        "The caller asks something the knowledge base does not cover.",
        "Says the team will follow up; does not guess.",
      );
    if (f.area === "Integrations")
      make(
        "Integration failure",
        "The property-system lookup is unavailable.",
        "Does not guess live data; takes a message.",
      );
  }
  return [...cases, ...state.extraTests];
}

export type TestStatus = "Not run" | "Pass" | "Fail" | "Needs retest";

export function testStatus(state: PrototypeState, tc: TestCase): TestStatus {
  const record = state.tests[tc.id];
  if (!record) return "Not run";
  const f = factById(state, tc.factId);
  if (!f || record.factRev !== f.rev) return "Needs retest";
  return record.result;
}

export function recordTest(
  state: PrototypeState,
  id: string,
  result: TestResult,
  note = "",
): PrototypeState {
  const tc = testCases(state).find((t) => t.id === id);
  const f = tc && factById(state, tc.factId);
  if (!tc || !f) return state;
  return bump(
    {
      ...state,
      tests: {
        ...state.tests,
        [id]: { result, note: note.trim(), factRev: f.rev },
      },
    },
    "record-test",
  );
}

export function launchChecklist(state: PrototypeState) {
  const status = readiness(state);
  const statuses = testCases(state).map((t) => ({
    t,
    s: testStatus(state, t),
  }));
  const critical = statuses.filter((x) => x.t.critical);
  const unreviewed = state.facts.filter(
    (f) =>
      coverageOf(f) !== "empty" &&
      coverageOf(f) !== "waived" &&
      f.approval === "Not reviewed",
  );
  const emptyOpen = state.facts.filter((f) => coverageOf(f) === "empty");
  const openQuestions = state.questions.filter(
    (q) => q.status !== "Resolved" && q.status !== "Defaulted",
  );
  const item = (id: string, label: string, pass: boolean, detail: string) => ({
    id,
    label,
    pass,
    detail,
  });
  const count = (s: TestStatus) => statuses.filter((x) => x.s === s).length;
  return [
    item(
      "preparation",
      "Preparation blockers cleared",
      status.ready,
      status.ready
        ? "No open conflicts or critical blockers."
        : `${status.blockers.length} open.`,
    ),
    item(
      "coverage",
      "Every required fact has a value or a waiver",
      emptyOpen.length === 0,
      emptyOpen.length ? `${emptyOpen.length} empty.` : "All covered.",
    ),
    item(
      "reviewed",
      "Every fact reviewed",
      unreviewed.length === 0,
      unreviewed.length
        ? `${unreviewed.length} awaiting review.`
        : "All reviewed.",
    ),
    item(
      "questions",
      "Customer questions closed",
      openQuestions.length === 0,
      openQuestions.length ? `${openQuestions.length} open.` : "All closed.",
    ),
    item(
      "critical-tests",
      "Critical scenarios tested and passing",
      critical.length > 0 && critical.every((x) => x.s === "Pass"),
      critical.length
        ? `${critical.filter((x) => x.s === "Pass").length} of ${critical.length} passing.`
        : "No critical scenarios are testable yet.",
    ),
    item(
      "no-retest",
      "No failing or stale results",
      statuses.length > 0 && count("Fail") === 0 && count("Needs retest") === 0,
      `${count("Fail")} failing · ${count("Needs retest")} need retest.`,
    ),
    item(
      "all-tests",
      "Every test case has a passing result",
      statuses.length > 0 && count("Pass") === statuses.length,
      `${count("Pass")} of ${statuses.length} passed.`,
    ),
  ];
}

// ---------------------------------------------------------------------------------------------
// Steps with checklists, derived from the data
// ---------------------------------------------------------------------------------------------

export type Piece = { label: string; done: boolean };
export type StepStatus = "Done" | "Current" | "Upcoming";
export type Step = {
  n: number;
  name: string;
  status: StepStatus;
  pieces: Piece[];
  detail: string;
};

const SENT: QuestionStatus[] = [
  "Sent",
  "Response received",
  "Resolved",
  "Defaulted",
];

export function onboardingSteps(state: PrototypeState): Step[] {
  const report = consistencyReport(state);
  const prep = readiness(state);
  const cases = testCases(state);
  const statuses = cases.map((t) => testStatus(state, t));
  const f = (id: string) => factById(state, id)!;
  const gapHandled = (x: Fact) =>
    coverageOf(x) !== "empty" ||
    state.questions.some(
      (q) => q.factIds.includes(x.id) && SENT.includes(q.status),
    );
  const usableFacts = state.facts.filter(configurable);
  const defs: { name: string; pieces: Piece[] }[] = [
    {
      name: "Kickoff and goals",
      pieces: [
        {
          label: "Primary objective captured",
          done: coverageOf(f("G1")) === "known",
        },
        {
          label: "Properties and channels agreed",
          done: isConfirmed(f("G4")),
        },
        {
          label: "Information requested from the customer",
          done: allSources(state).length > 0,
        },
      ],
    },
    {
      name: "Collect information",
      pieces: [
        {
          label: "Every area has a source-backed fact",
          done: areas.every((a) =>
            state.facts.some(
              (x) => x.area === a && x.sourceId && x.value !== null,
            ),
          ),
        },
        {
          label: "Every source parsed or flagged",
          done: allSources(state).every(
            (s) => s.parse === "Parsed" || s.flagged,
          ),
        },
        {
          label: "Every fact has an owner",
          done: state.facts.every((x) => x.owner),
        },
      ],
    },
    {
      name: "Clarify and confirm",
      pieces: [
        {
          label: "Every gap asked about or waived",
          done: state.facts.every(gapHandled),
        },
        {
          label: "Consistency check is current",
          done: report.ran && !report.stale,
        },
        {
          label: "No open conflicts",
          done: report.ran && !report.stale && report.open.length === 0,
        },
        {
          label: "Critical facts customer-confirmed",
          done: prep.critical === 0,
        },
      ],
    },
    {
      name: "Configure and test",
      pieces: [
        {
          label: "Every usable fact configured",
          done:
            usableFacts.length > 0 &&
            usableFacts.every((x) => x.lifecycle === "Configured"),
        },
        {
          label: "Critical scenarios tested and passing",
          done:
            cases.some((c) => c.critical) &&
            cases
              .filter((c) => c.critical)
              .every((c) => testStatus(state, c) === "Pass"),
        },
        {
          label: "No failing or stale results",
          done:
            cases.length > 0 &&
            !statuses.some((s) => s === "Fail" || s === "Needs retest"),
        },
        {
          label: "Every test case has a passing result",
          done: cases.length > 0 && statuses.every((s) => s === "Pass"),
        },
      ],
    },
    {
      name: "Go live and tune",
      pieces: [
        {
          label: "Launch checklist passed",
          done: launchChecklist(state).every((c) => c.pass),
        },
      ],
    },
  ];
  let reachedCurrent = false;
  return defs.map((d, i) => {
    const done = d.pieces.every((p) => p.done);
    const status: StepStatus = reachedCurrent
      ? "Upcoming"
      : done
        ? "Done"
        : "Current";
    if (!done) reachedCurrent = true;
    const complete = d.pieces.filter((p) => p.done).length;
    return {
      n: i + 1,
      name: d.name,
      pieces: d.pieces,
      status,
      detail:
        status === "Upcoming"
          ? `Starts when step ${i} is complete.`
          : status === "Done"
            ? "All pieces complete."
            : `${complete} of ${d.pieces.length} pieces done.`,
    };
  });
}

export function currentStep(state: PrototypeState) {
  const steps = onboardingSteps(state);
  return steps.find((s) => s.status === "Current") ?? steps[steps.length - 1];
}

export function needsFromCustomer(
  state: PrototypeState,
  role?: string,
): string[] {
  return state.questions
    .filter(
      (q) =>
        (!role || q.recipientRole === role) &&
        sentQuestionIds(state).includes(q.id) &&
        (q.status === "Sent" || q.status === "Response received") &&
        q.revisions.length === q.reviewedRevision,
    )
    .map((q) => `Answer: ${q.title}`);
}

// ---------------------------------------------------------------------------------------------
// Next actions
// ---------------------------------------------------------------------------------------------

export type NextAction = {
  id: string;
  tone: "red" | "orange" | "blue" | "green";
  icon: string;
  title: string;
  subtitle: string;
  owner: string;
  due: string;
  button: string;
  target: {
    view: "requirements" | "checks" | "qa" | "process";
    factId?: string;
  };
};

export function nextActions(state: PrototypeState): NextAction[] {
  const actions: NextAction[] = [];
  const report = consistencyReport(state);
  const a = (x: Omit<NextAction, "owner">) =>
    actions.push({ ...x, owner: OWNER });
  if (!report.ran || report.stale)
    a({
      id: "run-check",
      tone: "orange",
      icon: "◈",
      title: report.stale
        ? "Run the consistency check again"
        : "Run the consistency check",
      subtitle: report.stale
        ? "A new source arrived after the last check"
        : "Sources and draft prompts have not been compared",
      due: "Before asking the customer",
      button: "Open checks",
      target: { view: "checks" },
    });
  for (const c of report.open)
    a({
      id: `conflict-${c.id}`,
      tone: "red",
      icon: "!",
      title:
        c.needs === "customer"
          ? `Confirm: ${c.topicLabel}`
          : `Fix conflicting instructions: ${c.topicLabel}`,
      subtitle:
        c.needs === "customer"
          ? `Sources disagree · ${c.scope}`
          : "Our own draft contradicts itself",
      due: "Due today",
      button: "Resolve",
      target: { view: "checks" },
    });
  for (const q of state.questions.filter(
    (x) => x.revisions.length > x.reviewedRevision,
  ))
    a({
      id: `review-${q.id}`,
      tone: "orange",
      icon: "↺",
      title: `Review customer answer: ${q.title}`,
      subtitle: "A reply is evidence; specialist approval is still required",
      due: "New reply",
      button: "Review",
      target: { view: "checks" },
    });
  const drafts = state.questions.filter((q) => q.status === "AI draft");
  if (drafts.length)
    a({
      id: "approve-wording",
      tone: "blue",
      icon: "◎",
      title: `Approve wording for ${drafts.length} drafted question${drafts.length === 1 ? "" : "s"}`,
      subtitle: "AI-drafted; staff must approve before sending",
      due: "Before sending",
      button: "Open batch",
      target: { view: "checks" },
    });
  for (const role of Object.keys(recipients)) {
    const ready = state.questions.filter(
      (q) => q.recipientRole === role && q.status === "Ready to send",
    );
    if (ready.length)
      a({
        id: `send-${role}`,
        tone: "blue",
        icon: "↗",
        title: `Send ${ready.length} approved question${ready.length === 1 ? "" : "s"} to ${recipients[role].name}`,
        subtitle: role,
        due: "Ready",
        button: "Send",
        target: { view: "checks" },
      });
  }
  const gaps = state.facts.filter(
    (f) =>
      coverageOf(f) === "empty" &&
      !state.questions.some(
        (q) => q.factIds.includes(f.id) && SENT.includes(q.status),
      ),
  );
  for (const g of gaps)
    a({
      id: `gap-${g.id}`,
      tone: "green",
      icon: "▤",
      title: `Fill the gap: ${g.label}`,
      subtitle: g.note ?? "Required fact has no value",
      due: "Nov 2",
      button: "Open fact",
      target: { view: "requirements", factId: g.id },
    });
  const unreviewed = state.facts.filter(
    (f) =>
      f.value !== null &&
      f.approval === "Not reviewed" &&
      f.lifecycle !== "Needs clarification" &&
      !f.waived,
  );
  if (unreviewed.length)
    a({
      id: "review-facts",
      tone: "blue",
      icon: "◇",
      title: `Review ${unreviewed.length} extracted fact${unreviewed.length === 1 ? "" : "s"}`,
      subtitle: "Source-backed drafts, not yet reviewed",
      due: "Oct 31",
      button: "Review",
      target: { view: "requirements", factId: unreviewed[0].id },
    });
  if (readiness(state).ready) {
    const waiting = testCases(state).filter((t) =>
      ["Not run", "Needs retest", "Fail"].includes(testStatus(state, t)),
    );
    if (waiting.length)
      a({
        id: "tests",
        tone: "orange",
        icon: "✓",
        title: `Record ${waiting.length} test result${waiting.length === 1 ? "" : "s"}`,
        subtitle:
          "Try each scenario against the configured agent, then record the outcome",
        due: "Before launch",
        button: "Open QA",
        target: { view: "qa" },
      });
  }
  return actions;
}

// ---------------------------------------------------------------------------------------------
// Check-in text, process log, issues
// ---------------------------------------------------------------------------------------------

export function weeklyCheckIn(state: PrototypeState): string {
  const step = currentStep(state);
  const report = consistencyReport(state);
  const cov = coverage(state);
  const needed = needsFromCustomer(state);
  const working = nextActions(state)
    .slice(0, 3)
    .map((a) => a.title);
  const status = readiness(state);
  const risks = [
    ...status.blockers,
    ...status.risks,
    ...testCases(state)
      .filter((t) => testStatus(state, t) === "Fail")
      .map((t) => `Failing test ${t.id}`),
  ];
  return [
    "# Weekly check-in · Oakwood Property Group (fictional)",
    "",
    `Progress: step ${step.n} of 5, ${step.name}. ${step.detail}`,
    `Coverage: ${cov.known} of ${cov.total} required facts known, ${cov.confirmed} confirmed by you, ${cov.clarifying} awaiting clarification, ${cov.empty} not received.`,
    "",
    "## Needed from you",
    ...(needed.length ? needed.map((n) => `- ${n}`) : ["- Nothing right now."]),
    "",
    "## We are working on",
    ...(working.length
      ? working.map((w) => `- ${w}`)
      : ["- Preparing the launch checklist."]),
    "",
    "## Risks",
    ...(risks.length ? risks.map((r) => `- ${r}`) : ["- None open."]),
    "",
    report.ran
      ? `Consistency check: ${report.conflicts.length} conflicts found, ${report.conflicts.filter((c) => c.resolved).length} resolved.`
      : "Consistency check not yet run.",
    "",
  ].join("\n");
}

export function slackUpdate(state: PrototypeState): string {
  const step = currentStep(state);
  const cov = coverage(state);
  const needed = needsFromCustomer(state);
  return [
    `*Oakwood Property Group* — step ${step.n}/5 (${step.name})`,
    `Coverage: ${cov.known}/${cov.total} known · ${cov.confirmed} confirmed · ${cov.empty} not received`,
    needed.length
      ? `Waiting on customer: ${needed.join("; ")}`
      : "Waiting on customer: nothing",
    `Next: ${nextActions(state)[0]?.title ?? "launch checklist"}`,
  ].join("\n");
}

export const AUTOMATION_THRESHOLD = 3;
export const processLog = [
  {
    id: "compare",
    label: "Compare sources for contradictions",
    baseline: 6,
    automatedBy: "Consistency check",
    live: null,
  },
  {
    id: "draft",
    label: "Turn gaps into customer questions",
    baseline: 5,
    automatedBy: "Clarification drafts",
    live: null,
  },
  {
    id: "recap",
    label: "Write the weekly recap",
    baseline: 8,
    automatedBy: "Check-in draft",
    live: null,
  },
  {
    id: "tests",
    label: "Write test cases per scenario",
    baseline: 4,
    automatedBy: "QA generator",
    live: null,
  },
  {
    id: "configure",
    label: "Copy a confirmed fact into the agent configuration",
    baseline: 2,
    automatedBy: null,
    live: "configure",
  },
  {
    id: "review-fact",
    label: "Review an extracted fact against its source",
    baseline: 1,
    automatedBy: null,
    live: "review-fact",
  },
  {
    id: "record-test",
    label: "Record a test result",
    baseline: 0,
    automatedBy: null,
    live: "record-test",
  },
  {
    id: "roster",
    label: "Re-key a roster spreadsheet",
    baseline: 2,
    automatedBy: null,
    live: null,
  },
] as const;
export function processCounts(state: PrototypeState) {
  return processLog.map((p) => {
    const live = p.live ? (state.manualLog[p.live] ?? 0) : 0;
    const total = p.baseline + live;
    return {
      ...p,
      live,
      total,
      candidate: !p.automatedBy && total >= AUTOMATION_THRESHOLD,
    };
  });
}

export const stageDays = [
  { name: "Kickoff and goals", days: "2 days" },
  { name: "Collect information", days: "4 days" },
  { name: "Clarify and confirm", days: "in progress" },
  { name: "Configure and test", days: "not started" },
  { name: "Go live and tune", days: "not started" },
];

export const seedIssues: Issue[] = [
  {
    id: "i1",
    text: "A caller asked about guest parking and the agent guessed.",
    factId: "F1",
    expected: "Says the team will follow up; does not guess.",
  },
  {
    id: "i2",
    text: "An after-hours caller was not offered a callback number.",
    factId: "T3",
    expected: "Offers a callback number when the supervisor is unavailable.",
  },
  {
    id: "i3",
    text: "A lookup timed out and the agent never reported back.",
    factId: "I1",
    expected: "Takes a message when the lookup is unavailable.",
  },
];
export function convertIssue(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const issue = seedIssues.find((i) => i.id === id);
  if (!issue || state.extraTests.some((t) => t.id === `T-${id}`)) return state;
  return {
    ...state,
    extraTests: [
      ...state.extraTests,
      {
        id: `T-${id}`,
        factId: issue.factId,
        kind: "From issue",
        scenario: issue.text,
        expected: issue.expected,
        critical: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Export: plain rows for a table tool (for example Coda) and a JSON bundle
// ---------------------------------------------------------------------------------------------

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportRows(state: PrototypeState) {
  const cases = testCases(state);
  return state.facts.map((f) => {
    const mine = cases.filter((t) => t.factId === f.id);
    return {
      fact_id: f.id,
      area: f.area,
      fact: f.label,
      value: shownValue(f) ?? "",
      status: shownLifecycle(state, f),
      approval: f.approval,
      owner: f.owner,
      source: f.sourceId
        ? (allSources(state).find((s) => s.id === f.sourceId)?.title ??
          f.sourceId)
        : "",
      citation: f.anchor,
      critical: f.critical ? "yes" : "no",
      waived: f.waived?.reason ?? "",
      tests_passing: mine.filter((t) => testStatus(state, t) === "Pass").length,
      tests_total: mine.length,
    };
  });
}

export function exportCsv(state: PrototypeState): string {
  const rows = exportRows(state);
  const head = Object.keys(rows[0]);
  return (
    [
      head.join(","),
      ...rows.map((r) =>
        head.map((h) => cell((r as Record<string, unknown>)[h])).join(","),
      ),
    ].join("\n") + "\n"
  );
}

export function exportJson(state: PrototypeState): string {
  return (
    JSON.stringify(
      {
        customer: "Fictional Oakwood Property Group",
        simulated: true,
        step: currentStep(state).n,
        coverage: coverage(state),
        facts: exportRows(state),
        process: processCounts(state).map((p) => ({
          step: p.label,
          count: p.total,
          automation_candidate: p.candidate,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}
