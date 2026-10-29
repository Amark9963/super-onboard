import test from "node:test";
import assert from "node:assert/strict";
import {
  consistencyReport,
  initialState,
  launchChecklist,
  nextActions,
  onboardingSteps,
  packageFiles,
  readiness,
  recordTest,
  resolveInternally,
  reviewAnswer,
  runConsistencyCheck,
  sendRequest,
  submitAnswer,
  testCases,
  testStatus,
  updateQuestion,
  weeklyCheckIn,
  zipFiles,
} from "../app/prototype/state.ts";

function sentState() {
  let s = initialState;
  for (const id of ["q-emergency", "q-integration", "q-pets"])
    s = updateQuestion(s, id, { status: "Ready to send" });
  s = sendRequest(s, "Operations lead", ["q-emergency", "q-integration"]);
  return s;
}

function allResolved() {
  let s = runConsistencyCheck(sentState());
  s = reviewAnswer(
    submitAnswer(
      s,
      "q-emergency",
      "On-call supervisor, then front desk",
      "answer",
    ),
    "q-emergency",
  );
  s = reviewAnswer(
    submitAnswer(
      s,
      "q-integration",
      "Maya authorizes read-only lookups",
      "answer",
    ),
    "q-integration",
  );
  return resolveInternally(
    s,
    "emergency-transfer",
    "c-draft-transfer",
    "Customer wants a transfer when possible",
  );
}

test("customer answer is evidence until staff approval; amendment reopens knowledge", () => {
  const sent = runConsistencyCheck(sentState());
  const first = submitAnswer(
    sent,
    "q-emergency",
    "On-call supervisor first",
    "answer",
  );
  assert.equal(
    first.knowledge.find((k) => k.id === "emergency").status,
    "Needs clarification",
  );
  assert.equal(readiness(first).ready, false);
  const done = allResolved();
  assert.equal(readiness(done).ready, true);
  assert.match(
    packageFiles(done)["03-team-and-routing.md"],
    /On-call supervisor/i,
  );
  const exported = { ...done, packageSnapshot: done.knowledgeRevision };
  assert.equal(readiness(exported).stale, false);
  const amended = submitAnswer(
    exported,
    "q-emergency",
    "Front desk first",
    "answer",
  );
  assert.equal(readiness(amended).ready, false);
  assert.equal(readiness(amended).stale, true);
});

test("reviewing an answer keeps each linked item's own summary", () => {
  const s = reviewAnswer(
    submitAnswer(sentState(), "q-emergency", "On-call supervisor", "answer"),
    "q-emergency",
  );
  const scenario = s.knowledge.find((k) => k.id === "scenario");
  const emergency = s.knowledge.find((k) => k.id === "emergency");
  assert.notEqual(scenario.summary, emergency.summary);
  assert.match(scenario.summary, /Collect location/);
  assert.equal(scenario.customerAnswer.value, "On-call supervisor");
});

test("unknown or delegated answers never confirm; unsent questions reject submissions", () => {
  assert.equal(
    submitAnswer(initialState, "q-emergency", "x", "answer"),
    initialState,
  );
  const sent = sentState();
  const unknown = submitAnswer(sent, "q-emergency", "", "unknown");
  assert.equal(reviewAnswer(unknown, "q-emergency"), unknown);
  // q-pets was never sent, so it cannot receive an answer.
  assert.equal(submitAnswer(sent, "q-pets", "x", "answer"), sent);
});

test("requests are per recipient and only carry approved questions", () => {
  const s = sentState();
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].recipientName, "Maya Chen");
  assert.equal(
    sendRequest(s, "Operations lead", ["q-pets"]),
    s,
    "wrong recipient",
  );
  const both = sendRequest(s, "Property manager", ["q-pets"]);
  assert.equal(both.requests.length, 2);
});

