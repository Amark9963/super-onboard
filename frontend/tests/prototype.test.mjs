import test from "node:test";
import assert from "node:assert/strict";
import {
  addSource,
  applyDefault,
  assignments,
  consistencyReport,
  contactFor,
  coverage,
  createClient,
  currentStep,
  demoClient,
  documentRequests,
  exportCsv,
  initialState,
  launchChecklist,
  markConfigured,
  nextActions,
  onboardingSteps,
  prereqItems,
  processCounts,
  readiness,
  recipientsInUse,
  recordTest,
  reopenQuestion,
  requestReadableCopy,
  resolveInternally,
  reviewAnswer,
  reviewSource,
  routingTable,
  runConsistencyCheck,
  sendDocumentRequest,
  sendRequest,
  submitAnswer,
  testCases,
  testStatus,
  togglePrereq,
  updateQuestion,
  uploadSource,
  waiveFact,
  weeklyCheckIn,
  convertIssue,
} from "../app/prototype/state.ts";

const started = () => createClient(initialState, demoClient);
const upload = (s, ...ids) => ids.reduce(uploadSource, s);
const approveAndSend = (s) => {
  for (const q of s.questions)
    if (q.status === "AI draft")
      s = updateQuestion(s, q.id, { status: "Ready to send" });
  for (const name of recipientsInUse(s))
    s = sendRequest(
      s,
      name,
      s.questions.filter((q) => q.recipient === name).map((q) => q.id),
    );
  return s;
};
const answer = (s, id, text) =>
  reviewAnswer(submitAnswer(s, id, text, "answer"), id);

/** An onboarding with every documented step done except configuration and tests. */
function prepared() {
  let s = sendDocumentRequest(started());
  s = upload(s, "transcript", "sop", "roster", "faq", "scan", "prompt-draft");
  for (const id of ["transcript", "sop", "roster", "faq"])
    s = reviewSource(s, id);
  s = runConsistencyCheck(s);
  s = resolveInternally(
    s,
    "emergency-transfer",
    "c-draft-transfer",
    "Customer wants a transfer when possible",
  );
  s = approveAndSend(s);
  s = answer(s, "q-emergency", "On-call supervisor first");
  s = answer(s, "q-integration", "Maya authorizes read-only lookups");
  for (const id of ["G2", "S3", "F4"])
    s = waiveFact(s, id, "Not needed for launch");
  for (const p of prereqItems) s = togglePrereq(s, p.id);
  return s;
}

test("the app starts with no client and an empty spec of 20 required facts", () => {
  assert.equal(initialState.client, null);
  const c = coverage(initialState);
  assert.deepEqual(
    [c.total, c.known, c.clarifying, c.empty, c.confirmed],
    [20, 2, 1, 17, 0],
  );
  assert.equal(
    nextActions(initialState).length,
    0,
    "no onboarding, no actions",
  );
});

test("creating a client resets the onboarding and keeps the entered details", () => {
  const s = uploadSource(started(), "faq");
  assert.equal(s.addedSources.length, 1);
  const again = createClient(s, { ...demoClient, name: "Birch & Co" });
  assert.equal(again.client.name, "Birch & Co");
  assert.equal(again.addedSources.length, 0);
  assert.equal(coverage(again).empty, 17);
});

test("uploading a document fills empty facts with citations and never overwrites", () => {
  const s = uploadSource(started(), "sop");
  const t3 = s.facts.find((f) => f.id === "T3");
  assert.match(t3.value, /On-call maintenance supervisor/);
  assert.equal(t3.sourceId, "sop");
  assert.equal(t3.lifecycle, "Extracted");
  assert.equal(uploadSource(s, "sop"), s, "uploading twice is a no-op");
  assert.equal(s.sourceRevision, 2);
  const scan = uploadSource(s, "scan");
  assert.equal(
    scan.facts.find((f) => f.id === "F4").value,
    null,
    "an unreadable scan fills nothing",
  );
  assert.equal(
    coverage(upload(started(), "transcript", "sop", "roster", "faq")).empty,
    17 - 13,
  );
});

test("reviewing a document marks only the facts it filled", () => {
  let s = upload(started(), "roster", "faq");
  s = reviewSource(s, "roster");
  assert.equal(
    s.facts.find((f) => f.id === "T1").approval,
    "Specialist reviewed",
  );
  assert.equal(s.facts.find((f) => f.id === "F1").approval, "Not reviewed");
  assert.equal(reviewSource(s, "roster"), s);
});

