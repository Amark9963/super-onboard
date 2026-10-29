// Pure, deterministic state for the onboarding prototype. No network, no backend:
// everything here is simulated, fictional data. Keep this file free of TypeScript-only
// runtime syntax (enums, namespaces) so Node can run it directly in tests.
//
// An onboarding starts from an EMPTY intake spec (20 required facts in five areas). Uploading a
// document runs a simulated extraction that fills facts with citations; the consistency check then
// finds contradictions; questions go to the customer contact who decides that topic.

export type Area =
  "Goals" | "Team & rules" | "FAQs" | "Scenarios" | "Integrations";
export type Lifecycle =
  | "Not received"
  | "Received"
  | "Extracted"
  | "Needs clarification"
  | "Customer confirmed";
export type Approval =
  "Not reviewed" | "Specialist reviewed" | "Customer approved";
/** Where a fact ends up in the voice-agent platform (terms from Super's public setup pages). */
export type Landing =
  "Context" | "Knowledge" | "Call routing" | "Skill" | "Integration";
/** What a customer contact is able to decide. Questions go to the person who decides the topic. */
export type Topic = "routing" | "integrations" | "policies" | "documents";

export type Contact = {
  name: string;
  role: string;
  email: string;
  decides: Topic[];
};
export type Client = {
  name: string;
  vertical: string;
  plan: "After Hours" | "24/7" | "Concierge";
  scope: string;
  properties: { name: string; units: number }[];
  contacts: Contact[];
  owner: string;
  kickoff: string;
  goLive: string;
  hours: string;
  channels: string[];
  systems: string[];
};

export type Fill = {
  factId: string;
  value: string;
  anchor: string;
  evidence: string;
};
export type Source = {
  id: string;
  title: string;
  type: string;
  received: string;
  suppliedBy: string;
  topic: Topic;
  /** "team" artifacts (our call recording, our draft prompt) are not requested from the customer. */
  origin: "customer" | "team";
  parse: "Parsed" | "Needs attention";
  flagged?: boolean;
  later?: boolean;
  anchor: string;
  excerpt: string;
  note?: string;
  fills: Fill[];
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
  lands: Landing;
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
  topic: Topic;
  /** Name of the customer contact this is assigned to. */
  recipient: string;
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
  recipient: string;
  questionIds: string[];
};

/** An internal comment from our team. The customer never sees these. */
export type NoteTarget = {
  kind: "fact" | "question" | "conflict" | "client";
  id: string;
};
export type Note = {
  id: number;
  target: NoteTarget;
  author: string;
  text: string;
  /** Names of the team members @mentioned in the text. */
  mentions: string[];
  at: string;
  /** Mentioned people who have opened it. */
  seenBy: string[];
};
/** A second team member's review of the approved details, before setup starts. */
export type Review = {
  status: "Requested" | "Approved" | "Changes requested";
  reviewer: string;
  requestedBy: string;
  round: number;
  reason: string;
  /** The facts as they were when the reviewer decided; a later change makes the review stale. */
  sig: string;
  at: string;
};

export type PrototypeState = {
  client: Client | null;
  /** Our own team. Lives with the account, so it survives creating a new onboarding. */
  team: TeamMember[];
  /** Id of the team member using the prototype (the sidebar can switch it, to try each role). */
  me: string;
  notes: Note[];
  review: Review | null;
  facts: Fact[];
  questions: Question[];
  requests: SentRequest[];
  resolutions: Record<string, Resolution>;
  addedSources: string[];
  reviewedSources: string[];
  docsRequested: boolean;
  copyRequested: boolean;
  /** Setup and go-live tasks the specialist ticks off by hand, by id (see setupItems). */
  setup: Record<string, boolean>;
  /** Bumps whenever a new source arrives; a check run before that is stale. */
  sourceRevision: number;
  /** sourceRevision at the last consistency check; null means it has never been run. */
  consistencyRun: number | null;
  /** Everything that happened, newest last. Filled by diffActivity in activity.ts. */
  activity: ActivityEvent[];
  clock: number;
};

export type TeamRole =
  | "Onboarding lead"
  | "Onboarding specialist"
  | "QA reviewer"
  | "Onboarding engineer";
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "Active" | "Invited";
  /** Clients this person owns that are illustrative rows on the dashboard. */
  illustrativeClients?: string[];
};

export const teamRoles: { role: TeamRole; blurb: string }[] = [
  {
    role: "Onboarding lead",
    blurb:
      "Owns the process and the team. Assigns owners and reviews risks and go-live.",
  },
  {
    role: "Onboarding specialist",
    blurb:
      "Runs an onboarding end to end: documents, clarifications and setup tracking.",
  },
  {
    role: "QA reviewer",
    blurb: "Second pair of eyes on customer answers and test results.",
  },
  {
    role: "Onboarding engineer",
    blurb: "Builds automations and handles small customer-level requests.",
  },
];

export const seedTeam: TeamMember[] = [
  {
    id: "t-avery",
    name: "Avery Morgan",
    email: "avery.morgan@example.invalid",
    role: "Onboarding specialist",
    status: "Active",
  },
  {
    id: "t-sam",
    name: "Sam Rivera",
    email: "sam.rivera@example.invalid",
    role: "Onboarding lead",
    status: "Active",
    illustrativeClients: ["Birchwood Apartments", "Cedar & Pine Realty"],
  },
  {
    id: "t-riley",
    name: "Riley Kim",
    email: "riley.kim@example.invalid",
    role: "QA reviewer",
    status: "Active",
  },
  {
    id: "t-jamie",
    name: "Jamie Park",
    email: "jamie.park@example.invalid",
    role: "Onboarding engineer",
    status: "Active",
  },
];

export type ActivityEvent = {
  id: number;
  at: string;
  actor: { name: string; side: "customer" | "team" | "system" };
  text: string;
  kind: string;
};

export const areas: Area[] = [
  "Goals",
  "Team & rules",
  "FAQs",
  "Scenarios",
  "Integrations",
];
export const topics: { id: Topic; label: string }[] = [
  { id: "routing", label: "Routing and escalation" },
  { id: "integrations", label: "Integrations and access" },
  { id: "policies", label: "Property policies" },
  { id: "documents", label: "Documents and rosters" },
];
export const OWNER = "Avery Morgan";

