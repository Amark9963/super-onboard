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
};
export type PrototypeState = {
  questions: Question[];
  knowledge: Knowledge[];
  packageSnapshot: number;
  knowledgeRevision: number;
  requestSent: boolean;
  sentQuestionIds: string[];
  sourceRun: string[];
};

export const categories: Category[] = [
  "Goals",
  "Team & Routing",
  "FAQs & Policies",
  "Handling Scenarios",
  "Integrations",
];

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
  },
];

export const initialState: PrototypeState = {
  knowledge: initialKnowledge,
  knowledgeRevision: 1,
  packageSnapshot: 0,
  requestSent: false,
  sentQuestionIds: [],
  sourceRun: [],
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
    !state.requestSent ||
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
      ? { ...item, status: "Needs clarification" as const }
      : item,
  );
  return {
    ...state,
    questions,
    knowledge,
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
  const questions = state.questions.map((q) =>
    q.id === id
      ? {
          ...q,
          status: "Resolved" as const,
          reviewedRevision: q.revisions.length,
        }
      : q,
  );
  const knowledge = state.knowledge.map((item) =>
    question.knowledgeIds.includes(item.id)
      ? {
          ...item,
          status: item.critical
            ? ("Customer confirmed" as const)
            : ("Internally reviewed" as const),
          summary: `Customer stated (reviewed by specialist): ${latest.value}`,
        }
      : item,
  );
  return {
    ...state,
    questions,
    knowledge,
    knowledgeRevision: state.knowledgeRevision + 1,
  };
}

export function readiness(state: PrototypeState) {
  const emergency =
    state.knowledge.find((k) => k.id === "emergency")?.status ===
    "Customer confirmed";
  const integration =
    state.knowledge.find((k) => k.id === "integration")?.status ===
    "Internally reviewed";
  const critical = state.knowledge.filter(
    (k) => k.critical && k.status !== "Customer confirmed",
  ).length;
  return {
    ready: emergency && integration && critical === 0,
    critical,
    stale:
      state.packageSnapshot > 0 &&
      state.knowledgeRevision !== state.packageSnapshot,
    blockers: [
      ...(!emergency
        ? [
            "Weekend emergency routing needs a reviewed customer answer and explicit specialist approval.",
          ]
        : []),
      ...(!integration
        ? [
            "PMS authorization owner, allowed operations and safe fallback are still unknown.",
          ]
        : []),
    ],
  };
}

export function packageFiles(state: PrototypeState): Record<string, string> {
  const status = readiness(state);
  const eligible = state.knowledge.filter((k) =>
    ["Internally reviewed", "Customer confirmed"].includes(k.status),
  );
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
        `Source: ${k.anchor}`,
        "",
      ]),
      ...(rows.length
        ? []
        : ["No eligible reviewed information in this section.", ""]),
    ].join("\n");
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
      "# Proposed manual test plan",
      "",
      "No test has been run. These are review prompts only.",
      "",
      ...eligible.flatMap((k) => [
        `## ${k.title}`,
        `- Normal: Check the confirmed or reviewed behavior for ${k.scope}.`,
        "- Negative: Do not invent unsupported permissions or facts.",
        "- Boundary: Escalate when scope or conditions are unclear.",
        "",
      ]),
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
  };
  files["manifest.json"] =
    JSON.stringify(
      {
        templateVersion: "prototype-1",
        project: "Fictional Oakwood Property Group",
        snapshotRevision: state.knowledgeRevision,
        status: status.ready ? "ready_for_configuration_preparation" : "draft",
        knowledgeIds: eligible.map((k) => k.id),
        blockers: status.blockers,
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