test("the contradiction check flags the facts, drafts questions and assigns them by topic", () => {
  let s = upload(started(), "transcript", "sop");
  assert.equal(
    s.facts.find((f) => f.id === "T2").lifecycle,
    "Extracted",
    "looks fine until checked",
  );
  s = runConsistencyCheck(s);
  const r = consistencyReport(s);
  assert.deepEqual(
    r.conflicts.map((c) => c.id),
    ["weekend-flood-route"],
  );
  assert.deepEqual(
    r.variations.map((v) => v.id),
    ["pet-limit"],
  );
  assert.equal(
    s.facts.find((f) => f.id === "T2").lifecycle,
    "Needs clarification",
  );
  assert.match(s.facts.find((f) => f.id === "S1").note, /Sources disagree/);
  assert.deepEqual(s.questions.map((q) => q.id).sort(), [
    "q-emergency",
    "q-integration",
  ]);
  assert.equal(
    s.questions.find((q) => q.id === "q-emergency").recipient,
    "Maya Chen",
  );
  assert.equal(
    s.questions.find((q) => q.id === "q-integration").recipient,
    "Maya Chen",
  );
});

test("a late email makes the check stale, fills gaps and creates a pet-policy question for another contact", () => {
  let s = runConsistencyCheck(upload(started(), "transcript", "sop"));
  s = addSource(s);
  assert.equal(consistencyReport(s).stale, true);
  assert.match(s.facts.find((f) => f.id === "G2").value, /90%/);
  assert.ok(readiness(s).blockers.some((b) => b.includes("run it again")));
  s = runConsistencyCheck(s);
  assert.deepEqual(
    consistencyReport(s)
      .conflicts.map((c) => c.id)
      .sort(),
    ["pet-limit", "weekend-flood-route"],
  );
  assert.equal(
    s.questions.find((q) => q.id === "q-pets").recipient,
    "Priya Shah",
  );
  assert.equal(
    s.facts.find((f) => f.id === "F3").lifecycle,
    "Needs clarification",
  );
});

test("questions go to whoever decides the topic, with a fallback to the first contact", () => {
  assert.equal(contactFor(started(), "policies").name, "Priya Shah");
  const noPolicies = createClient(initialState, {
    ...demoClient,
    contacts: demoClient.contacts.map((c) => ({
      ...c,
      decides: c.decides.filter((t) => t !== "policies"),
    })),
  });
  assert.equal(contactFor(noPolicies, "policies").name, "Maya Chen");
});

test("an earlier pets answer does not hide the conflict a later source creates", () => {
  let s = runConsistencyCheck(
    addSource(runConsistencyCheck(upload(started(), "transcript", "sop"))),
  );
  s = approveAndSend(s);
  s = answer(s, "q-pets", "Two cats at both properties");
  assert.equal(
    consistencyReport(s).conflicts.find((c) => c.id === "pet-limit").resolved,
    true,
  );
  s = reopenQuestion(s, "q-pets");
  assert.equal(
    s.questions.find((q) => q.id === "q-pets").status,
    "Ready to send",
  );
});

test("customer answers are evidence until approved and never overwrite other facts", () => {
  const s = approveAndSend(
    runConsistencyCheck(upload(started(), "transcript", "sop")),
  );
  const first = submitAnswer(s, "q-emergency", "On-call supervisor", "answer");
  assert.equal(first.facts.find((f) => f.id === "T2").approval, "Not reviewed");
  const approved = reviewAnswer(first, "q-emergency");
  const t2 = approved.facts.find((f) => f.id === "T2");
  const s1 = approved.facts.find((f) => f.id === "S1");
  assert.equal(t2.approval, "Customer approved");
  assert.notEqual(t2.value, s1.value);
  assert.equal(s1.customerAnswer.value, "On-call supervisor");
  const i2 = answer(s, "q-integration", "Maya authorizes").facts.find(
    (f) => f.id === "I2",
  );
  assert.equal(
    i2.value,
    "Maya authorizes",
    "an empty fact takes the customer's answer",
  );
  assert.equal(
    submitAnswer(initialState, "q-emergency", "x", "answer"),
    initialState,
  );
});

test("defaults apply only to non-critical sent questions", () => {
  let s = runConsistencyCheck(
    addSource(runConsistencyCheck(upload(started(), "transcript", "sop"))),
  );
  s = approveAndSend(s);
  assert.equal(applyDefault(s, "q-emergency"), s, "critical never defaults");
  const d = applyDefault(s, "q-pets");
  assert.equal(d.questions.find((q) => q.id === "q-pets").status, "Defaulted");
  assert.ok(readiness(d).risks.some((r) => r.includes("default")));
});

test("gaps can be waived with a reason but critical gaps cannot", () => {
  assert.equal(
    waiveFact(started(), "F4", " ").facts.find((f) => f.id === "F4").waived,
    undefined,
  );
  assert.equal(
    waiveFact(started(), "I2", "skip").facts.find((f) => f.id === "I2").waived,
    undefined,
  );
  assert.ok(
    waiveFact(started(), "F4", "later").facts.find((f) => f.id === "F4").waived,
  );
});

