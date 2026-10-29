import test from "node:test";
import assert from "node:assert/strict";
import {
  addSource,
  applyDefault,
  consistencyReport,
  coverage,
  currentStep,
  exportCsv,
  initialState,
  launchChecklist,
  markConfigured,
  nextActions,
  onboardingSteps,
  processCounts,
  readiness,
  recordTest,
  reopenQuestion,
  resolveInternally,
  reviewAnswer,
  reviewFact,
  runConsistencyCheck,
  sendRequest,
  submitAnswer,
  testCases,
  testStatus,
  updateQuestion,
  waiveFact,
  weeklyCheckIn,
  convertIssue,
} from "../app/prototype/state.ts";
import {
  documentRequests,
  documentStatus,
  kickoffAgenda,
} from "../app/prototype/client.ts";
import { allSources } from "../app/prototype/state.ts";

const approveAll = (s) => {
  for (const q of s.questions)
    s = updateQuestion(s, q.id, { status: "Ready to send" });
  return s;
};
const sendAll = (s) => {
  s = approveAll(s);
  s = sendRequest(s, "Operations lead", ["q-emergency", "q-integration"]);
  return sendRequest(s, "Property manager", ["q-pets"]);
};
const answer = (s, id, text) =>
  reviewAnswer(submitAnswer(s, id, text, "answer"), id);

/** Everything resolved except testing. */
function prepared() {
  let s = runConsistencyCheck(sendAll(initialState));
  s = resolveInternally(
    s,
    "emergency-transfer",
    "c-draft-transfer",
    "Customer wants a transfer when possible",
  );
  s = answer(s, "q-emergency", "On-call supervisor first");
  s = answer(s, "q-integration", "Maya authorizes read-only lookups");
  s = answer(
    s,
    "q-pets",
    "Per property: two cats at Maple Grove, one cat at Willow Court",
  );
  s = waiveFact(s, "G2", "x"); // G2 is not critical
  s = waiveFact(s, "F4", "Customer will supply a text copy later");
  s = waiveFact(s, "S3", "Not in scope for launch");
  for (const f of s.facts) s = reviewFact(s, f.id);
  return s;
}

test("the spec starts at 13 known, 3 awaiting clarification, 4 empty, 3 confirmed", () => {
  const c = coverage(initialState);
  assert.deepEqual(
    [c.total, c.known, c.clarifying, c.empty, c.confirmed],
    [20, 13, 3, 4, 3],
  );
});

test("steps are derived: step 3 is current and has real checklist pieces", () => {
  const steps = onboardingSteps(initialState);
  assert.equal(currentStep(initialState).n, 3);
  assert.deepEqual(
    steps.map((x) => x.status),
    ["Done", "Done", "Current", "Upcoming", "Upcoming"],
  );
  assert.equal(steps[2].pieces.length, 4);
  assert.equal(steps[2].pieces.filter((p) => p.done).length, 0);
  assert.equal(nextActions(initialState)[0].id, "run-check");
});

test("consistency check finds source and draft conflicts, not scope variations", () => {
  const r = consistencyReport(runConsistencyCheck(initialState));
  assert.deepEqual(r.conflicts.map((c) => c.id).sort(), [
    "emergency-transfer",
    "weekend-flood-route",
  ]);
  assert.equal(
    r.conflicts.find((c) => c.id === "emergency-transfer").needs,
    "internal",
  );
  assert.deepEqual(
    r.variations.map((v) => v.id),
    ["pet-limit"],
  );
  assert.ok(readiness(initialState).blockers[0].includes("consistency check"));
});

