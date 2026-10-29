import test from "node:test";
import assert from "node:assert/strict";
import {
  addContact,
  addSource,
  checkContact,
  cancelInvite,
  inviteMember,
  owners,
  ownedBy,
  setOwner,
  applyDefault,
  assignments,
  consistencyReport,
  contactFor,
  coverage,
  createClient,
  currentStep,
  demoClient,
  documentRequests,
  initialState,
  nextActions,
  onboardingSteps,
  readiness,
  recipientsInUse,
  reopenQuestion,
  requestReadableCopy,
  resolveInternally,
  reviewAnswer,
  reviewFact,
  reviewSource,
  routingTable,
  runConsistencyCheck,
  sendDocumentRequest,
  sendRequest,
  setupItems,
  setupReadiness,
  setupUnlocked,
  submitAnswer,
  toggleSetup,
  updateQuestion,
  uploadSource,
  waiveFact,
  weeklyCheckIn,
  currentStep as step,
} from "../app/prototype/state.ts";
import { diffActivity } from "../app/prototype/activity.ts";
import {
  addNote,
  canRequestReview,
  decideReview,
  handoverNote,
  markSeen,
  mentionsIn,
  myQueue,
  requestReview,
  reviewers,
  setMe,
} from "../app/prototype/collab.ts";
import { tryItSteps } from "../app/prototype/demo.ts";
import { phaseProgress, planTasks } from "../app/prototype/plan.ts";

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

/** An onboarding with intake and clarification finished; setup in the platform is still to do. */
function readyForReview() {
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
  return s;
}

/** Owner asks a QA reviewer, who approves; then back to the owner. */
function reviewedBy(s, reviewer = "Riley Kim") {
  const owner = s.me;
  s = requestReview(s, reviewer);
  s = setMe(s, s.team.find((m) => m.name === reviewer).id);
  s = decideReview(s, "approve", "");
  return setMe(s, owner);
}

