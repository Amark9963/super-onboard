// Derived views of the client onboarding: the kickoff agenda and the document request rows.
// Everything here is simulated, fictional data.

import {
  areas,
  contactFor,
  coverageOf,
  documentRequests,
  sourceCatalog,
  type Area,
  type PrototypeState,
  type Source,
} from "./state.ts";

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

export type DocStatus = "Not received" | "Received" | "Needs a readable copy";
export type DocRow = {
  sourceId: string;
  label: string;
  area: Area;
  source: Source;
  status: DocStatus;
  /** Who owns getting this document to us. Team-owned documents belong to our own team. */
  assignee: string;
  role: string;
  side: "customer" | "team";
};

export function documentRows(state: PrototypeState): DocRow[] {
  return documentRequests.map((d) => {
    const source = sourceCatalog.find((s) => s.id === d.sourceId)!;
    const got = state.addedSources.includes(d.sourceId);
    const status: DocStatus = !got
      ? "Not received"
      : source.parse === "Parsed"
        ? "Received"
        : "Needs a readable copy";
    const person =
      source.origin === "team" ? undefined : contactFor(state, source.topic);
    return {
      ...d,
      source,
      status,
      assignee: person?.name ?? state.client?.owner ?? "",
      role: person?.role ?? "Onboarding specialist",
      side: source.origin === "team" ? "team" : "customer",
    };
  });
}
