// Fictional client profile and the kickoff plan derived from the intake spec.
// Everything here is simulated, fictional data. No real company, person or address.

import { areas, coverageOf, type Area, type PrototypeState } from "./state.ts";

export const client = {
  name: "Oakwood Property Group",
  vertical: "Residential property management",
  scope: "2 properties · 310 units",
  plan: "Inbound resident assistant (voice)",
  owner: "Avery Morgan",
  kickoff: "Oct 22, 2026",
  goLive: "Nov 20, 2026",
  hours: "Leasing desk Mon–Fri, 9 a.m.–5 p.m.",
  channels: ["Inbound voice"],
  systems: ["Property management system (PMS)", "External scheduling system"],
  properties: [
    { name: "Maple Grove", units: 180 },
    { name: "Willow Court", units: 130 },
  ],
  contacts: [
    {
      name: "Maya Chen",
      role: "Operations lead",
      decides: "Routing, escalation, integrations",
      email: "maya.chen@oakwood.example",
    },
    {
      name: "Priya Shah",
      role: "Property manager",
      decides: "Property policies and exceptions",
      email: "priya.shah@oakwood.example",
    },
    {
      name: "Jordan Lee",
      role: "Leasing coordinator",
      decides: "Documents and rosters",
      email: "jordan.lee@oakwood.example",
    },
  ],
};

/** The kickoff call agenda: every required fact becomes a question, marked when already answered. */
export function kickoffAgenda(state: PrototypeState) {
  return areas.map((area: Area) => ({
    area,
    items: state.facts
      .filter((f) => f.area === area)
      .map((f) => ({
        id: f.id,
        label: f.label,
        covered: coverageOf(f) !== "empty",
      })),
  }));
}

export type DocumentStatus = "Received" | "Needs a readable copy" | "Missing";
export const documentRequests: {
  area: Area;
  label: string;
  sourceId: string | null;
}[] = [
  { area: "Goals", label: "Kickoff call recording", sourceId: "transcript" },
  {
    area: "Team & rules",
    label: "Escalation contacts spreadsheet",
    sourceId: "roster",
  },
  { area: "Team & rules", label: "Operations handbook", sourceId: "sop" },
  { area: "FAQs", label: "Resident FAQ or website link", sourceId: "faq" },
  { area: "FAQs", label: "Move-in checklist", sourceId: "scan" },
  {
    area: "Scenarios",
    label: "Call-handling examples or SOPs",
    sourceId: "sop",
  },
  {
    area: "Integrations",
    label: "Property-system owner and access contact",
    sourceId: null,
  },
];

export function documentStatus(
  state: PrototypeState,
  sourceId: string | null,
  sources: { id: string; parse: string }[],
): DocumentStatus {
  if (!sourceId) return "Missing";
  const s = sources.find((x) => x.id === sourceId);
  if (!s) return "Missing";
  return s.parse === "Parsed" ? "Received" : "Needs a readable copy";
}