test("consistency check finds source and draft conflicts but not scope variations", () => {
  const r = consistencyReport(runConsistencyCheck(initialState));
  assert.deepEqual(r.conflicts.map((c) => c.id).sort(), [
    "emergency-transfer",
    "weekend-flood-route",
  ]);
  assert.equal(
    r.conflicts.find((c) => c.id === "emergency-transfer").needs,
    "internal",
  );
  assert.equal(
    r.conflicts.find((c) => c.id === "weekend-flood-route").needs,
    "customer",
  );
  assert.deepEqual(
    r.variations.map((v) => v.id),
    ["pet-limit"],
  );
  assert.equal(readiness(initialState).ready, false);
  assert.ok(readiness(initialState).blockers[0].includes("consistency check"));
});

test("internal conflicts need a stated reason and a real choice", () => {
  const s = runConsistencyCheck(initialState);
  assert.equal(
    resolveInternally(s, "emergency-transfer", "c-draft-transfer", " "),
    s,
  );
  assert.equal(resolveInternally(s, "emergency-transfer", "c-pets-mg", "x"), s);
  assert.equal(
    resolveInternally(s, "weekend-flood-route", "c-sop-route", "x"),
    s,
    "customer conflicts are not self-fixable",
  );
  const fixed = resolveInternally(
    s,
    "emergency-transfer",
    "c-draft-weekend",
    "Callback is the intended rule",
  );
  assert.equal(consistencyReport(fixed).open.length, 1);
});

test("test results go stale when the knowledge they cover changes", () => {
  const s = allResolved();
  const tc = testCases(s).find(
    (t) => t.knowledgeId === "emergency" && t.kind === "Emergency",
  );
  assert.ok(tc && tc.critical);
  assert.equal(testStatus(s, tc), "Not run");
  const passed = recordTest(s, tc.id, "Pass", "tried it");
  assert.equal(testStatus(passed, tc), "Pass");
  const changed = submitAnswer(
    passed,
    "q-emergency",
    "Front desk first",
    "answer",
  );
  const again = reviewAnswer(changed, "q-emergency");
  assert.equal(testStatus(again, tc), "Needs retest");
  assert.equal(
    launchChecklist(again).find((c) => c.id === "no-retest").pass,
    false,
  );
});

test("launch checklist is never complete before every case passes", () => {
  let s = allResolved();
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    false,
  );
  // Pets stay unreviewed until its question is sent, answered and approved.
  s = sendRequest(s, "Property manager", ["q-pets"]);
  s = reviewAnswer(
    submitAnswer(s, "q-pets", "Yes, one cat with written approval", "answer"),
    "q-pets",
  );
  assert.equal(launchChecklist(s).find((c) => c.id === "questions").pass, true);
  for (const t of testCases(s)) s = recordTest(s, t.id, "Pass");
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    true,
  );
});

test("progress and actions are derived, not hard-coded", () => {
  assert.equal(
    onboardingSteps(initialState).find((x) => x.status === "Current").n,
    3,
  );
  assert.equal(nextActions(initialState)[0].id, "run-check");
  const done = allResolved();
  assert.equal(
    nextActions(done).some((a) => a.id.startsWith("conflict-")),
    false,
  );
  assert.equal(onboardingSteps(done).find((x) => x.status === "Current").n, 4);
  assert.match(weeklyCheckIn(initialState), /step 3 of 5/);
});

test("package content and ZIP bytes are deterministic for identical state", () => {
  const files = packageFiles(initialState);
  assert.equal(Object.keys(files).length, 9);
  assert.doesNotMatch(files["03-team-and-routing.md"], /front desk first/i);
  assert.deepEqual(files, packageFiles(initialState));
  const first = zipFiles(files);
  assert.deepEqual(first, zipFiles(packageFiles(initialState)));
  assert.equal(new DataView(first.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(
    new DataView(first.buffer).getUint32(first.length - 22, true),
    0x06054b50,
  );
  assert.equal(
    new DataView(first.buffer).getUint16(first.length - 12, true),
    9,
  );
});
