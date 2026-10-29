// Pure, deterministic state for the v2 onboarding-preparation prototype. No network, no backend:
// everything here is simulated fictional data (Oakwood Property Group). Keep this file free of
// TypeScript-only runtime syntax (enums, namespaces) so Node can run it directly in tests.

export type Category =
  | "Goals"
  | "Team & Routing"
  | "FAQs & Policies"
  | "Handling Scenarios"
  | "Integrations";
export type KnowledgeStatus =
  | "AI draft"
  | "Needs review"
  | "Needs clarification"
  | "Internally reviewed"
  | "Customer confirmed";
export type Source = {
  id: string;
  title: string;
  type: string;
  received: string;
  scope: string;
  suppliedBy: string;
  parse: string;
  extraction: string;
  review: string;
  icon: string;
  excerpt: string;
  anchor: string;
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
};
export type Knowledge = {
  id: string;
  category: Category;
  title: string;
  summary: string;
  scope: string;
  assignee: string;
  status: KnowledgeStatus;
  evidence: string;
  anchor: string;
  sourceId: string;
  critical?: boolean;
  detail: string;
  links?: string[];
  claimIds?: string[];
  /** Bumps whenever the meaning or status changes, so earlier test results can be flagged stale. */
  rev: number;
  /** The customer's reviewed wording. Kept apart from `summary`, which stays source-based. */
  customerAnswer?: { questionId: string; value: string; revision: number };
};
export type AnswerRevision = {
  value: string;
  kind: "answer" | "unknown" | "delegate";
  at: string;
  comment: string;
};
export type Question = {
  id: string;
  title: string;
  text: string;
  proposed: string;
  why: string;
  source: string;
  recipientRole: string;
  status:
    | "AI draft"
    | "Ready to send"
    | "Sent"
    | "Response received"
    | "In review"
    | "Resolved";
  knowledgeIds: string[];
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
  knowledgeIds: string[];
  questionId?: string;
};
export type Variation = { id: string; topicLabel: string; claimIds: string[] };
export type Resolution = {
  conflictId: string;
  how: "customer answer" | "internal fix";
  note: string;
  chosenClaimId?: string;
};
export type SentRequest = {
  id: string;
  recipientRole: string;
  recipientName: string;
  questionIds: string[];
};
export type TestResult = "Pass" | "Fail";
export type TestRecord = {
  result: TestResult;
  note: string;
  knowledgeRev: number;
};
export type PrototypeState = {
  questions: Question[];
  knowledge: Knowledge[];
  packageSnapshot: number;
  knowledgeRevision: number;
  requests: SentRequest[];
  sourceRun: string[];
  resolutions: Record<string, Resolution>;
  tests: Record<string, TestRecord>;
  /** knowledgeRevision at the last consistency check; 0 means it has never been run. */
  consistencyRunAt: number;
};

export const categories: Category[] = [
  "Goals",
  "Team & Routing",
  "FAQs & Policies",
  "Handling Scenarios",
  "Integrations",
];

export const recipients: Record<string, { name: string }> = {
  "Operations lead": { name: "Maya Chen" },
  "Property manager": { name: "Priya Shah" },
};

