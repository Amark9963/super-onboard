// Derives an activity feed (who did what) by comparing the state before and after an action.
// Pure and deterministic. The shell wraps every update with diffActivity, so no action needs to
// know about logging.

import { targetLabel } from "./collab.ts";
import {
  consistencyReport,
  contactByName,
  factById,
  setupItems,
  sourceCatalog,
  stamp,
  type ActivityEvent,
  type PrototypeState,
} from "./state.ts";

type Actor = ActivityEvent["actor"];

export function diffActivity(
  prev: PrototypeState,
  next: PrototypeState,
): PrototypeState {
  if (prev === next || !next.client) return next;
  const owner: Actor = { name: next.client.owner, side: "team" };
  const system: Actor = { name: "System", side: "system" };
  const customer = (name: string): Actor => ({ name, side: "customer" });
  const out: { actor: Actor; text: string; kind: string }[] = [];
  const add = (actor: Actor, text: string, kind: string) =>
    out.push({ actor, text, kind });

  if (!prev.client)
    add(owner, `Created the onboarding for ${next.client.name}`, "created");
  if (prev.client && prev.client.owner !== next.client.owner)
    add(
      { name: next.client.owner, side: "team" },
      `Took over the onboarding from ${prev.client.owner}`,
      "owner",
    );
  if (
    prev.client &&
    next.client.contacts.length > prev.client.contacts.length
  ) {
    const known = new Set(prev.client.contacts.map((c) => c.name));
    for (const c of next.client.contacts.filter((x) => !known.has(x.name)))
      add(owner, `Added ${c.name} (${c.role}) to the customer team`, "contact");
  }
  if (!prev.docsRequested && next.docsRequested)
    add(
      owner,
      `Sent the document request to ${next.client.contacts.length} contacts`,
      "request",
    );

  for (const id of next.addedSources.filter(
    (x) => !prev.addedSources.includes(x),
  )) {
    const src = sourceCatalog.find((s) => s.id === id)!;
    const who = src.suppliedBy.startsWith("Public")
      ? { name: "Oakwood website", side: "system" as const }
      : src.origin === "customer"
        ? customer(src.suppliedBy)
        : owner;
    const detail =
      src.fills.length > 0
        ? `${src.fills.length} setup detail${src.fills.length === 1 ? "" : "s"} read`
        : src.parse === "Needs attention"
          ? "no readable text"
          : "nothing to extract";
    add(who, `Uploaded “${src.title}” (${detail})`, "upload");
  }
  for (const id of next.reviewedSources.filter(
    (x) => !prev.reviewedSources.includes(x),
  ))
    add(
      owner,
      `Checked the extraction for “${sourceCatalog.find((s) => s.id === id)!.title}”`,
      "review",
    );

  if (
    next.consistencyRun !== prev.consistencyRun &&
    next.consistencyRun !== null
  ) {
    const r = consistencyReport(next);
    add(
      system,
      `Contradiction check: ${r.conflicts.length} conflict${r.conflicts.length === 1 ? "" : "s"} found, ${r.open.length} open`,
      "check",
    );
  }
  for (const q of next.questions.filter(
    (x) => !prev.questions.some((p) => p.id === x.id),
  ))
    add(system, `Drafted a question for ${q.recipient}: ${q.title}`, "draft");

  for (const q of next.questions) {
    const p = prev.questions.find((x) => x.id === q.id);
    if (!p) continue;
    if (p.status !== "Ready to send" && q.status === "Ready to send")
      add(owner, `Approved the wording: ${q.title}`, "approve-wording");
    if (q.revisions.length > p.revisions.length)
      add(customer(q.recipient), `Answered: ${q.title}`, "answer");
    if (p.status !== "Resolved" && q.status === "Resolved")
      add(owner, `Approved ${q.recipient}'s answer: ${q.title}`, "approve");
    if (p.status !== "Defaulted" && q.status === "Defaulted")
      add(
        system,
        `No reply in time, proceeding on the default: ${q.title}`,
        "default",
      );
  }
  for (const r of next.requests.filter(
    (x) => !prev.requests.some((p) => p.id === x.id),
  ))
    add(
      owner,
      `Sent ${r.questionIds.length} question${r.questionIds.length === 1 ? "" : "s"} to ${r.recipient}`,
      "send",
    );

  for (const key of Object.keys(next.resolutions))
    if (next.resolutions[key].how === "internal fix" && !prev.resolutions[key])
      add(
        owner,
        `Fixed conflicting instructions: ${key.replace(/-/g, " ")}`,
        "fix",
      );

  for (const f of next.facts) {
    const p = factById(prev, f.id);
    if (f.waived && !p?.waived)
      add(owner, `Waived “${f.label}”: ${f.waived.reason}`, "waive");
  }
  if (!prev.copyRequested && next.copyRequested) {
    const c = contactByName(next, "Jordan Lee") ?? next.client.contacts[0];
    add(
      owner,
      `Asked ${c.name} for a readable copy of the move-in checklist`,
      "copy",
    );
  }
  for (const item of setupItems)
    if (next.setup[item.id] && !prev.setup[item.id])
      add(owner, `Completed: ${item.label}`, "setup");

  for (const n of next.notes.filter(
    (x) => !prev.notes.some((p) => p.id === x.id),
  )) {
    const where = targetLabel(next, n.target).label;
    const quoted = n.text.length > 80 ? `${n.text.slice(0, 77)}…` : n.text;
    add(
      { name: n.author, side: "team" },
      `left an internal note on “${where}”: “${quoted}”${n.mentions.length ? ` (mentioned ${n.mentions.join(", ")})` : ""}`,
      "note",
    );
  }
  const pr = prev.review;
  const nr = next.review;
  if (nr && (!pr || pr.status !== nr.status || pr.round !== nr.round)) {
    if (nr.status === "Requested")
      add(
        { name: nr.requestedBy, side: "team" },
        `asked ${nr.reviewer} to review the approved details (round ${nr.round})`,
        "review-request",
      );
    else if (nr.status === "Approved")
      add(
        { name: nr.reviewer, side: "team" },
        "approved the details after review",
        "review-decision",
      );
    else
      add(
        { name: nr.reviewer, side: "team" },
        `asked for changes: ${nr.reason}`,
        "review-decision",
      );
  }

  if (!out.length) return next;
  const activity = [...next.activity];
  let clock = next.clock;
  for (const e of out) {
    clock++;
    activity.push({
      id: activity.length + 1,
      at: stamp(clock),
      actor: e.actor,
      text: e.text,
      kind: e.kind,
    });
  }
  return { ...next, activity, clock };
}