test("a late source fills gaps, makes the check stale and turns pets into a real conflict", () => {
  const checked = runConsistencyCheck(initialState);
  assert.equal(consistencyReport(checked).stale, false);
  const late = addSource(checked);
  assert.equal(addSource(late), late, "adding twice is a no-op");
  const g2 = late.facts.find((f) => f.id === "G2");
  assert.match(g2.value, /90%/);
  assert.equal(g2.lifecycle, "Extracted");
  assert.equal(coverage(late).empty, 2);
  assert.equal(consistencyReport(late).stale, true);
  assert.ok(readiness(late).blockers.some((b) => b.includes("run it again")));
  const rerun = consistencyReport(runConsistencyCheck(late));
  assert.equal(rerun.stale, false);
  assert.deepEqual(rerun.conflicts.map((c) => c.id).sort(), [
    "emergency-transfer",
    "pet-limit",
    "weekend-flood-route",
  ]);
  assert.equal(rerun.variations.length, 0);
});

test("an earlier pets answer does not hide the conflict a later source creates", () => {
  let s = sendAll(initialState);
  s = answer(
    s,
    "q-pets",
    "Per property: two cats at Maple Grove, one cat at Willow Court",
  );
  s = runConsistencyCheck(addSource(s));
  const pets = consistencyReport(s).conflicts.find((c) => c.id === "pet-limit");
  assert.equal(pets.resolved, false);
  s = reopenQuestion(s, "q-pets");
  assert.equal(
    s.questions.find((q) => q.id === "q-pets").status,
    "Ready to send",
  );
  s = sendRequest(s, "Property manager", ["q-pets"]);
  s = answer(s, "q-pets", "Two cats at both properties");
  assert.equal(
    consistencyReport(s).conflicts.find((c) => c.id === "pet-limit").resolved,
    true,
  );
});

test("customer answers are evidence until approved, and never overwrite other items", () => {
  const sent = sendAll(initialState);
  const first = submitAnswer(
    sent,
    "q-emergency",
    "On-call supervisor",
    "answer",
  );
  assert.equal(
    first.facts.find((f) => f.id === "T2").lifecycle,
    "Needs clarification",
  );
  const approved = reviewAnswer(first, "q-emergency");
  const t2 = approved.facts.find((f) => f.id === "T2");
  const s1 = approved.facts.find((f) => f.id === "S1");
  assert.equal(t2.approval, "Customer approved");
  assert.notEqual(t2.value, s1.value);
  assert.match(s1.value, /Collect property and unit/);
  assert.equal(s1.customerAnswer.value, "On-call supervisor");
  // an empty fact takes the customer's answer as its value
  const i2 = answer(sent, "q-integration", "Maya authorizes").facts.find(
    (f) => f.id === "I2",
  );
  assert.equal(i2.value, "Maya authorizes");
});

test("unknown or delegated answers never confirm; unsent questions reject submissions", () => {
  assert.equal(
    submitAnswer(initialState, "q-emergency", "x", "answer"),
    initialState,
  );
  const unknown = submitAnswer(
    sendAll(initialState),
    "q-emergency",
    "",
    "unknown",
  );
  assert.equal(reviewAnswer(unknown, "q-emergency"), unknown);
  assert.equal(readiness(unknown).ready, false);
});

test("requests are per recipient and only carry approved questions", () => {
  const s = approveAll(initialState);
  assert.equal(
    sendRequest(s, "Operations lead", ["q-pets"]),
    s,
    "wrong recipient",
  );
  const sent = sendRequest(s, "Operations lead", [
    "q-emergency",
    "q-integration",
  ]);
  assert.equal(sent.requests[0].recipientName, "Maya Chen");
  assert.equal(
    sendRequest(sent, "Operations lead", ["q-emergency"]),
    sent,
    "already sent",
  );
});

test("defaults apply only to non-critical questions that were sent and unanswered", () => {
  const sent = sendAll(initialState);
  assert.equal(
    applyDefault(sent, "q-emergency"),
    sent,
    "critical never defaults",
  );
  assert.equal(applyDefault(initialState, "q-pets"), initialState, "not sent");
  const d = applyDefault(sent, "q-pets");
  assert.equal(d.questions.find((q) => q.id === "q-pets").status, "Defaulted");
  assert.match(
    d.facts.find((f) => f.id === "F3").note,
    /not confirmed by the customer/,
  );
  assert.ok(readiness(d).risks.some((r) => r.includes("default")));
});