export const sources: Source[] = [
  {
    id: "sop",
    title: "Oakwood operations handbook",
    type: "PDF · 24 pages",
    received: "Oct 22, 2026",
    scope: "Company-wide",
    suppliedBy: "Maya Chen",
    parse: "Parsed",
    extraction: "3 candidates",
    review: "Partial review",
    icon: "PDF",
    anchor: "p. 12 · Emergency calls",
    excerpt:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor. If unavailable, take a callback number and alert the property manager.",
    note: "A later call transcript gives a different weekend instruction.",
  },
  {
    id: "transcript",
    title: "Implementation kickoff call",
    type: "Transcript · TXT",
    received: "Oct 24, 2026",
    scope: "Maple Grove",
    suppliedBy: "Maya Chen",
    parse: "Parsed",
    extraction: "2 candidates",
    review: "Needs review",
    icon: "TXT",
    anchor: "18:42 · Maya Chen",
    excerpt:
      "On weekends at Maple Grove, the front desk usually handles urgent calls first. I need to check whether that still applies to flooding emergencies.",
  },
  {
    id: "roster",
    title: "Team & escalation contacts",
    type: "Spreadsheet · XLSX",
    received: "Oct 23, 2026",
    scope: "Two properties",
    suppliedBy: "Jordan Lee",
    parse: "Parsed",
    extraction: "3 candidates",
    review: "Partial review",
    icon: "XLS",
    anchor: "Escalation sheet · B4–F8",
    excerpt:
      "Maintenance supervisor: on-call role. Property manager: fallback role. Weekend schedule: maintained in the external scheduling system; do not copy a static roster.",
  },
  {
    id: "faq",
    title: "Resident FAQ snapshot",
    type: "Website · HTML",
    received: "Oct 25, 2026",
    scope: "Company-wide",
    suppliedBy: "Public oakwood.example",
    parse: "Parsed",
    extraction: "2 candidates",
    review: "Reviewed",
    icon: "WEB",
    anchor: "FAQ / office-hours · fetched Oct 25",
    excerpt:
      "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m. Messages received outside these hours are returned the next business day.",
  },
  {
    id: "prompt-draft",
    title: "Draft agent instructions v0.3",
    type: "Internal draft · Markdown",
    received: "Oct 28, 2026",
    scope: "Company-wide",
    suppliedBy: "Avery Morgan",
    parse: "Parsed",
    extraction: "2 candidates",
    review: "Needs review",
    icon: "TXT",
    anchor: "Section 3 · Transfers / Section 7 · Weekend rules",
    excerpt:
      "§3: Always transfer after-hours emergency calls to the on-call supervisor. §7: On weekends do not transfer calls; take a callback number and promise a call back.",
    note: "Written by the implementation team, not the customer. Two sections give opposite instructions.",
  },
  {
    id: "scan",
    title: "Archived move-in checklist",
    type: "PDF · scanned",
    received: "Oct 26, 2026",
    scope: "Unresolved",
    suppliedBy: "Jordan Lee",
    parse: "Needs attention",
    extraction: "Not started",
    review: "Not started",
    icon: "PDF",
    anchor: "No readable text",
    excerpt: "No text could be extracted from this scan.",
    note: "Simulated unsupported scan. Request a text-based copy or enter a manual note with provenance.",
  },
  {
    id: "empty",
    title: "Old leasing addendum",
    type: "PDF · 3 pages",
    received: "Oct 21, 2026",
    scope: "Maple Grove",
    suppliedBy: "Maya Chen",
    parse: "Parsed",
    extraction: "Zero candidates",
    review: "Needs review",
    icon: "PDF",
    anchor: "p. 1–3",
    excerpt: "Historical addendum with no usable current agent instructions.",
    note: "Zero AI candidates does not prove the document has no useful information.",
  },
  {
    id: "vendor-notice",
    title: "Vendor escalation notice",
    type: "Email · EML",
    received: "Oct 27, 2026",
    scope: "Company-wide",
    suppliedBy: "Jordan Lee",
    parse: "Parsed",
    extraction: "Failed",
    review: "Not started",
    icon: "TXT",
    anchor: "Body · vendor escalation",
    excerpt:
      "The current vendor escalation process was not extracted from this notice.",
    note: "Simulated extraction failure. Retry or capture a manual note with its source and scope before using this instruction.",
  },
];

export const claims: Claim[] = [
  {
    id: "c-sop-route",
    sourceId: "sop",
    anchor: "Handbook · p. 12",
    topic: "weekend-flood-route",
    topicLabel: "Weekend flooding route",
    scope: "Company-wide",
    value: "Transfer to the on-call maintenance supervisor",
    quote:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor.",
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
  },
  {
    id: "c-pets-mg",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    topic: "pet-limit",
    topicLabel: "Pet limit",
    scope: "Maple Grove",
    value: "Up to two cats",
    quote: "Maple Grove: up to two cats.",
  },
  {
    id: "c-pets-wc",
    sourceId: "sop",
    anchor: "Handbook · p. 7",
    topic: "pet-limit",
    topicLabel: "Pet limit",
    scope: "Willow Court",
    value: "One cat with written approval",
    quote: "Willow Court: one cat with written approval.",
  },
  {
    id: "c-hours",
    sourceId: "faq",
    anchor: "Resident FAQ · office-hours",
    topic: "office-hours",
    topicLabel: "Leasing office hours",
    scope: "Company-wide",
    value: "Monday–Friday, 9 a.m.–5 p.m.",
    quote: "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m.",
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
  },
];