export const demoClient: Client = {
  name: "Oakwood Property Group",
  vertical: "Residential property management",
  plan: "Concierge",
  scope: "2 properties · 310 units",
  properties: [
    { name: "Maple Grove", units: 180 },
    { name: "Willow Court", units: 130 },
  ],
  contacts: [
    {
      name: "Maya Chen",
      role: "Operations lead",
      email: "maya.chen@oakwood.example",
      decides: ["routing", "integrations"],
    },
    {
      name: "Priya Shah",
      role: "Property manager",
      email: "priya.shah@oakwood.example",
      decides: ["policies"],
    },
    {
      name: "Jordan Lee",
      role: "Leasing coordinator",
      email: "jordan.lee@oakwood.example",
      decides: ["documents"],
    },
  ],
  owner: OWNER,
  kickoff: "Oct 22, 2026",
  goLive: "Nov 20, 2026",
  hours: "Leasing desk Mon–Fri, 9 a.m.–5 p.m.",
  channels: ["Inbound voice"],
  systems: ["Property management system (PMS)", "External scheduling system"],
};

// ---------------------------------------------------------------------------------------------
// Sources (sample documents), their simulated extraction, and the claims they make
// ---------------------------------------------------------------------------------------------

export const sourceCatalog: Source[] = [
  {
    id: "transcript",
    title: "Implementation kickoff call",
    type: "Transcript · TXT",
    received: "Oct 22, 2026",
    suppliedBy: "Implementation team",
    topic: "documents",
    origin: "team",
    parse: "Parsed",
    anchor: "18:42 · Maya Chen",
    excerpt:
      "On weekends at Maple Grove, the front desk usually handles urgent calls first. I need to check whether that still applies to flooding emergencies.",
    fills: [
      {
        factId: "G1",
        value:
          "Reduce unanswered resident calls while keeping people in the loop for urgent issues.",
        anchor: "Kickoff call · 04:15",
        evidence:
          "The team wants fewer missed resident calls without replacing its human escalation process.",
      },
      {
        factId: "G3",
        value:
          "In: leasing FAQs, maintenance requests, office hours. Out: payment disputes, legal questions.",
        anchor: "Kickoff call · 11:20",
        evidence:
          "We want it to handle the routine questions, not billing disputes.",
      },
      {
        factId: "G4",
        value: "Maple Grove and Willow Court; inbound voice only.",
        anchor: "Kickoff call · 02:10",
        evidence: "Two properties to start, phone calls only.",
      },
      {
        factId: "S2",
        value:
          "Collect unit, issue and access permission; create a work-order request for the team.",
        anchor: "Kickoff call · 22:05",
        evidence:
          "For regular repairs, we just need the unit, the problem and whether we can enter.",
      },
      {
        factId: "I1",
        value:
          "Resident and work-order system (PMS); product name to be confirmed.",
        anchor: "Kickoff call · 32:10",
        evidence:
          "We use our property management system for resident and work-order context.",
      },
    ],
  },
  {
    id: "sop",
    title: "Oakwood operations handbook",
    type: "PDF · 24 pages",
    received: "Oct 22, 2026",
    suppliedBy: "Maya Chen",
    topic: "routing",
    origin: "customer",
    parse: "Parsed",
    anchor: "p. 7 · Pets / p. 12 · Emergency calls",
    excerpt:
      "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor. If unavailable, take a callback number and alert the property manager.",
    fills: [
      {
        factId: "T2",
        value:
          "Handbook: transfer after-hours emergencies to the on-call maintenance supervisor.",
        anchor: "Handbook · p. 12",
        evidence:
          "For after-hours emergencies, transfer the caller to the on-call maintenance supervisor.",
      },
      {
        factId: "T3",
        value:
          "On-call maintenance supervisor, then property manager; otherwise take a callback number.",
        anchor: "Handbook · p. 12",
        evidence:
          "If unavailable, take a callback number and alert the property manager.",
      },
      {
        factId: "F2",
        value: "Up to two cats.",
        anchor: "Handbook · p. 7",
        evidence: "Maple Grove: up to two cats.",
      },
      {
        factId: "F3",
        value: "One cat with written approval.",
        anchor: "Handbook · p. 7",
        evidence: "Willow Court: one cat with written approval.",
      },
      {
        factId: "S1",
        value:
          "Collect property and unit, callback number and safety concern; escalation route depends on weekend routing.",
        anchor: "Handbook · p. 12",
        evidence:
          "If unavailable, take a callback number and alert the property manager.",
      },
    ],
  },
  {
    id: "roster",
    title: "Team & escalation contacts",
    type: "Spreadsheet · XLSX",
    received: "Oct 23, 2026",
    suppliedBy: "Jordan Lee",
    topic: "documents",
    origin: "customer",
    parse: "Parsed",
    anchor: "Escalation sheet · B4–F8",
    excerpt:
      "Maintenance supervisor: on-call role. Property manager: fallback role. Weekend schedule: maintained in the external scheduling system; do not copy a static roster.",
    fills: [
      {
        factId: "T1",
        value:
          "Maintenance supervisor (on-call), property manager (fallback), leasing desk (office hours).",
        anchor: "Escalation sheet · B4–F8",
        evidence:
          "Maintenance supervisor: on-call role. Property manager: fallback role.",
      },
      {
        factId: "T4",
        value:
          "Maintained in the external scheduling system; do not copy a static roster.",
        anchor: "Escalation sheet · row 8",
        evidence:
          "Weekend schedule: maintained in the external scheduling system.",
      },
    ],
  },
  {
    id: "faq",
    title: "Resident FAQ snapshot",
    type: "Website · HTML",
    received: "Oct 25, 2026",
    suppliedBy: "Public oakwood.example",
    topic: "documents",
    origin: "customer",
    parse: "Parsed",
    anchor: "FAQ / office-hours",
    excerpt:
      "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m. Messages received outside these hours are returned the next business day.",
    fills: [
      {
        factId: "F1",
        value:
          "Monday–Friday, 9 a.m.–5 p.m.; after-hours messages return next business day.",
        anchor: "Resident FAQ · office-hours",
        evidence:
          "The leasing desk is open Monday through Friday, 9 a.m.–5 p.m.",
      },
    ],
  },
  {
    id: "scan",
    title: "Archived move-in checklist",
    type: "PDF · scanned",
    received: "Oct 26, 2026",
    suppliedBy: "Jordan Lee",
    topic: "documents",
    origin: "customer",
    parse: "Needs attention",
    flagged: true,
    anchor: "No readable text",
    excerpt: "No text could be extracted from this scan.",
    note: "Request a text-based copy, or waive the fact with a reason.",
    fills: [],
  },
  {
    id: "prompt-draft",
    title: "Draft agent instructions v0.3",
    type: "Internal draft · Markdown",
    received: "Oct 28, 2026",
    suppliedBy: "Implementation team",
    topic: "documents",
    origin: "team",
    parse: "Parsed",
    anchor: "§3 Transfers / §7 Weekend rules",
    excerpt:
      "§3: Always transfer after-hours emergency calls to the on-call supervisor. §7: On weekends do not transfer calls; take a callback number and promise a call back.",
    note: "Written by the implementation team, not the customer.",
    fills: [],
  },
  {
    id: "email-maya",
    title: "Email from Maya Chen",
    type: "Email · EML",
    received: "Oct 29, 2026",
    suppliedBy: "Maya Chen",
    topic: "routing",
    origin: "customer",
    parse: "Parsed",
    later: true,
    anchor: "Email body",
    excerpt:
      "Our target is 90% of calls answered during staffed hours. Residents locked out of their unit should go to the on-call maintenance supervisor. Both properties allow two cats.",
    note: "Simulated late-arriving source.",
    fills: [
      {
        factId: "G2",
        value: "Answer 90% of calls during staffed hours.",
        anchor: "Email · first line",
        evidence: "Our target is 90% of calls answered during staffed hours.",
      },
      {
        factId: "S3",
        value: "Transfer to the on-call maintenance supervisor.",
        anchor: "Email · second line",
        evidence:
          "Residents locked out of their unit should go to the on-call maintenance supervisor.",
      },
    ],
  },
];
export const LATE_ID = "email-maya";
export const lateSource = sourceCatalog.find((s) => s.id === LATE_ID)!;
export const baseSources = sourceCatalog.filter((s) => !s.later);

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
// The empty spec: 20 required facts. Three start with a template default from our own standard.
// ---------------------------------------------------------------------------------------------