test("gaps can be waived with a reason, but critical gaps cannot", () => {
  assert.equal(waiveFact(initialState, "F4", " "), initialState);
  assert.equal(waiveFact(initialState, "I2", "skip"), initialState, "critical");
  assert.ok(
    waiveFact(initialState, "F4", "later").facts.find((f) => f.id === "F4")
      .waived,
  );
});

test("test cases come only from reviewed facts, and results go stale when a fact changes", () => {
  assert.equal(
    testCases(initialState).every(
      (t) => !["G3", "F2", "S2", "I4"].includes(t.factId),
    ),
    true,
  );
  let s = prepared();
  assert.equal(readiness(s).ready, true);
  const tc = testCases(s).find(
    (t) => t.factId === "T2" && t.kind === "Emergency",
  );
  assert.ok(tc && tc.critical);
  s = recordTest(s, tc.id, "Pass", "tried it");
  assert.equal(testStatus(s, tc), "Pass");
  s = answer(s, "q-emergency", "Front desk first");
  assert.equal(testStatus(s, tc), "Needs retest");
  assert.equal(
    launchChecklist(s).find((c) => c.id === "no-retest").pass,
    false,
  );
});

test("launch checklist and steps reach the end only when everything is done and passing", () => {
  let s = prepared();
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    false,
  );
  for (const f of s.facts) s = markConfigured(s, f.id);
  assert.equal(currentStep(s).n, 4);
  for (const t of testCases(s)) s = recordTest(s, t.id, "Pass");
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    true,
  );
  assert.equal(currentStep(s).n, 5);
  assert.equal(s.facts.find((f) => f.id === "T3").lifecycle, "Configured");
});

test("the process log counts real manual actions and flags three-times candidates", () => {
  const before = processCounts(initialState).find((p) => p.id === "configure");
  assert.equal(
    before.candidate,
    false,
    "2 earlier onboardings is below the threshold",
  );
  let s = prepared();
  s = markConfigured(s, "T3");
  const configure = processCounts(s).find((p) => p.id === "configure");
  assert.equal(configure.live, 1);
  assert.equal(configure.candidate, true, "2 earlier + 1 now = 3");
  assert.equal(
    processCounts(s).find((p) => p.id === "compare").candidate,
    false,
    "already automated",
  );
});

test("post-launch issues become test cases once", () => {
  const once = convertIssue(initialState, "i1");
  assert.equal(
    testCases(once).some((t) => t.id === "T-i1"),
    true,
  );
  assert.equal(convertIssue(once, "i1"), once);
});

test("outputs: check-in, CSV rows and Slack text are derived from state", () => {
  assert.match(weeklyCheckIn(initialState), /step 3 of 5/);
  const csv = exportCsv(initialState).trim().split("\n");
  assert.equal(csv.length, 21);
  assert.match(csv[0], /^fact_id,area,fact,value,status,approval,owner/);
});

test("the kickoff agenda covers every required fact and marks answered ones", () => {
  const agenda = kickoffAgenda(initialState);
  const items = agenda.flatMap((a) => a.items);
  assert.equal(items.length, 20);
  assert.equal(items.filter((i) => i.covered).length, 16);
  assert.equal(agenda.length, 5);
});

test("document requests report received, unreadable and missing sources", () => {
  const sources = allSources(initialState);
  const status = Object.fromEntries(
    documentRequests.map((d) => [
      d.label,
      documentStatus(initialState, d.sourceId, sources),
    ]),
  );
  assert.equal(status["Kickoff call recording"], "Received");
  assert.equal(status["Move-in checklist"], "Needs a readable copy");
  assert.equal(status["Property-system owner and access contact"], "Missing");
});

test("configuring comes before testing in the next actions", () => {
  const s = prepared();
  assert.equal(nextActions(s)[0].id, "configure");
  let done = s;
  for (const f of done.facts) done = markConfigured(done, f.id);
  assert.equal(nextActions(done)[0].id, "tests");
});