const initialKnowledge: Knowledge[] = [
  {
    id: "goal",
    category: "Goals",
    title: "Reduce unanswered resident calls",
    summary:
      "Capture common requests consistently and route urgent issues to a human.",
    scope: "Company-wide",
    assignee: "Avery Morgan",
    status: "Internally reviewed",
    evidence:
      "The team wants fewer missed resident calls without replacing its human escalation process.",
    anchor: "Kickoff call · 04:15",
    sourceId: "transcript",
    detail:
      "Success indicator: fewer unanswered calls during staffed hours; customer has not supplied a numeric target.",
    rev: 1,
  },
  {
    id: "hours",
    category: "FAQs & Policies",
    title: "Leasing office hours",
    summary:
      "Monday–Friday, 9 a.m.–5 p.m.; after-hours messages return next business day.",
    scope: "Company-wide",
    assignee: "Avery Morgan",
    status: "Internally reviewed",
    evidence: "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m.",
    anchor: "Resident FAQ · office-hours",
    sourceId: "faq",
    detail:
      "Routine source-supported fact. Internal review is sufficient while no material uncertainty is flagged.",
    claimIds: ["c-hours"],
    rev: 1,
  },
  {
    id: "pets",
    category: "FAQs & Policies",
    title: "Pet policy varies by property",
    summary:
      "Maple Grove allows up to two cats; Willow Court uses a different limit.",
    scope: "Property-specific",
    assignee: "Avery Morgan",
    status: "Needs review",
    evidence:
      "Maple Grove: up to two cats. Willow Court: one cat with written approval.",
    anchor: "Operations handbook · p. 7",
    sourceId: "sop",
    detail:
      "Separate property rules are an allowed variation, not automatically a conflict.",
    claimIds: ["c-pets-mg", "c-pets-wc"],
    rev: 1,
  },
  {
    id: "person",
    category: "Team & Routing",
    title: "Maintenance supervisor role",
    summary:
      "A role owns after-hours maintenance escalation; the roster stays external.",
    scope: "Company-wide",
    assignee: "Avery Morgan",
    status: "Internally reviewed",
    evidence:
      "Maintenance supervisor: on-call role. Weekend schedule: maintained in the external scheduling system.",
    anchor: "Escalation sheet · B4–F8",
    sourceId: "roster",
    detail:
      "This records a role and responsibility. It does not store a live person's shift assignment.",
    rev: 1,
  },
  {
    id: "emergency",
    category: "Team & Routing",
    title: "Weekend emergency routing",
    summary:
      "Handbook says on-call supervisor; kickoff call suggests front desk first.",
    scope: "Maple Grove",
    assignee: "Avery Morgan",
    status: "Needs clarification",
    evidence:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor.",
    anchor: "Operations handbook · p. 12",
    sourceId: "sop",
    critical: true,
    detail:
      "Conflicting current direction for weekend flooding. Do not use either route in agent-facing instructions until the customer answer and staff approval are recorded.",
    links: ["scenario"],
    claimIds: ["c-sop-route", "c-call-route"],
    rev: 1,
  },
  {
    id: "transfer-rule",
    category: "Team & Routing",
    title: "After-hours emergency transfer behaviour",
    summary:
      "Our draft instructions say both to always transfer and never to transfer on weekends.",
    scope: "Company-wide",
    assignee: "Avery Morgan",
    status: "Needs review",
    evidence:
      "Always transfer after-hours emergency calls to the on-call supervisor.",
    anchor: "Draft instructions · §3 and §7",
    sourceId: "prompt-draft",
    detail:
      "Two sections of the draft agent instructions contradict each other. An agent given both cannot know what to do. Fix the draft before it reaches a customer.",
    claimIds: ["c-draft-transfer", "c-draft-weekend"],
    rev: 1,
  },
  {
    id: "scenario",
    category: "Handling Scenarios",
    title: "Flooding emergency call",
    summary:
      "Collect location, callback number and safety context; transfer path unresolved.",
    scope: "Maple Grove",
    assignee: "Avery Morgan",
    status: "Needs clarification",
    evidence:
      "If unavailable, take a callback number and alert the property manager.",
    anchor: "Operations handbook · p. 12",
    sourceId: "sop",
    critical: true,
    detail:
      "Trigger: active flooding. Ask: property/unit, callback and immediate safety concern. Escalation and fallback require confirmation before use.",
    links: ["emergency"],
    rev: 1,
  },
  {
    id: "integration",
    category: "Integrations",
    title: "PMS lookup requirements",
    summary:
      "Need authorization owner, allowed lookup operations and fallback.",
    scope: "Company-wide",
    assignee: "Avery Morgan",
    status: "Needs clarification",
    evidence:
      "The team uses a PMS for resident and work-order context; approved access is still to be defined.",
    anchor: "Kickoff call · 32:10",
    sourceId: "transcript",
    detail:
      "No credentials are requested or stored here. The live connection is a later setup task. Missing owner and permission scope are preparation blockers until clarified.",
    rev: 1,
  },
];