const fact = (
  f: Partial<Fact> & Pick<Fact, "id" | "area" | "label" | "lands">,
): Fact => ({
  value: null,
  sourceId: null,
  anchor: "Not yet received",
  evidence: "",
  owner: OWNER,
  lifecycle: "Not received",
  approval: "Not reviewed",
  rev: 1,
  ...f,
});

const templateDefault = {
  lifecycle: "Extracted" as const,
  sourceId: null,
  anchor: "Implementation team template",
};

const emptyFacts = (): Fact[] => [
  fact({
    id: "G1",
    area: "Goals",
    label: "Primary objective",
    lands: "Context",
  }),
  fact({
    id: "G2",
    area: "Goals",
    label: "Success measure",
    lands: "Context",
    note: "No numeric target has been given.",
  }),
  fact({
    id: "G3",
    area: "Goals",
    label: "Call types in and out of scope",
    lands: "Context",
  }),
  fact({
    id: "G4",
    area: "Goals",
    label: "Properties and channels",
    lands: "Context",
  }),
  fact({
    id: "T1",
    area: "Team & rules",
    label: "Roles and responsibilities",
    lands: "Call routing",
  }),
  fact({
    id: "T2",
    area: "Team & rules",
    label: "Weekend emergency routing",
    lands: "Call routing",
    critical: true,
  }),
  fact({
    id: "T3",
    area: "Team & rules",
    label: "Escalation order and fallback",
    lands: "Call routing",
  }),
  fact({
    id: "T4",
    area: "Team & rules",
    label: "Weekend coverage source",
    lands: "Call routing",
  }),
  fact({ id: "F1", area: "FAQs", label: "Office hours", lands: "Knowledge" }),
  fact({
    id: "F2",
    area: "FAQs",
    label: "Pet policy, Maple Grove",
    lands: "Knowledge",
  }),
  fact({
    id: "F3",
    area: "FAQs",
    label: "Pet policy, Willow Court",
    lands: "Knowledge",
  }),
  fact({
    id: "F4",
    area: "FAQs",
    label: "Move-in checklist",
    lands: "Knowledge",
    note: "Not yet received.",
  }),
  fact({
    id: "S1",
    area: "Scenarios",
    label: "Flooding emergency",
    lands: "Skill",
    critical: true,
  }),
  fact({
    id: "S2",
    area: "Scenarios",
    label: "Maintenance request",
    lands: "Skill",
  }),
  fact({
    id: "S3",
    area: "Scenarios",
    label: "Locked out of unit",
    lands: "Skill",
    note: "Not yet discussed.",
  }),
  fact({
    id: "S4",
    area: "Scenarios",
    label: "Unsupported question",
    lands: "Skill",
    ...templateDefault,
    value:
      "Say the team will follow up, take a callback number, and return the call next business day.",
    evidence: "Our standard handling for anything outside the knowledge base.",
    approval: "Specialist reviewed",
  }),
  fact({
    id: "I1",
    area: "Integrations",
    label: "Property-system name",
    lands: "Integration",
  }),
  fact({
    id: "I2",
    area: "Integrations",
    label: "Authorization owner",
    lands: "Integration",
    critical: true,
    note: "Nobody has said who can authorize access. No credentials are requested or stored here.",
  }),
  fact({
    id: "I3",
    area: "Integrations",
    label: "Allowed operations",
    lands: "Integration",
    critical: true,
    ...templateDefault,
    lifecycle: "Needs clarification",
    value:
      "Proposed by us: read-only lookup of resident and work-order status.",
    evidence: "Our proposal; the customer has not agreed.",
  }),
  fact({
    id: "I4",
    area: "Integrations",
    label: "Failure fallback",
    lands: "Integration",
    ...templateDefault,
    value: "Proposed by us: take a message; never guess live data.",
    evidence: "Our proposal; the customer has not reviewed it.",
  }),
];

const freshOnboarding = (): Omit<PrototypeState, "client" | "team" | "me"> => ({
  notes: [],
  review: null,
  facts: emptyFacts(),
  questions: [],
  requests: [],
  resolutions: {},
  addedSources: [],
  reviewedSources: [],
  docsRequested: false,
  copyRequested: false,
  setup: {},
  sourceRevision: 1,
  consistencyRun: null,
  activity: [],
  clock: 0,
});

export const initialState: PrototypeState = {
  client: null,
  team: seedTeam,
  me: "t-avery",
  ...freshOnboarding(),
};