function clarified() {
  return reviewedBy(readyForReview());
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
  assert.equal(
    reviewFact(s, "F1").facts.find((f) => f.id === "F1").approval,
    "Specialist reviewed",
  );
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

test("setup and go-live are tasks that unlock in order, and finish the onboarding", () => {
  let s = started();
  assert.equal(setupUnlocked(s, 4), false);
  assert.equal(
    toggleSetup(s, "phone"),
    s,
    "locked until clarification is done",
  );
  s = clarified();
  assert.equal(
    setupReadiness(s).every((c) => c.pass),
    true,
  );
  assert.equal(currentStep(s).n, 4);
  assert.equal(nextActions(s)[0].id, "setup");
  assert.equal(toggleSetup(s, "live"), s, "go-live tasks wait for setup");
  for (const i of setupItems.filter((x) => x.phase === 4))
    s = toggleSetup(s, i.id);
  assert.equal(currentStep(s).n, 5);
  assert.equal(nextActions(s)[0].id, "golive");
  for (const i of setupItems.filter((x) => x.phase === 5))
    s = toggleSetup(s, i.id);
  assert.equal(
    onboardingSteps(s).every((x) => x.status === "Done"),
    true,
  );
  assert.equal(
    phaseProgress(s).every((p) => p.status === "Done"),
    true,
  );
  assert.equal(nextActions(s).length, 0);
  const undone = toggleSetup(s, "phone");
  assert.equal(undone.setup.phone, false, "a task can be undone");
});

test("a new customer answer after clarification reopens the readiness checks", () => {
  let s = clarified();
  assert.equal(
    setupReadiness(s).every((c) => c.pass),
    true,
  );
  s = answer(s, "q-emergency", "Front desk first");
  assert.equal(
    setupReadiness(s).find((c) => c.id === "second-review").pass,
    false,
    "the approval no longer matches the details",
  );
  s = reopenQuestion(s, "q-emergency");
  s = approveAndSend(s);
  assert.equal(
    setupReadiness(s).some((c) => !c.pass),
    true,
  );
});

test("the plan is derived: every task has an owner, and the customer's tasks name a real contact", () => {
  let s = started();
  const first = planTasks(s);
  assert.ok(
    first.every((t) => t.assignee && ["customer", "team"].includes(t.side)),
  );
  assert.equal(first.find((t) => t.id === "p1-request").status, "In progress");
  assert.deepEqual(
    phaseProgress(s).map((p) => p.status),
    ["Current", "Upcoming", "Upcoming", "Upcoming", "Upcoming"],
  );
  s = upload(sendDocumentRequest(s), "sop", "scan");
  const tasks = planTasks(s);
  assert.equal(tasks.find((t) => t.id === "p2-sop").status, "Done");
  assert.equal(tasks.find((t) => t.id === "p2-sop").assignee, "Maya Chen");
  assert.equal(tasks.find((t) => t.id === "p2-scan").status, "Blocked");
  assert.equal(tasks.find((t) => t.id === "p2-scan").assignee, "Jordan Lee");
  assert.equal(
    planTasks(requestReadableCopy(s)).find((t) => t.id === "p2-scan").status,
    "In progress",
  );
  s = runConsistencyCheck(upload(s, "transcript"));
  const q = planTasks(approveAndSend(s)).find(
    (t) => t.id === "p3-answer-q-emergency",
  );
  assert.deepEqual(
    [q.side, q.assignee, q.status],
    ["customer", "Maya Chen", "In progress"],
  );
  const setupTask = planTasks(started()).find((t) => t.id === "p4-phone");
  assert.deepEqual(
    [setupTask.manual.id, setupTask.manual.locked],
    ["phone", true],
  );
  assert.equal(
    planTasks(clarified()).find((t) => t.id === "p4-phone").manual.locked,
    false,
  );
});

// Same as the app: every update goes through diffActivity.
const track = (s, fn) => diffActivity(s, fn(s));

test("the activity feed records who did what, on which side, without any action knowing about it", () => {
  let s = track(initialState, () => started());
  s = track(s, sendDocumentRequest);
  s = track(s, (x) => uploadSource(x, "sop"));
  s = track(s, (x) => uploadSource(x, "transcript"));
  s = track(s, (x) => uploadSource(x, "faq"));
  s = track(s, runConsistencyCheck);
  const texts = s.activity.map((e) => e.text);
  assert.ok(texts[0].startsWith("Created the onboarding"));
  const sop = s.activity.find((e) => e.text.includes("operations handbook"));
  assert.deepEqual([sop.actor.name, sop.actor.side], ["Maya Chen", "customer"]);
  assert.equal(
    s.activity.find((e) => e.text.includes("kickoff call")).actor.side,
    "team",
  );
  assert.equal(
    s.activity.find((e) => e.text.includes("FAQ snapshot")).actor.side,
    "system",
    "a public website is not a person",
  );
  assert.ok(
    s.activity.some(
      (e) =>
        e.actor.side === "system" &&
        e.text.startsWith("Contradiction check: 1 conflict"),
    ),
  );
  assert.ok(
    s.activity.some(
      (e) =>
        e.actor.side === "system" &&
        e.text.startsWith("Drafted a question for Maya Chen"),
    ),
  );
  assert.match(
    s.activity.find((e) => e.text.includes("FAQ snapshot")).text,
    /1 setup detail read/,
  );
  assert.equal(new Set(s.activity.map((e) => e.id)).size, s.activity.length);
  assert.equal(
    track(s, (x) => x),
    s,
    "no change, no events",
  );
});

test("customer answers and setup tasks are logged", () => {
  let s = track(initialState, () => started());
  s = track(s, (x) => uploadSource(uploadSource(x, "transcript"), "sop"));
  s = track(s, runConsistencyCheck);
  s = track(s, (x) =>
    updateQuestion(x, "q-emergency", { status: "Ready to send" }),
  );
  s = track(s, (x) => sendRequest(x, "Maya Chen", ["q-emergency"]));
  s = track(s, (x) =>
    submitAnswer(x, "q-emergency", "On-call first", "answer"),
  );
  const answered = s.activity.find((e) => e.kind === "answer");
  assert.deepEqual(
    [answered.actor.name, answered.actor.side],
    ["Maya Chen", "customer"],
  );
  s = track(s, (x) => reviewAnswer(x, "q-emergency"));
  assert.ok(s.activity.some((e) => e.kind === "approve"));
  let t = track(initialState, () => clarified());
  t = track(t, (x) => toggleSetup(x, "phone"));
  assert.ok(t.activity.at(-1).text.startsWith("Completed: Phone number"));
});

test("the weekly check-in is derived from state", () => {
  assert.match(weeklyCheckIn(started()), /stage 1 of 5/);
  const done = clarified();
  assert.match(weeklyCheckIn(done), /stage 4 of 5/);
  assert.equal(step(started()).n, 1);
});

test("the team starts with four active members and survives creating a new onboarding", () => {
  assert.equal(initialState.team.length, 4);
  assert.ok(initialState.team.every((m) => m.status === "Active"));
  assert.equal(
    createClient(
      inviteMember(initialState, "new.person@example.invalid", "QA reviewer"),
      demoClient,
    ).team.length,
    5,
  );
});

test("inviting adds an invited member; bad, duplicate and unknown-role invites are rejected", () => {
  const s = inviteMember(
    initialState,
    "Jordan.Taylor@Example.invalid",
    "QA reviewer",
  );
  const m = s.team.at(-1);
  assert.deepEqual(
    [m.status, m.role, m.email, m.name],
    [
      "Invited",
      "QA reviewer",
      "jordan.taylor@example.invalid",
      "Jordan Taylor",
    ],
  );
  assert.equal(
    inviteMember(s, "jordan.taylor@example.invalid", "QA reviewer"),
    s,
    "duplicate",
  );
  assert.equal(
    inviteMember(initialState, "not-an-email", "QA reviewer"),
    initialState,
    "invalid email",
  );
  assert.equal(
    inviteMember(initialState, "x@example.invalid", "Boss"),
    initialState,
    "unknown role",
  );
});

test("only invitations can be cancelled, and only active members can own an onboarding", () => {
  const s = inviteMember(
    initialState,
    "pending@example.invalid",
    "Onboarding specialist",
  );
  const pending = s.team.at(-1);
  assert.equal(cancelInvite(s, "t-avery"), s, "active members are not removed");
  assert.equal(cancelInvite(s, pending.id).team.length, 4);
  assert.ok(
    !owners(s).some((o) => o.id === pending.id),
    "an invited person cannot own anything yet",
  );
  const c = createClient(s, demoClient);
  assert.equal(setOwner(c, pending.name), c);
  assert.equal(setOwner(c, "Nobody Here"), c);
});

test("changing the owner moves the team's tasks and shows in the owner's list", () => {
  let s = sendDocumentRequest(started());
  assert.ok(
    planTasks(s)
      .filter((t) => t.side === "team")
      .every((t) => t.assignee === "Avery Morgan"),
  );
  s = setOwner(s, "Riley Kim");
  assert.equal(s.client.owner, "Riley Kim");
  assert.ok(
    planTasks(s)
      .filter((t) => t.side === "team")
      .every((t) => t.assignee === "Riley Kim"),
  );
  assert.deepEqual(
    ownedBy(
      s,
      s.team.find((m) => m.name === "Riley Kim"),
    ).map((o) => o.live),
    [true],
  );
  assert.deepEqual(
    ownedBy(
      s,
      s.team.find((m) => m.name === "Avery Morgan"),
    ),
    [],
  );
  const sam = ownedBy(
    s,
    s.team.find((m) => m.name === "Sam Rivera"),
  );
  assert.deepEqual(
    sam.map((o) => o.live),
    [false, false],
    "illustrative rows are never live",
  );
  const logged = diffActivity(started(), s);
  assert.ok(
    logged.activity.some(
      (e) =>
        e.kind === "owner" &&
        /Took over the onboarding from Avery Morgan/.test(e.text),
    ),
  );
});

test("a customer contact needs a name; duplicates and bad emails are rejected; the email is optional", () => {
  const existing = demoClient.contacts;
  const ok = checkContact(existing, {
    name: "  Taylor Brooks ",
    role: "",
    email: "",
    decides: ["policies"],
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(
    [ok.contact.name, ok.contact.role, ok.contact.email],
    ["Taylor Brooks", "Contact", ""],
  );
  assert.equal(
    checkContact(existing, { name: " ", role: "", email: "", decides: [] }).ok,
    false,
  );
  assert.match(
    checkContact(existing, {
      name: "maya chen",
      role: "",
      email: "",
      decides: [],
    }).error,
    /already on the customer team/,
  );
  assert.match(
    checkContact(existing, {
      name: "Taylor",
      role: "",
      email: "nope",
      decides: [],
    }).error,
    /valid email/,
  );
});

test("adding a customer contact later changes who a topic is assigned to, and is logged", () => {
  const onlyMaya = createClient(initialState, {
    ...demoClient,
    contacts: [demoClient.contacts[0]],
  });
  assert.equal(
    contactFor(onlyMaya, "policies").name,
    "Maya Chen",
    "falls back to the first contact",
  );
  const added = addContact(onlyMaya, {
    name: "Priya Shah",
    role: "Property manager",
    email: "priya@example.invalid",
    decides: ["policies"],
  });
  assert.equal(added.client.contacts.length, 2);
  assert.equal(contactFor(added, "policies").name, "Priya Shah");
  assert.equal(
    addContact(added, { name: "Priya Shah", role: "", email: "", decides: [] }),
    added,
    "duplicate is a no-op",
  );
  assert.equal(
    addContact(initialState, { name: "X", role: "", email: "", decides: [] }),
    initialState,
    "needs an onboarding",
  );
  const logged = diffActivity(onlyMaya, added);
  assert.ok(
    logged.activity.some(
      (e) =>
        e.kind === "contact" &&
        e.text === "Added Priya Shah (Property manager) to the customer team",
    ),
  );
});

const doneIds = (s) =>
  tryItSteps(s)
    .filter((x) => x.done)
    .map((x) => x.id);

test("the Try it guide ticks off by itself from what the viewer actually did", () => {
  assert.deepEqual(doneIds(initialState), []);
  assert.ok(tryItSteps(initialState).filter((x) => x.needsClient).length >= 7);
  assert.deepEqual(doneIds(started()), ["create"]);
  assert.deepEqual(doneIds(sendDocumentRequest(started())), [
    "create",
    "request",
  ]);
  const checked = runConsistencyCheck(
    upload(
      sendDocumentRequest(started()),
      "transcript",
      "sop",
      "roster",
      "faq",
      "scan",
    ),
  );
  assert.ok(
    !doneIds(checked).includes("upload"),
    "extraction has not been checked yet",
  );
  assert.ok(doneIds(checked).includes("detect"));
  const done = clarified();
  assert.deepEqual(doneIds(done), [
    "create",
    "request",
    "upload",
    "detect",
    "send",
    "answer",
    "approve",
    "review",
  ]);
  const withInvite = inviteMember(
    done,
    "new.person@example.invalid",
    "QA reviewer",
  );
  assert.ok(doneIds(withInvite).includes("team"));
  assert.equal(
    tryItSteps(withInvite).find((x) => x.id === "team").optional,
    true,
  );
});

test("every step of the guide finishes when the onboarding is complete", () => {
  let s = clarified();
  for (const i of setupItems.filter((x) => x.phase === 4))
    s = toggleSetup(s, i.id);
  for (const i of setupItems.filter((x) => x.phase === 5))
    s = toggleSetup(s, i.id);
  assert.equal(
    tryItSteps(s)
      .filter((x) => !x.optional)
      .every((x) => x.done),
    true,
  );
});

// ---------------------------------------------------------------------------------------------
// Team collaboration
// ---------------------------------------------------------------------------------------------

test("@mentions match full or first names of active members only", () => {
  const team = inviteMember(
    initialState,
    "pending.person@example.invalid",
    "QA reviewer",
  ).team;
  assert.deepEqual(
    mentionsIn(team, "@Riley please check, cc @Sam Rivera and @pending"),
    ["Sam Rivera", "Riley Kim"],
  );
  assert.deepEqual(mentionsIn(team, "email riley@example.invalid"), []);
  assert.deepEqual(mentionsIn(team, "@Rileyx is not a person"), []);
});

test("notes are internal, attributed to who is signed in, and mentions go to others", () => {
  const s0 = started();
  assert.equal(
    addNote(s0, { kind: "client", id: "c" }, "   "),
    s0,
    "empty notes are ignored",
  );
  const target = { kind: "fact", id: "S4" };
  const s1 = addNote(s0, target, "@Avery and @Riley: is this right?");
  const n = s1.notes[0];
  assert.equal(n.author, "Avery Morgan");
  assert.deepEqual(n.mentions, ["Riley Kim"], "you cannot mention yourself");
  const logged = diffActivity(s0, s1).activity.at(-1);
  assert.equal(logged.kind, "note");
  assert.ok(logged.text.endsWith("(mentioned Riley Kim)"));
  const asRiley = setMe(s1, "t-riley");
  assert.equal(myQueue(asRiley).filter((i) => i.kind === "mention").length, 1);
  assert.equal(
    markSeen(s1, [n.id]),
    s1,
    "only the mentioned person can mark it seen",
  );
  const seen = markSeen(asRiley, [n.id]);
  assert.equal(myQueue(seen).filter((i) => i.kind === "mention").length, 0);
});

test("the review needs the owner to ask and a different team member to decide", () => {
  const early = started();
  assert.equal(canRequestReview(early, "Riley Kim").ok, false, "not ready");
  const ready = readyForReview();
  assert.deepEqual(
    reviewers(ready).map((m) => m.name),
    ["Sam Rivera", "Riley Kim"],
    "not the owner, not an engineer",
  );
  assert.equal(
    canRequestReview(setMe(ready, "t-riley"), "Sam Rivera").ok,
    false,
    "only the owner asks",
  );
  assert.equal(canRequestReview(ready, "Avery Morgan").ok, false);
  assert.equal(canRequestReview(ready, "Jamie Park").ok, false);
  const asked = requestReview(ready, "Riley Kim");
  assert.equal(asked.review.status, "Requested");
  assert.equal(setupUnlocked(asked, 4), false, "setup waits for the review");
  assert.equal(
    planTasks(asked).find((t) => t.id === "p3-review").assignee,
    "Riley Kim",
  );
  assert.equal(
    decideReview(asked, "approve", ""),
    asked,
    "the owner cannot approve their own work",
  );
  const asRiley = setMe(asked, "t-riley");
  assert.equal(
    decideReview(asRiley, "changes", " "),
    asRiley,
    "changes need a reason",
  );
  const sentBack = decideReview(asRiley, "changes", "F2 contradicts the call");
  assert.equal(sentBack.review.status, "Changes requested");
  assert.equal(setupUnlocked(sentBack, 4), false);
  const again = requestReview(setMe(sentBack, "t-avery"), "Sam Rivera");
  assert.equal(again.review.round, 2);
  const approved = decideReview(setMe(again, "t-sam"), "approve", "");
  assert.equal(setupUnlocked(approved, 4), true);
  const events = [
    diffActivity(ready, asked).activity.at(-1),
    diffActivity(asked, sentBack).activity.at(-1),
    diffActivity(again, approved).activity.at(-1),
  ];
  assert.deepEqual(
    events.map((e) => [e.actor.name, e.kind]),
    [
      ["Avery Morgan", "review-request"],
      ["Riley Kim", "review-decision"],
      ["Sam Rivera", "review-decision"],
    ],
  );
});

test("a change after the review makes the approval stale and locks setup again", () => {
  const s = clarified();
  assert.equal(setupUnlocked(s, 4), true);
  const changed = {
    ...s,
    facts: s.facts.map((f) => (f.id === "G1" ? { ...f, rev: f.rev + 1 } : f)),
  };
  assert.equal(setupUnlocked(changed, 4), false);
  assert.match(
    setupReadiness(changed).find((c) => c.id === "second-review").detail,
    /changed since/,
  );
});

test("a change while review is pending requires a fresh request", () => {
  const asked = requestReview(readyForReview(), "Riley Kim");
  const changed = {
    ...asked,
    facts: asked.facts.map((f) =>
      f.id === "G1" ? { ...f, rev: f.rev + 1 } : f,
    ),
  };
  const asRiley = setMe(changed, "t-riley");
  assert.equal(decideReview(asRiley, "approve", ""), asRiley);
  assert.equal(
    myQueue(asRiley).some((q) => q.kind === "review"),
    false,
  );
  assert.equal(canRequestReview(changed, "Sam Rivera").ok, true);
  const renewed = requestReview(changed, "Sam Rivera");
  assert.equal(renewed.review.round, 2);
  assert.equal(renewed.review.reviewer, "Sam Rivera");
  assert.equal(
    decideReview(setMe(renewed, "t-sam"), "approve", "").review.status,
    "Approved",
  );
});

test("the reviewer cannot become the owner and sign off their own onboarding", () => {
  const asked = requestReview(readyForReview(), "Riley Kim");
  const reassigned = setOwner(asked, "Riley Kim");
  const asRiley = setMe(reassigned, "t-riley");
  assert.equal(decideReview(asRiley, "approve", ""), asRiley);
  assert.equal(canRequestReview(asRiley, "Sam Rivera").ok, true);
  const approved = reviewedBy(readyForReview());
  assert.equal(setupUnlocked(setOwner(approved, "Riley Kim"), 4), false);
});

test("the review shows up in each person's queue and the handover note", () => {
  const asked = requestReview(readyForReview(), "Riley Kim");
  assert.deepEqual(
    myQueue(setMe(asked, "t-riley")).map((i) => i.kind),
    ["review"],
  );
  assert.ok(!myQueue(asked).some((i) => i.kind === "review"));
  assert.ok(
    nextActions(asked).some(
      (a) => a.id === "review-details" && a.owner === "Riley Kim",
    ),
  );
  const withNote = addNote(
    asked,
    { kind: "question", id: "q-emergency" },
    "Customer sounded unsure on the call",
  );
  const text = handoverNote(withNote);
  assert.match(text, /^Handover · Oakwood Property Group/);
  assert.match(text, /Owner now: Avery Morgan/);
  assert.ok(
    text.includes("Second-person review: Requested (Riley Kim, round 1)"),
  );
  assert.match(text, /Customer sounded unsure on the call/);
  assert.match(text, /Waived “/);
});