export const initialState: PrototypeState = {
  knowledge: initialKnowledge,
  knowledgeRevision: 1,
  packageSnapshot: 0,
  requests: [],
  sourceRun: [],
  resolutions: {},
  tests: {},
  consistencyRunAt: 0,
  questions: [
    {
      id: "q-emergency",
      title: "Weekend flooding route",
      text: "For a flooding emergency at Maple Grove on a weekend, should the agent route the caller to the front desk first or directly to the on-call maintenance supervisor? If neither, what is the correct handoff and fallback?",
      proposed: "AI-drafted example · staff must review",
      why: "The handbook and kickoff transcript give different weekend directions for the same property.",
      source: "Handbook p. 12 + kickoff call 18:42",
      recipientRole: "Operations lead",
      status: "AI draft",
      knowledgeIds: ["emergency", "scenario"],
      revisions: [],
      reviewedRevision: 0,
      conflictId: "weekend-flood-route",
    },
    {
      id: "q-integration",
      title: "PMS access owner",
      text: "Who can authorize the PMS lookups needed for resident and work-order context, which operations may the agent request, and what should happen when lookup is unavailable?",
      proposed: "AI-drafted example · staff must review",
      why: "The integration owner, permitted operations and safe fallback are not yet documented.",
      source: "Kickoff call 32:10",
      recipientRole: "Operations lead",
      status: "AI draft",
      knowledgeIds: ["integration"],
      revisions: [],
      reviewedRevision: 0,
    },
    {
      id: "q-pets",
      title: "Willow Court pet exception",
      text: "Does Willow Court require written approval for one cat, and are there any exceptions the team should know about?",
      proposed: "AI-drafted example · staff must review",
      why: "The property-specific limit is present, but exception handling is not confirmed.",
      source: "Handbook p. 7",
      recipientRole: "Property manager",
      status: "AI draft",
      knowledgeIds: ["pets"],
      revisions: [],
      reviewedRevision: 0,
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Questions and answers
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

/** Create one request per recipient from questions whose wording staff approved. */
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
    !["Sent", "Response received", "In review", "Resolved"].includes(
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
  const questions = state.questions.map((q) =>
    q.id === id
      ? {
          ...q,
          status: "Response received" as const,
          revisions: [...q.revisions, revision],
        }
      : q,
  );
  const knowledge = state.knowledge.map((item) =>
    question.knowledgeIds.includes(item.id)
      ? { ...item, status: "Needs clarification" as const, rev: item.rev + 1 }
      : item,
  );
  // An amendment reopens whatever conflict this question had resolved.
  const resolutions = { ...state.resolutions };
  if (question.conflictId) delete resolutions[question.conflictId];
  return {
    ...state,
    questions,
    knowledge,
    resolutions,
    knowledgeRevision: state.knowledgeRevision + 1,
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
  const questions = state.questions.map((q) =>
    q.id === id
      ? { ...q, status: "Resolved" as const, reviewedRevision: revision }
      : q,
  );
  // The customer's wording is attached beside each linked item. It never replaces the
  // source-based summary, so items sharing a question keep their own content.
  const knowledge = state.knowledge.map((item) =>
    question.knowledgeIds.includes(item.id)
      ? {
          ...item,
          status: item.critical
            ? ("Customer confirmed" as const)
            : ("Internally reviewed" as const),
          customerAnswer: { questionId: id, value: latest.value, revision },
          rev: item.rev + 1,
        }
      : item,
  );
  const resolutions = { ...state.resolutions };
  if (question.conflictId)
    resolutions[question.conflictId] = {
      conflictId: question.conflictId,
      how: "customer answer",
      note: latest.value,
    };
  return {
    ...state,
    questions,
    knowledge,
    resolutions,
    knowledgeRevision: state.knowledgeRevision + 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Consistency check: contradictions between sources, and inside our own draft instructions
// ---------------------------------------------------------------------------------------------

const overlaps = (a: string, b: string) =>
  a === b || a === "Company-wide" || b === "Company-wide";

export function detectConflicts(): {
  conflicts: Conflict[];
  variations: Variation[];
} {
  const conflicts: Conflict[] = [];
  const variations: Variation[] = [];
  const topics = [...new Set(claims.map((c) => c.topic))];
  for (const topic of topics) {
    const group = claims.filter((c) => c.topic === topic);
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
      const knowledgeIds = initialKnowledge
        .filter((k) => k.claimIds?.some((id) => clashing.has(id)))
        .map((k) => k.id);
      conflicts.push({
        id: topic,
        topicLabel: label,
        scope:
          involved.find((c) => c.scope !== "Company-wide")?.scope ??
          "Company-wide",
        claimIds: involved.map((c) => c.id),
        needs: involved.every((c) => c.sourceId !== "prompt-draft")
          ? "customer"
          : "internal",
        knowledgeIds,
        questionId: initialState.questions.find((q) => q.conflictId === topic)
          ?.id,
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
  const { conflicts, variations } = detectConflicts();
  const rows = conflicts.map((c) => ({
    ...c,
    resolution: state.resolutions[c.id],
    resolved: Boolean(state.resolutions[c.id]),
  }));
  return {
    ran: state.consistencyRunAt > 0,
    claimsChecked: claims.length,
    sourcesChecked: new Set(claims.map((c) => c.sourceId)).size,
    conflicts: rows,
    open: rows.filter((c) => !c.resolved),
    variations,
  };
}

export function runConsistencyCheck(state: PrototypeState): PrototypeState {
  return { ...state, consistencyRunAt: state.knowledgeRevision };
}

/** Fix a contradiction inside our own draft by choosing the intended instruction. */
export function resolveInternally(
  state: PrototypeState,
  conflictId: string,
  chosenClaimId: string,
  note: string,
): PrototypeState {
  const conflict = detectConflicts().conflicts.find((c) => c.id === conflictId);
  if (
    !conflict ||
    conflict.needs !== "internal" ||
    !conflict.claimIds.includes(chosenClaimId) ||
    !note.trim() ||
    state.resolutions[conflictId]
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
        chosenClaimId,
      },
    },
    knowledge: state.knowledge.map((k) =>
      conflict.knowledgeIds.includes(k.id)
        ? { ...k, status: "Internally reviewed" as const, rev: k.rev + 1 }
        : k,
    ),
    knowledgeRevision: state.knowledgeRevision + 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Readiness, testing and the launch checklist
// ---------------------------------------------------------------------------------------------

const reviewed = (k: Knowledge) =>
  k.status === "Internally reviewed" || k.status === "Customer confirmed";

export function readiness(state: PrototypeState) {
  const report = consistencyReport(state);
  const criticalOpen = state.knowledge.filter(
    (k) => k.critical && k.status !== "Customer confirmed",
  );
  const integrationsOpen = state.knowledge.filter(
    (k) => k.category === "Integrations" && !reviewed(k),
  );
  const blockers = [
    ...(!report.ran
      ? ["The consistency check has not been run on the collected sources."]
      : []),
    ...report.open.map(
      (c) =>
        `Open conflict: ${c.topicLabel} (${c.claimIds.length} statements disagree).`,
    ),
    ...criticalOpen.map(
      (k) =>
        `${k.title} needs a reviewed customer answer and explicit specialist approval.`,
    ),
    ...integrationsOpen.map((k) =>
      k.id === "integration"
        ? "PMS authorization owner, allowed operations and safe fallback are still unknown."
        : `${k.title} is still unresolved.`,
    ),
  ];
  return {
    ready: blockers.length === 0,
    critical: criticalOpen.length,
    openConflicts: report.open.length,
    stale:
      state.packageSnapshot > 0 &&
      state.knowledgeRevision !== state.packageSnapshot,
    blockers,
  };
}

export type TestKind =
  | "Normal"
  | "Negative"
  | "Boundary"
  | "After-hours"
  | "Transfer"
  | "Emergency"
  | "Unsupported question"
  | "Integration failure";
export type TestCase = {
  id: string;
  knowledgeId: string;
  kind: TestKind;
  scenario: string;
  expected: string;
  critical: boolean;
};

/** Manual test cases for every reviewed knowledge item. Nothing here is executed by the app. */
export function testCases(state: PrototypeState): TestCase[] {
  const cases: TestCase[] = [];
  for (const k of state.knowledge.filter(reviewed)) {
    const make = (kind: TestKind, scenario: string, expected: string) =>
      cases.push({
        id: `T-${k.id}-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        knowledgeId: k.id,
        kind,
        scenario,
        expected,
        critical: Boolean(k.critical),
      });
    make(
      "Normal",
      `A caller asks about “${k.title}” (${k.scope}).`,
      k.customerAnswer?.value ?? k.summary,
    );
    make(
      "Negative",
      `A caller asks for something “${k.title}” does not allow.`,
      "Declines or escalates; does not invent a permission.",
    );
    make(
      "Boundary",
      `A caller's situation sits at the edge of the scope (${k.scope}) or conditions.`,
      "Applies the stated scope; escalates when unsure.",
    );
    if (k.category === "Team & Routing") {
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
    if (k.critical)
      make(
        "Emergency",
        "A resident reports an active emergency such as flooding.",
        "Collects location, callback number and safety context, then follows the confirmed route.",
      );
    if (k.category === "FAQs & Policies")
      make(
        "Unsupported question",
        "The caller asks something the knowledge base does not cover.",
        "Says it will pass the question to the team; does not guess.",
      );
    if (k.category === "Integrations")
      make(
        "Integration failure",
        "The property-system lookup is unavailable.",
        "Does not guess live data; takes a message.",
      );
  }
  return cases;
}

export type TestStatus = "Not run" | "Pass" | "Fail" | "Needs retest";

export function testStatus(state: PrototypeState, tc: TestCase): TestStatus {
  const record = state.tests[tc.id];
  if (!record) return "Not run";
  const k = state.knowledge.find((item) => item.id === tc.knowledgeId);
  if (!k || record.knowledgeRev !== k.rev) return "Needs retest";
  return record.result;
}

export function recordTest(
  state: PrototypeState,
  id: string,
  result: TestResult,
  note = "",
): PrototypeState {
  const tc = testCases(state).find((t) => t.id === id);
  const k = tc && state.knowledge.find((item) => item.id === tc.knowledgeId);
  if (!tc || !k) return state;
  return {
    ...state,
    tests: {
      ...state.tests,
      [id]: { result, note: note.trim(), knowledgeRev: k.rev },
    },
  };
}

export function launchChecklist(state: PrototypeState) {
  const status = readiness(state);
  const cases = testCases(state);
  const statuses = cases.map((t) => ({ t, s: testStatus(state, t) }));
  const critical = statuses.filter((x) => x.t.critical);
  const unreviewed = state.knowledge.filter((k) => !reviewed(k));
  const unanswered = state.questions.filter((q) => q.status !== "Resolved");
  const item = (id: string, label: string, pass: boolean, detail: string) => ({
    id,
    label,
    pass,
    detail,
  });
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
      "reviewed",
      "Every knowledge item reviewed",
      unreviewed.length === 0,
      unreviewed.length
        ? `${unreviewed.length} still awaiting review.`
        : "All reviewed.",
    ),
    item(
      "questions",
      "Customer questions answered and reviewed",
      unanswered.length === 0,
      unanswered.length ? `${unanswered.length} open.` : "All resolved.",
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
      "No failing or stale test results",
      statuses.length > 0 &&
        !statuses.some((x) => x.s === "Fail" || x.s === "Needs retest"),
      `${statuses.filter((x) => x.s === "Fail").length} failing · ${statuses.filter((x) => x.s === "Needs retest").length} need retest.`,
    ),
    item(
      "coverage",
      "Every test case has a result",
      statuses.length > 0 && statuses.every((x) => x.s === "Pass"),
      `${statuses.filter((x) => x.s === "Pass").length} of ${statuses.length} passed.`,
    ),
  ];
}

// ---------------------------------------------------------------------------------------------
// Progress transparency
// ---------------------------------------------------------------------------------------------

export type StepStatus = "Done" | "Current" | "Upcoming";
export type Step = {
  n: number;
  name: string;
  status: StepStatus;
  detail: string;
};

export function onboardingSteps(state: PrototypeState): Step[] {
  const prep = readiness(state);
  const checklist = launchChecklist(state);
  const passed = checklist.filter((c) => c.pass).length;
  const launchDone = checklist.every((c) => c.pass);
  const needAttention = sources.filter(
    (s) => s.parse === "Needs attention" || s.extraction === "Failed",
  ).length;
  const step = (
    n: number,
    name: string,
    status: StepStatus,
    detail: string,
  ): Step => ({
    n,
    name,
    status,
    detail,
  });
  return [
    step(1, "Kickoff and goals", "Done", "Goals agreed on the kickoff call."),
    step(
      2,
      "Collect information",
      "Done",
      `${sources.length} sources received${needAttention ? `; ${needAttention} need a readable copy` : ""}.`,
    ),
    step(
      3,
      "Clarify and confirm",
      prep.ready ? "Done" : "Current",
      prep.ready
        ? "Conflicts and critical items resolved."
        : `${prep.blockers.length} open before setup can be prepared.`,
    ),
    step(
      4,
      "Configure and test",
      !prep.ready ? "Upcoming" : launchDone ? "Done" : "Current",
      !prep.ready
        ? "Starts when step 3 is complete."
        : `${passed} of ${checklist.length} launch checks passed.`,
    ),
    step(
      5,
      "Go live and tune",
      launchDone && prep.ready ? "Current" : "Upcoming",
      "Weekly check-ins for the first four weeks, then monthly.",
    ),
  ];
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
        q.revisions.length === 0,
    )
    .map((q) => `Answer: ${q.title}`);
}

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
    view: string;
    knowledgeId?: string;
    questionId?: string;
    sourceId?: string;
  };
};

export function nextActions(state: PrototypeState): NextAction[] {
  const actions: NextAction[] = [];
  const report = consistencyReport(state);
  const owner = "Avery Morgan";
  if (!report.ran)
    actions.push({
      id: "run-check",
      tone: "orange",
      icon: "◈",
      title: "Run the consistency check",
      subtitle: `${claims.length} statements from ${new Set(claims.map((c) => c.sourceId)).size} sources have not been compared`,
      owner,
      due: "Before asking the customer",
      button: "Run check",
      target: { view: "checks" },
    });
  for (const c of report.open) {
    actions.push({
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
      owner,
      due: "Due today",
      button: c.needs === "customer" ? "Resolve" : "Fix",
      target:
        c.needs === "customer"
          ? { view: "clarifications", questionId: c.questionId }
          : { view: "checks" },
    });
  }
  for (const q of state.questions.filter(
    (x) => x.revisions.length > x.reviewedRevision,
  ))
    actions.push({
      id: `review-${q.id}`,
      tone: "orange",
      icon: "↺",
      title: `Review customer answer: ${q.title}`,
      subtitle: "A response is evidence; specialist approval is still required",
      owner,
      due: "New reply",
      button: "Review",
      target: { view: "clarifications", questionId: q.id },
    });
  for (const q of state.questions.filter((x) => x.status === "AI draft"))
    actions.push({
      id: `approve-${q.id}`,
      tone: "blue",
      icon: "◎",
      title: `Approve wording: ${q.title}`,
      subtitle: `AI-drafted question for the ${q.recipientRole}`,
      owner,
      due: "Before sending",
      button: "Review",
      target: { view: "clarifications", questionId: q.id },
    });
  for (const role of Object.keys(recipients)) {
    const ready = state.questions.filter(
      (q) => q.recipientRole === role && q.status === "Ready to send",
    );
    if (ready.length)
      actions.push({
        id: `send-${role}`,
        tone: "blue",
        icon: "↗",
        title: `Send ${ready.length} approved question${ready.length === 1 ? "" : "s"} to ${recipients[role].name}`,
        subtitle: role,
        owner,
        due: "Ready",
        button: "Send",
        target: { view: "clarifications", questionId: ready[0].id },
      });
  }
  for (const k of state.knowledge.filter((x) => x.status === "Needs review"))
    actions.push({
      id: `knowledge-${k.id}`,
      tone: "blue",
      icon: "◇",
      title: `Review: ${k.title}`,
      subtitle: "Source-backed candidate, not customer confirmed",
      owner,
      due: "Oct 31",
      button: "Review",
      target: { view: "knowledge", knowledgeId: k.id },
    });
  for (const s of sources.filter((x) => x.parse === "Needs attention"))
    actions.push({
      id: `source-${s.id}`,
      tone: "green",
      icon: "▤",
      title: `Get a readable copy: ${s.title}`,
      subtitle: "The scan has no extractable text",
      owner,
      due: "Nov 2",
      button: "Open source",
      target: { view: "sources", sourceId: s.id },
    });
  if (readiness(state).ready) {
    const waiting = testCases(state).filter((t) => {
      const s = testStatus(state, t);
      return s === "Not run" || s === "Needs retest" || s === "Fail";
    });
    if (waiting.length)
      actions.push({
        id: "tests",
        tone: "orange",
        icon: "✓",
        title: `Record ${waiting.length} test result${waiting.length === 1 ? "" : "s"}`,
        subtitle:
          "Run the scenarios against the configured agent, then record the outcome",
        owner,
        due: "Before launch",
        button: "Open QA",
        target: { view: "qa" },
      });
  }
  return actions;
}

export function weeklyCheckIn(state: PrototypeState): string {
  const step = currentStep(state);
  const report = consistencyReport(state);
  const status = readiness(state);
  const done = [
    `${sources.length} sources received and parsed (${sources.filter((s) => s.parse === "Needs attention").length} need a readable copy).`,
    `${state.knowledge.filter(reviewed).length} of ${state.knowledge.length} knowledge items reviewed.`,
    `${state.questions.filter((q) => q.status === "Resolved").length} customer questions resolved.`,
    report.ran
      ? `Consistency check run: ${report.conflicts.length} conflicts found, ${report.conflicts.filter((c) => c.resolved).length} resolved.`
      : "Consistency check not yet run.",
  ];
  const needed = needsFromCustomer(state);
  const working = nextActions(state)
    .slice(0, 3)
    .map((a) => a.title);
  const risks = [
    ...status.blockers,
    ...(status.stale ? ["The last setup package download is outdated."] : []),
    ...testCases(state)
      .filter((t) => testStatus(state, t) === "Fail")
      .map((t) => `Failing test ${t.id}`),
  ];
  return [
    "# Weekly check-in · Oakwood Property Group (fictional)",
    "",
    `Progress: step ${step.n} of 5 — ${step.name}. ${step.detail}`,
    "",
    "## Done since the last check-in",
    ...done.map((d) => `- ${d}`),
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
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Process log: repeated manual work is an automation candidate once it has happened three times
// ---------------------------------------------------------------------------------------------

export const processLog = [
  {
    id: "compare",
    step: "Compare sources for contradictions",
    count: 6,
    automatedBy: "Consistency check",
  },
  {
    id: "questions",
    step: "Turn gaps into customer questions",
    count: 5,
    automatedBy: "Clarification Center drafts",
  },
  {
    id: "recap",
    step: "Write the weekly check-in recap",
    count: 8,
    automatedBy: "Weekly check-in draft",
  },
  {
    id: "tests",
    step: "Write test cases per scenario",
    count: 4,
    automatedBy: "QA center",
  },
  {
    id: "creds",
    step: "Copy integration credentials into a configuration",
    count: 3,
    automatedBy: null,
  },
  {
    id: "roster",
    step: "Re-key a roster spreadsheet into an escalation table",
    count: 2,
    automatedBy: null,
  },
] as const;
export const AUTOMATION_THRESHOLD = 3;
export const isAutomationCandidate = (count: number) =>
  count >= AUTOMATION_THRESHOLD;

// ---------------------------------------------------------------------------------------------
// Setup package
// ---------------------------------------------------------------------------------------------

export function packageFiles(state: PrototypeState): Record<string, string> {
  const status = readiness(state);
  const eligible = state.knowledge.filter(reviewed);
  const section = (heading: string, rows: Knowledge[]) =>
    [
      `# ${heading}`,
      "",
      "Fictional Oakwood customer · simulated prototype",
      "",
      ...rows.flatMap((k) => [
        `## ${k.title}`,
        "",
        `Scope: ${k.scope} · Knowledge revision: ${state.knowledgeRevision}`,
        "",
        k.summary,
        "",
        ...(k.customerAnswer
          ? [
              `Customer-reviewed instruction (response revision ${k.customerAnswer.revision}): ${k.customerAnswer.value}`,
              "",
            ]
          : []),
        `Source: ${k.anchor}`,
        "",
      ]),
      ...(rows.length
        ? []
        : ["No eligible reviewed information in this section.", ""]),
    ].join("\n");
  const cases = testCases(state);
  const checklist = launchChecklist(state);
  const files: Record<string, string> = {
    "01-customer-overview.md": section(
      "Customer overview",
      eligible.filter((k) => k.category === "Goals"),
    ),
    "02-knowledge-base.md": section(
      "Knowledge base",
      eligible.filter((k) => k.category === "FAQs & Policies"),
    ),
    "03-team-and-routing.md": section(
      "Team and routing",
      eligible.filter((k) => k.category === "Team & Routing"),
    ),
    "04-scenario-handling.md": section(
      "Scenario handling",
      eligible.filter((k) => k.category === "Handling Scenarios"),
    ),
    "05-integration-readiness.md": section(
      "Integration readiness",
      eligible.filter((k) => k.category === "Integrations"),
    ),
    "06-test-plan.md": [
      "# Test plan",
      "",
      "Nothing in this prototype runs a test. Results are recorded by a person after trying each scenario.",
      "",
      ...cases.flatMap((t) => [
        `## ${t.id} · ${t.kind}${t.critical ? " · critical" : ""}`,
        `- Scenario: ${t.scenario}`,
        `- Expected: ${t.expected}`,
        `- Result: ${testStatus(state, t)}${state.tests[t.id]?.note ? ` — ${state.tests[t.id].note}` : ""}`,
        "",
      ]),
      ...(cases.length ? [] : ["No reviewed knowledge to test yet.", ""]),
    ].join("\n"),
    "07-open-items.md": [
      "# Open items and blockers",
      "",
      `Package status: ${status.ready ? "Ready for configuration preparation" : "DRAFT — preparation incomplete"}`,
      "",
      ...status.blockers.map((b) => `- Critical · Avery Morgan · ${b}`),
      "- Downstream dependency · PMS connection and credentials belong to the target platform's approved setup process; none are stored here.",
      "- Unsupported scan · request a text-based move-in checklist.",
      "",
    ].join("\n"),
    "08-launch-checklist.md": [
      "# Launch checklist",
      "",
      ...checklist.map(
        (c) => `- [${c.pass ? "x" : " "}] ${c.label} — ${c.detail}`,
      ),
      "",
    ].join("\n"),
  };
  files["manifest.json"] =
    JSON.stringify(
      {
        templateVersion: "prototype-2",
        project: "Fictional Oakwood Property Group",
        snapshotRevision: state.knowledgeRevision,
        status: status.ready ? "ready_for_configuration_preparation" : "draft",
        knowledgeIds: eligible.map((k) => k.id),
        blockers: status.blockers,
        openConflicts: status.openConflicts,
        launchChecklist: {
          passed: checklist.filter((c) => c.pass).length,
          total: checklist.length,
        },
        tests: {
          total: cases.length,
          pass: cases.filter((t) => testStatus(state, t) === "Pass").length,
        },
        simulated: true,
      },
      null,
      2,
    ) + "\n";
  return files;
}

export function zipFiles(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) =>
    view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) =>
    view.setUint32(at, value >>> 0, true);
  const crc = (bytes: Uint8Array) => {
    let c = -1;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
    }
    return (c ^ -1) >>> 0;
  };
  for (const [name, content] of Object.entries(files)) {
    const title = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc(data);
    const local = new Uint8Array(30 + title.length);
    const l = new DataView(local.buffer);
    u32(l, 0, 0x04034b50);
    u16(l, 4, 20);
    u16(l, 6, 0);
    u16(l, 8, 0);
    u32(l, 14, checksum);
    u32(l, 18, data.length);
    u32(l, 22, data.length);
    u16(l, 26, title.length);
    local.set(title, 30);
    const entry = new Uint8Array(46 + title.length);
    const e = new DataView(entry.buffer);
    u32(e, 0, 0x02014b50);
    u16(e, 4, 20);
    u16(e, 6, 20);
    u32(e, 16, checksum);
    u32(e, 20, data.length);
    u32(e, 24, data.length);
    u16(e, 28, title.length);
    u32(e, 42, offset);
    entry.set(title, 46);
    chunks.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const footer = new Uint8Array(22);
  const f = new DataView(footer.buffer);
  u32(f, 0, 0x06054b50);
  u16(f, 8, central.length);
  u16(f, 10, central.length);
  u32(f, 12, centralSize);
  u32(f, 16, offset);
  const total = offset + centralSize + footer.length;
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, footer]) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