export function createClient(
  state: PrototypeState,
  client: Client,
): PrototypeState {
  return { ...state, ...freshOnboarding(), client };
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

export const factById = (state: PrototypeState, id: string) =>
  state.facts.find((f) => f.id === id);
export const shownValue = (f: Fact) => f.customerAnswer?.value ?? f.value;
export const isConfirmed = (f: Fact) => f.approval === "Customer approved";
export const allSources = (state: PrototypeState): Source[] =>
  state.addedSources
    .map((id) => sourceCatalog.find((s) => s.id === id)!)
    .filter(Boolean);

/** The customer contact who decides a topic. Falls back to the first contact. */
export function contactFor(
  state: PrototypeState,
  topic: Topic,
): Contact | undefined {
  const cs = state.client?.contacts ?? [];
  return cs.find((c) => c.decides.includes(topic)) ?? cs[0];
}
export const contactByName = (state: PrototypeState, name: string) =>
  state.client?.contacts.find((c) => c.name === name);

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

// ---------------------------------------------------------------------------------------------
// Documents: request, upload (simulated extraction), review
// ---------------------------------------------------------------------------------------------

export const documentRequests: {
  sourceId: string;
  label: string;
  area: Area;
}[] = [
  { sourceId: "transcript", label: "Kickoff call recording", area: "Goals" },
  { sourceId: "sop", label: "Operations handbook", area: "Team & rules" },
  {
    sourceId: "roster",
    label: "Escalation contacts spreadsheet",
    area: "Team & rules",
  },
  { sourceId: "faq", label: "Resident FAQ or website link", area: "FAQs" },
  { sourceId: "scan", label: "Move-in checklist", area: "FAQs" },
];

export function sendDocumentRequest(state: PrototypeState): PrototypeState {
  return state.client ? { ...state, docsRequested: true } : state;
}
export function requestReadableCopy(state: PrototypeState): PrototypeState {
  return state.addedSources.includes("scan")
    ? { ...state, copyRequested: true }
    : state;
}

/** Simulated upload: the document is logged and its extraction fills empty facts with citations. */
export function uploadSource(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const src = sourceCatalog.find((s) => s.id === id);
  if (!src || state.addedSources.includes(id)) return state;
  const fills = new Map(src.fills.map((x) => [x.factId, x]));
  return {
    ...state,
    addedSources: [...state.addedSources, id],
    sourceRevision: state.sourceRevision + 1,
    facts: state.facts.map((f) => {
      const x = fills.get(f.id);
      if (!x || f.value !== null) return f;
      return {
        ...f,
        value: x.value,
        sourceId: id,
        anchor: x.anchor,
        evidence: x.evidence,
        lifecycle: "Extracted" as const,
        approval: "Not reviewed" as const,
        note: undefined,
        rev: f.rev + 1,
      };
    }),
  };
}
/** Kept for the demo tray: the late email is just another upload. */
export const addSource = (state: PrototypeState) =>
  uploadSource(state, LATE_ID);

export const needsReview = (s: Source) => s.fills.length > 0;
/** The specialist checked the extraction against the document. */
export function reviewSource(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const src = sourceCatalog.find((s) => s.id === id);
  if (
    !src ||
    !state.addedSources.includes(id) ||
    state.reviewedSources.includes(id)
  )
    return state;
  const facts = state.facts.map((f) => {
    if (
      f.sourceId === id &&
      f.approval === "Not reviewed" &&
      f.lifecycle === "Extracted"
    ) {
      return { ...f, approval: "Specialist reviewed" as const };
    }
    return f;
  });
  return { ...state, facts, reviewedSources: [...state.reviewedSources, id] };
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
  const present = new Set(state.addedSources);
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
  const present = new Set(state.addedSources);
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

// Questions the check drafts. The recipient is the customer contact who decides the topic.
type QuestionSeed = Omit<
  Question,
  "status" | "revisions" | "reviewedRevision" | "recipient"
>;
const questionCatalog: QuestionSeed[] = [
  {
    id: "q-emergency",
    title: "Weekend flooding route",
    topic: "routing",
    conflictId: "weekend-flood-route",
    factIds: ["T2", "S1"],
    text: "For a flooding emergency at Maple Grove on a weekend, who should the agent route the caller to first?",
    why: "The handbook and the kickoff call give different weekend directions for the same property.",
    source: "Handbook p. 12 + kickoff call 18:42",
    options: [
      "Route to the on-call maintenance supervisor first",
      "Route to the front desk first, then the supervisor",
      "Something else (explain below)",
    ],
  },
  {
    id: "q-integration",
    title: "Property-system access",
    topic: "integrations",
    factIds: ["I2", "I3", "I4"],
    text: "Who can authorize read-only lookups in the property system, and what should the agent do when a lookup is unavailable?",
    why: "The authorization owner is unknown and the allowed operations are only our proposal.",
    source: "Kickoff call 32:10 + our template",
    options: [
      "The operations lead authorizes read-only lookups",
      "Someone else authorizes (name them below)",
      "No lookups for now",
    ],
  },
  {
    id: "q-pets",
    title: "Pet limits by property",
    topic: "policies",
    conflictId: "pet-limit",
    factIds: ["F2", "F3"],
    text: "What is the correct pet limit at each property, including any exceptions?",
    why: "The handbook sets limits per property; a later email says both allow two cats.",
    source: "Handbook p. 7 + email",
    options: [
      "Per property: two cats at Maple Grove, one cat at Willow Court",
      "Two cats at both properties",
      "Something else (explain below)",
    ],
    defaultIfNoReply:
      "Keep the limits per property and flag them as unconfirmed",
  },
];

/** Draft a question for every open customer conflict and every unresolved critical integration fact. */
export function ensureQuestions(state: PrototypeState): PrototypeState {
  if (!state.client) return state;
  const open = new Set(
    consistencyReport(state)
      .open.filter((c) => c.needs === "customer")
      .map((c) => c.id),
  );
  const integrationOpen = state.facts.some(
    (f) => ["I2", "I3"].includes(f.id) && !isConfirmed(f),
  );
  const added: Question[] = [];
  for (const seed of questionCatalog) {
    if (state.questions.some((q) => q.id === seed.id)) continue;
    const needed = seed.conflictId
      ? open.has(seed.conflictId)
      : integrationOpen;
    if (!needed) continue;
    added.push({
      ...seed,
      recipient: contactFor(state, seed.topic)?.name ?? "",
      status: "AI draft",
      revisions: [],
      reviewedRevision: 0,
    });
  }
  return added.length
    ? { ...state, questions: [...state.questions, ...added] }
    : state;
}

/** Run the check: it flags the facts behind every open customer conflict and drafts the questions. */
export function runConsistencyCheck(state: PrototypeState): PrototypeState {
  let s: PrototypeState = { ...state, consistencyRun: state.sourceRevision };
  const open = consistencyReport(s).open.filter((c) => c.needs === "customer");
  const why = new Map<string, string>();
  for (const c of open) for (const id of c.factIds) why.set(id, c.topicLabel);
  s = {
    ...s,
    facts: s.facts.map((f) =>
      why.has(f.id) &&
      f.lifecycle !== "Needs clarification" &&
      f.lifecycle !== "Not received"
        ? {
            ...f,
            lifecycle: "Needs clarification" as const,
            approval: "Not reviewed" as const,
            note: `Sources disagree: ${why.get(f.id)}.`,
            rev: f.rev + 1,
          }
        : f,
    ),
  };
  return ensureQuestions(s);
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
  recipient: string,
  questionIds: string[],
): PrototypeState {
  const ids = questionIds.filter((id) => {
    const q = state.questions.find((item) => item.id === id);
    return q && q.recipient === recipient && q.status === "Ready to send";
  });
  if (!ids.length) return state;
  return {
    ...state,
    requests: [
      ...state.requests,
      { id: `req-${state.requests.length + 1}`, recipient, questionIds: ids },
    ],
    questions: state.questions.map((q) =>
      ids.includes(q.id) ? { ...q, status: "Sent" as const } : q,
    ),
  };
}
export function sentQuestionIds(state: PrototypeState, recipient?: string) {
  return state.requests
    .filter((r) => !recipient || r.recipient === recipient)
    .flatMap((r) => r.questionIds);
}
/** Contacts with at least one question assigned. */
export const recipientsInUse = (state: PrototypeState) => [
  ...new Set(state.questions.map((q) => q.recipient)),
];

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
            lifecycle:
              f.lifecycle === "Not received"
                ? f.lifecycle
                : ("Needs clarification" as const),
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
            lifecycle:
              f.lifecycle === "Needs clarification"
                ? ("Extracted" as const)
                : f.lifecycle,
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
  return {
    ...state,
    facts: state.facts.map((x) =>
      x.id === id ? { ...x, approval: "Specialist reviewed" as const } : x,
    ),
  };
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

// ---------------------------------------------------------------------------------------------
// The agent: a draft built from configured facts, and published versions (draft, then locked)
// ---------------------------------------------------------------------------------------------

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

export const topicsCovered = (c: Client) =>
  topics.every((t) => c.contacts.some((p) => p.decides.includes(t.id)));

export function currentStep(state: PrototypeState) {
  const steps = onboardingSteps(state);
  return steps.find((s) => s.status === "Current") ?? steps[steps.length - 1];
}

export function needsFromCustomer(
  state: PrototypeState,
  recipient?: string,
): string[] {
  return state.questions
    .filter(
      (q) =>
        (!recipient || q.recipient === recipient) &&
        sentQuestionIds(state).includes(q.id) &&
        (q.status === "Sent" || q.status === "Response received") &&
        q.revisions.length === q.reviewedRevision,
    )
    .map((q) => `Answer: ${q.title}`);
}

// ---------------------------------------------------------------------------------------------
// Assignments: every open item has a person, on the customer side or on ours
// ---------------------------------------------------------------------------------------------

export type Assignment = {
  id: string;
  title: string;
  detail: string;
  side: "customer" | "team";
  assignee: string;
  role: string;
  due: string;
  stage: 1 | 2 | 3 | 4 | 5;
};

export function assignments(state: PrototypeState): Assignment[] {
  const out: Assignment[] = [];
  if (!state.client) return out;
  const roleOf = (name: string) => contactByName(state, name)?.role ?? "";
  if (state.docsRequested)
    for (const d of documentRequests) {
      const src = sourceCatalog.find((s) => s.id === d.sourceId)!;
      if (src.origin === "team") continue;
      // Anything already uploaded is not waiting on the customer. An unreadable scan is our action
      // first (request a copy); it becomes the customer's only once we have asked.
      if (state.addedSources.includes(d.sourceId)) continue;
      const who = contactFor(state, src.topic)?.name ?? "";
      out.push({
        id: `doc-${d.sourceId}`,
        title: `Send: ${d.label}`,
        detail: `Requested for ${d.area}`,
        side: "customer",
        assignee: who,
        role: roleOf(who),
        due: "Due Oct 25",
        stage: 2,
      });
    }
  if (
    state.copyRequested &&
    !factById(state, "F4")?.waived &&
    state.addedSources.includes("scan")
  ) {
    const who = contactFor(state, "documents")?.name ?? "";
    out.push({
      id: "doc-scan-copy",
      title: "Send a readable copy: Move-in checklist",
      detail: "Requested again as a text file",
      side: "customer",
      assignee: who,
      role: roleOf(who),
      due: "Due Nov 2",
      stage: 2,
    });
  }
  for (const q of state.questions) {
    if (
      (q.status === "Sent" || q.status === "Response received") &&
      q.revisions.length === q.reviewedRevision
    )
      out.push({
        id: `q-${q.id}`,
        title: `Answer: ${q.title}`,
        detail: questionCritical(state, q)
          ? "Blocks launch"
          : "Non-critical, can default",
        side: "customer",
        assignee: q.recipient,
        role: roleOf(q.recipient),
        due: "Reply within 3 business days",
        stage: 3,
      });
  }
  for (const a of nextActions(state))
    out.push({
      id: `team-${a.id}`,
      title: a.title,
      detail: a.subtitle,
      side: "team",
      assignee: state.client.owner,
      role: "Onboarding specialist",
      due: a.due,
      stage: a.target.stage ?? 3,
    });
  return out;
}

/** Clarification is finished apart from the review itself. */
export function reviewReady(state: PrototypeState): boolean {
  if (!state.client) return false;
  return onboardingSteps(state)[2].pieces.every(
    (p) => p.done || p.label === "Reviewed by a second team member",
  );
}

// ---------------------------------------------------------------------------------------------
// Next actions (the team's queue)
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Team roles and rules (customer side): who handles what, when, with which fallback
// ---------------------------------------------------------------------------------------------

export type RoutingRow = {
  scenario: string;
  who: string;
  when: string;
  fallback: string;
  source: string;
  status: "Known" | "Disputed" | "Not received";
};

/** The customer's roles and routing rules, derived from the facts received so far. */
export function routingTable(state: PrototypeState): RoutingRow[] {
  const f = (id: string) => factById(state, id)!;
  const known = (id: string) =>
    f(id).value !== null && coverageOf(f(id)) !== "empty";
  const disputed = coverageOf(f("T2")) === "clarifying";
  return [
    {
      scenario: "Office-hours calls",
      who: known("T1") ? "Leasing desk" : "—",
      when: known("F1") ? "Mon–Fri, 9 a.m.–5 p.m." : "—",
      fallback: known("F1") ? "Take a message; return next business day" : "—",
      source: known("F1") ? f("F1").anchor : "Not received",
      status: known("F1") ? "Known" : "Not received",
    },
    {
      scenario: "After-hours emergency (weekend)",
      who: known("T2")
        ? disputed
          ? "On-call supervisor OR front desk (sources disagree)"
          : (shownValue(f("T2")) ?? "")
        : "—",
      when: known("T4")
        ? "Weekend schedule kept in the customer's scheduling system"
        : "—",
      fallback: known("T3")
        ? "Property manager, then take a callback number"
        : "—",
      source: known("T2") ? f("T2").anchor : "Not received",
      status: !known("T2") ? "Not received" : disputed ? "Disputed" : "Known",
    },
    {
      scenario: "Locked out of unit",
      who: known("S3") ? "On-call maintenance supervisor" : "—",
      when: "After hours",
      fallback: known("S3") ? "Property manager" : "—",
      source: known("S3") ? f("S3").anchor : "Not received",
      status: known("S3") ? "Known" : "Not received",
    },
    {
      scenario: "Unsupported question",
      who: "Agent",
      when: "Any time",
      fallback:
        "Take a callback number; team returns the call next business day",
      source: f("S4").anchor,
      status: "Known",
    },
  ];
}

export function slackUpdate(state: PrototypeState): string {
  const step = currentStep(state);
  const cov = coverage(state);
  const needed = needsFromCustomer(state);
  return [
    `*${state.client?.name ?? "Client"}* — stage ${step.n}/5 (${step.name})`,
    `Coverage: ${cov.known}/${cov.total} known · ${cov.confirmed} confirmed · ${cov.empty} not received`,
    needed.length
      ? `Waiting on customer: ${needed.join("; ")}`
      : "Waiting on customer: nothing",
    `Next: ${nextActions(state)[0]?.title ?? "launch checklist"}`,
  ].join("\n");
}

export const stamp = (clock: number) => {
  const total = 9 * 60 + clock * 3;
  const h = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `Oct 29 · ${h}:${m}`;
};

// ---------------------------------------------------------------------------------------------
// Second-person review
// ---------------------------------------------------------------------------------------------

/** What the reviewer is signing off on. Any change to a fact makes an earlier approval stale. */
export const factsSignature = (state: PrototypeState) =>
  state.facts
    .map(
      (f) =>
        `${f.id}:${f.approval}:${f.rev}:${f.waived ? "w" : ""}:${shownValue(f) ?? ""}`,
    )
    .join("|");
export const reviewApproved = (state: PrototypeState) =>
  state.review?.status === "Approved" &&
  state.review.reviewer !== state.client?.owner &&
  state.review.sig === factsSignature(state);
export const reviewStale = (state: PrototypeState) =>
  state.review?.status === "Approved" &&
  (state.review.reviewer === state.client?.owner ||
    state.review.sig !== factsSignature(state));
export const reviewRequestStale = (state: PrototypeState) =>
  state.review?.status === "Requested" &&
  (state.review.reviewer === state.client?.owner ||
    state.review.requestedBy !== state.client?.owner ||
    state.review.sig !== factsSignature(state));

// ---------------------------------------------------------------------------------------------
// Setup and go-live: the work that happens in the customer's agent platform. The prototype does not
// do it; it tracks it as tasks the specialist ticks off, once clarification is complete.
// ---------------------------------------------------------------------------------------------

export const setupItems = [
  {
    id: "configure",
    phase: 4,
    label: "Configure the agent in the platform from the confirmed details",
  },
  { id: "phone", phase: 4, label: "Phone number selected and routing set" },
  { id: "sms", phase: 4, label: "SMS registration (10DLC) submitted" },
  { id: "pms", phase: 4, label: "Property-system integration connected" },
  { id: "slack", phase: 4, label: "Slack channel for call logs connected" },
  {
    id: "voice",
    phase: 4,
    label: "Voice and language settings confirmed (English and Spanish)",
  },
  { id: "fair", phase: 4, label: "Fair Housing guardrails reviewed" },
  {
    id: "tests",
    phase: 4,
    label: "Run the test scenarios in the platform and record the results",
  },
  { id: "gate", phase: 5, label: "Pass the launch checklist" },
  { id: "live", phase: 5, label: "Go live" },
  {
    id: "checkins",
    phase: 5,
    label: "Hold weekly check-ins for the first four weeks",
  },
] as const;

export const setupDone = (state: PrototypeState, phase: 4 | 5) =>
  setupItems.filter((i) => i.phase === phase).every((i) => state.setup[i.id]);

/** Setup unlocks once clarification is done; go-live tasks unlock once setup is done. */
export function setupUnlocked(state: PrototypeState, phase: 4 | 5): boolean {
  const steps = onboardingSteps(state);
  return phase === 4 ? steps[2].status === "Done" : steps[3].status === "Done";
}

export function toggleSetup(state: PrototypeState, id: string): PrototypeState {
  const item = setupItems.find((i) => i.id === id);
  if (!item || !setupUnlocked(state, item.phase)) return state;
  return { ...state, setup: { ...state.setup, [id]: !state.setup[id] } };
}

/** The intake checks that must be clear before setup starts. */
export function setupReadiness(state: PrototypeState) {
  const status = readiness(state);
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
  return [
    item(
      "preparation",
      "Conflicts resolved and critical details confirmed",
      status.ready,
      status.ready ? "Nothing open." : `${status.blockers.length} open.`,
    ),
    item(
      "coverage",
      "Every required detail has a value or a waiver",
      emptyOpen.length === 0,
      emptyOpen.length ? `${emptyOpen.length} empty.` : "All covered.",
    ),
    item(
      "reviewed",
      "Every detail reviewed",
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
      "second-review",
      "Reviewed by a second team member",
      reviewApproved(state),
      reviewStale(state) || reviewRequestStale(state)
        ? "Details or ownership changed since the review."
        : state.review?.status === "Requested"
          ? `Waiting for ${state.review.reviewer}.`
          : state.review?.status === "Changes requested"
            ? `${state.review.reviewer} asked for changes.`
            : reviewApproved(state)
              ? `Approved by ${state.review?.reviewer}.`
              : "Not requested yet.",
    ),
  ];
}

// ---------------------------------------------------------------------------------------------
// Steps with checklists, derived from the data
// ---------------------------------------------------------------------------------------------

export function onboardingSteps(state: PrototypeState): Step[] {
  const report = consistencyReport(state);
  const prep = readiness(state);
  const sources = allSources(state);
  const gapHandled = (x: Fact) =>
    coverageOf(x) !== "empty" ||
    state.questions.some(
      (q) => q.factIds.includes(x.id) && SENT.includes(q.status),
    ) ||
    (x.id === "F4" && state.copyRequested);
  const lateReviewed = sources
    .filter((s) => s.later && needsReview(s))
    .every((s) => state.reviewedSources.includes(s.id));
  const defs: { name: string; pieces: Piece[] }[] = [
    {
      name: "Kickoff and client details",
      pieces: [
        { label: "Client details captured", done: Boolean(state.client) },
        {
          label: "Customer contacts cover every topic",
          done: state.client ? topicsCovered(state.client) : false,
        },
        { label: "Document request sent", done: state.docsRequested },
      ],
    },
    {
      name: "Collect information",
      pieces: [
        {
          label: "Every requested document uploaded or flagged",
          done: documentRequests.every((d) =>
            state.addedSources.includes(d.sourceId),
          ),
        },
        {
          label: "Extraction reviewed against each document",
          done:
            sources
              .filter((s) => !s.later && needsReview(s))
              .every((s) => state.reviewedSources.includes(s.id)) &&
            sources.some(needsReview),
        },
        {
          label: "Every area has a source-backed fact",
          done: areas.every((a) =>
            state.facts.some(
              (x) => x.area === a && x.sourceId && x.value !== null,
            ),
          ),
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
          label: "Contradiction check is current",
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
        { label: "Late documents reviewed", done: lateReviewed },
        {
          label: "Reviewed by a second team member",
          done: reviewApproved(state),
        },
      ],
    },
    {
      name: "Set up and test",
      pieces: setupItems
        .filter((i) => i.phase === 4)
        .map((i) => ({ label: i.label, done: Boolean(state.setup[i.id]) })),
    },
    {
      name: "Go live and tune",
      pieces: setupItems
        .filter((i) => i.phase === 5)
        .map((i) => ({ label: i.label, done: Boolean(state.setup[i.id]) })),
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
          ? `Starts when stage ${i} is complete.`
          : status === "Done"
            ? "All pieces complete."
            : `${complete} of ${d.pieces.length} pieces done.`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Next actions (the team's queue)
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
  target: { stage?: 1 | 2 | 3 | 4 | 5 };
};

export function nextActions(state: PrototypeState): NextAction[] {
  const actions: NextAction[] = [];
  if (!state.client) return actions;
  const report = consistencyReport(state);
  const a = (x: Omit<NextAction, "owner">) =>
    actions.push({ ...x, owner: state.client!.owner });
  const sources = allSources(state);
  if (!state.docsRequested)
    a({
      id: "request-docs",
      tone: "orange",
      icon: "✉",
      title: "Send the document request to the customer",
      subtitle: "Each document goes to the contact who owns it",
      due: "Today",
      button: "Open",
      target: { stage: 1 },
    });
  const missing = documentRequests.filter(
    (d) => !state.addedSources.includes(d.sourceId),
  );
  if (state.docsRequested && missing.length)
    a({
      id: "upload",
      tone: "orange",
      icon: "⬆",
      title: `Upload the ${missing.length} document${missing.length === 1 ? "" : "s"} received so far`,
      subtitle: "Each upload is read into the spec with citations",
      due: "As they arrive",
      button: "Open",
      target: { stage: 2 },
    });
  const unreviewed = sources.filter(
    (s) => needsReview(s) && !state.reviewedSources.includes(s.id),
  );
  if (unreviewed.length)
    a({
      id: "review-sources",
      tone: "blue",
      icon: "◇",
      title: `Check the extraction for ${unreviewed.length} document${unreviewed.length === 1 ? "" : "s"}`,
      subtitle: "Confirm what was read matches the document",
      due: "Before the contradiction check",
      button: "Review",
      target: { stage: 2 },
    });
  if (state.addedSources.length && (!report.ran || report.stale))
    a({
      id: "run-check",
      tone: "orange",
      icon: "◈",
      title: report.stale
        ? "Run the contradiction check again"
        : "Run the contradiction check",
      subtitle: report.stale
        ? "A new source arrived after the last check"
        : "Sources and draft prompts have not been compared",
      due: "Before asking the customer",
      button: "Open",
      target: { stage: 3 },
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
      target: { stage: 3 },
    });
  for (const q of state.questions.filter(
    (x) => x.revisions.length > x.reviewedRevision,
  ))
    a({
      id: `review-${q.id}`,
      tone: "orange",
      icon: "↺",
      title: `Review the reply: ${q.title}`,
      subtitle: `${q.recipient} replied; a specialist must approve it`,
      due: "New reply",
      button: "Review",
      target: { stage: 3 },
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
      button: "Open",
      target: { stage: 3 },
    });
  for (const name of recipientsInUse(state)) {
    const ready = state.questions.filter(
      (q) => q.recipient === name && q.status === "Ready to send",
    );
    if (ready.length)
      a({
        id: `send-${name}`,
        tone: "blue",
        icon: "↗",
        title: `Send ${ready.length} approved question${ready.length === 1 ? "" : "s"} to ${name}`,
        subtitle: contactByName(state, name)?.role ?? "",
        due: "Ready",
        button: "Send",
        target: { stage: 3 },
      });
  }
  const gaps = state.facts.filter(
    (f) =>
      coverageOf(f) === "empty" &&
      !state.questions.some(
        (q) => q.factIds.includes(f.id) && SENT.includes(q.status),
      ) &&
      !(f.id === "F4" && state.copyRequested) &&
      state.addedSources.length > 0,
  );
  for (const g of gaps)
    a({
      id: `gap-${g.id}`,
      tone: "green",
      icon: "▤",
      title: `Close the gap: ${g.label}`,
      subtitle: g.note ?? "Required fact has no value",
      due: "Nov 2",
      button: "Open",
      target: { stage: 3 },
    });
  if (reviewReady(state) && !reviewApproved(state)) {
    if (state.review?.status === "Requested" && !reviewRequestStale(state))
      actions.push({
        id: "review-details",
        tone: "orange",
        icon: "◉",
        title: `Review the approved details for ${state.client.name}`,
        subtitle: `Requested by ${state.review.requestedBy}. Second pair of eyes before setup.`,
        due: "Before setup",
        button: "Review",
        target: { stage: 3 },
        owner: state.review.reviewer,
      });
    else
      a({
        id: "request-review",
        tone: "orange",
        icon: "◉",
        title:
          state.review?.status === "Changes requested"
            ? `Address ${state.review.reviewer}’s changes and ask for another review`
            : "Ask a teammate to review the approved details",
        subtitle:
          reviewStale(state) || reviewRequestStale(state)
            ? "Details or ownership changed after the last review"
            : "Setup starts once someone else has signed off",
        due: "Before setup",
        button: "Open",
        target: { stage: 3 },
      });
  }
  if (setupUnlocked(state, 4) && !setupDone(state, 4)) {
    const left = setupItems.filter(
      (i) => i.phase === 4 && !state.setup[i.id],
    ).length;
    a({
      id: "setup",
      tone: "orange",
      icon: "☑",
      title: `Complete ${left} setup task${left === 1 ? "" : "s"} in the platform`,
      subtitle: "Configure, connect, then test before going live",
      due: "Before launch",
      button: "Open",
      target: { stage: 4 },
    });
  } else if (setupUnlocked(state, 5) && !setupDone(state, 5)) {
    const left = setupItems.filter(
      (i) => i.phase === 5 && !state.setup[i.id],
    ).length;
    a({
      id: "golive",
      tone: "orange",
      icon: "▶",
      title: `Finish ${left} go-live task${left === 1 ? "" : "s"}`,
      subtitle: "Pass the launch checklist, go live, schedule check-ins",
      due: "Go-live",
      button: "Open",
      target: { stage: 5 },
    });
  }
  return actions;
}

export function weeklyCheckIn(state: PrototypeState): string {
  const step = currentStep(state);
  const report = consistencyReport(state);
  const cov = coverage(state);
  const needed = needsFromCustomer(state);
  const working = nextActions(state)
    .slice(0, 3)
    .map((a) => a.title);
  const status = readiness(state);
  const risks = [...status.blockers, ...status.risks];
  return [
    `# Weekly check-in · ${state.client?.name ?? "Client"} (fictional)`,
    "",
    `Progress: stage ${step.n} of 5, ${step.name}. ${step.detail}`,
    `Coverage: ${cov.known} of ${cov.total} required details known, ${cov.confirmed} confirmed by you, ${cov.clarifying} awaiting clarification, ${cov.empty} not received.`,
    "",
    "## Needed from you",
    ...(needed.length ? needed.map((n) => `- ${n}`) : ["- Nothing right now."]),
    "",
    "## We are working on",
    ...(working.length
      ? working.map((w) => `- ${w}`)
      : ["- Preparing for go-live."]),
    "",
    "## Risks",
    ...(risks.length ? risks.map((r) => `- ${r}`) : ["- None open."]),
    "",
    report.ran
      ? `Contradiction check: ${report.conflicts.length} conflicts found, ${report.conflicts.filter((c) => c.resolved).length} resolved.`
      : "Contradiction check not yet run.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Process log and export
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Team: members, invitations and who owns an onboarding
// ---------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Simulated invitation: the person appears as "Invited" until they would accept. */
export function inviteMember(
  state: PrototypeState,
  email: string,
  role: TeamRole,
): PrototypeState {
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean) || !teamRoles.some((r) => r.role === role))
    return state;
  if (state.team.some((m) => m.email.toLowerCase() === clean)) return state;
  const base = clean.split("@")[0].replace(/[._-]+/g, " ");
  const name = base.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ...state,
    team: [
      ...state.team,
      {
        id: `t-${state.team.length + 1}-${clean}`,
        name,
        email: clean,
        role,
        status: "Invited",
      },
    ],
  };
}

export function cancelInvite(
  state: PrototypeState,
  id: string,
): PrototypeState {
  const m = state.team.find((x) => x.id === id);
  if (!m || m.status !== "Invited") return state;
  return { ...state, team: state.team.filter((x) => x.id !== id) };
}

/** Anyone who has accepted can own an onboarding. */
export const owners = (state: PrototypeState) =>
  state.team.filter((m) => m.status === "Active");

export function setOwner(state: PrototypeState, name: string): PrototypeState {
  if (
    !state.client ||
    state.client.owner === name ||
    !owners(state).some((m) => m.name === name)
  )
    return state;
  return { ...state, client: { ...state.client, owner: name } };
}

/** Onboardings a member owns: the live one if they own it, plus the illustrative dashboard rows. */
export function ownedBy(
  state: PrototypeState,
  member: TeamMember,
): { name: string; live: boolean }[] {
  const out: { name: string; live: boolean }[] = [];
  if (state.client && state.client.owner === member.name)
    out.push({ name: state.client.name, live: true });
  for (const c of member.illustrativeClients ?? [])
    out.push({ name: c, live: false });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Customer team: contacts can be added after the onboarding starts
// ---------------------------------------------------------------------------------------------

export const contactRoleSuggestions = [
  "Operations lead",
  "Property manager",
  "Leasing coordinator",
  "Maintenance supervisor",
  "Owner or principal",
];

export type ContactCheck =
  { ok: true; contact: Contact } | { ok: false; error: string };

/** Validate a new customer contact against the people already on the team. */
export function checkContact(
  existing: Contact[],
  draft: { name: string; role: string; email: string; decides: Topic[] },
): ContactCheck {
  const name = draft.name.trim();
  const email = draft.email.trim();
  if (!name) return { ok: false, error: "Enter the person's name." };
  if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase()))
    return { ok: false, error: `${name} is already on the customer team.` };
  if (email && !EMAIL.test(email))
    return {
      ok: false,
      error: "Enter a valid email address, or leave it blank.",
    };
  return {
    ok: true,
    contact: {
      name,
      role: draft.role.trim() || "Contact",
      email,
      decides: [...draft.decides],
    },
  };
}

export function addContact(
  state: PrototypeState,
  draft: { name: string; role: string; email: string; decides: Topic[] },
): PrototypeState {
  if (!state.client) return state;
  const check = checkContact(state.client.contacts, draft);
  if (!check.ok) return state;
  return {
    ...state,
    client: {
      ...state.client,
      contacts: [...state.client.contacts, check.contact],
    },
  };
}