test("assignments show who each open item belongs to, on the customer and team side", () => {
  assert.equal(
    assignments(started()).filter((a) => a.side === "customer").length,
    0,
    "nothing is assigned before the request",
  );
  let s = sendDocumentRequest(started());
  const docs = assignments(s).filter((a) => a.side === "customer");
  assert.equal(
    docs.length,
    4,
    "four of the five documents come from the customer",
  );
  assert.equal(docs.find((a) => a.id === "doc-roster").assignee, "Jordan Lee");
  assert.equal(docs.find((a) => a.id === "doc-sop").assignee, "Maya Chen");
  s = approveAndSend(
    runConsistencyCheck(
      upload(s, "transcript", "sop", "roster", "faq", "scan"),
    ),
  );
  const qs = assignments(s).filter((a) => a.id.startsWith("q-"));
  assert.ok(
    qs.length >= 2 &&
      qs.every((a) => a.side === "customer" && a.assignee === "Maya Chen"),
  );
  assert.ok(
    assignments(s)
      .filter((a) => a.side === "team")
      .every((a) => a.assignee === "Avery Morgan"),
  );
  assert.ok(
    !assignments(s).some((a) => a.id === "doc-scan"),
    "our action first, not the customer's",
  );
  s = requestReadableCopy(s);
  assert.ok(assignments(s).some((a) => a.id === "doc-scan-copy"));
  assert.equal(documentRequests.length, 5);
});

test("steps are derived and follow the journey from client details to go-live", () => {
  assert.equal(currentStep(started()).n, 1);
  let s = sendDocumentRequest(started());
  assert.equal(currentStep(s).n, 2);
  s = upload(s, "transcript", "sop", "roster", "faq", "scan");
  assert.equal(currentStep(s).n, 2, "extraction still has to be reviewed");
  for (const id of ["transcript", "sop", "roster", "faq"])
    s = reviewSource(s, id);
  assert.equal(currentStep(s).n, 3);
  assert.equal(nextActions(s)[0].id, "run-check");
  assert.deepEqual(
    onboardingSteps(s).map((x) => x.status),
    ["Done", "Done", "Current", "Upcoming", "Upcoming"],
  );
});

test("the customer's roles and routing rules are derived and show disputes", () => {
  const empty = routingTable(started());
  assert.ok(
    empty.every(
      (r) =>
        r.status === "Not received" || r.scenario === "Unsupported question",
    ),
  );
  let s = upload(started(), "transcript", "sop", "roster", "faq");
  assert.equal(
    routingTable(s).find((r) => r.scenario.startsWith("After-hours")).status,
    "Known",
  );
  s = runConsistencyCheck(s);
  const row = routingTable(s).find((r) => r.scenario.startsWith("After-hours"));
  assert.equal(row.status, "Disputed");
  assert.match(row.who, /sources disagree/);
});

test("test results go stale when a fact changes", () => {
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

test("launch needs prerequisites, configuration and passing tests", () => {
  let s = prepared();
  assert.equal(nextActions(s)[0].id, "configure");
  for (const f of s.facts) s = markConfigured(s, f.id);
  assert.equal(nextActions(s)[0].id, "tests");
  assert.equal(currentStep(s).n, 4);
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    false,
  );
  for (const t of testCases(s)) s = recordTest(s, t.id, "Pass");
  assert.equal(
    launchChecklist(s).every((c) => c.pass),
    true,
  );
  assert.equal(currentStep(s).n, 5);
  const without = togglePrereq(s, "phone");
  assert.equal(
    launchChecklist(without).find((c) => c.id === "prereqs").pass,
    false,
  );
});

test("the process log counts real manual actions", () => {
  let s = prepared();
  assert.equal(
    processCounts(s).find((p) => p.id === "configure").candidate,
    false,
  );
  s = markConfigured(s, "T3");
  assert.equal(
    processCounts(s).find((p) => p.id === "configure").candidate,
    true,
    "2 earlier + 1 now = 3",
  );
  assert.ok(processCounts(s).find((p) => p.id === "review-fact").live > 0);
});

test("post-launch issues become test cases once; outputs derive from state", () => {
  const once = convertIssue(initialState, "i1");
  assert.equal(
    testCases(once).some((t) => t.id === "T-i1"),
    true,
  );
  assert.equal(convertIssue(once, "i1"), once);
  assert.match(weeklyCheckIn(started()), /stage 1 of 5/);
  const csv = exportCsv(started()).trim().split("\n");
  assert.equal(csv.length, 21);
  assert.match(csv[0], /^fact_id,area,fact,lands_in,value/);
});
