import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  packageFiles,
  readiness,
  reviewAnswer,
  submitAnswer,
  updateQuestion,
  zipFiles,
} from "../app/prototype/state.ts";

function sentState() {
  return {
    ...initialState,
    requestSent: true,
    questions: initialState.questions.map((q) =>
      ["q-emergency", "q-integration"].includes(q.id)
        ? { ...q, status: "Sent" }
        : q,
    ),
  };
}

test("customer answer is evidence until separate staff approval; amendment reopens knowledge", () => {
  const sent = sentState();
  const first = submitAnswer(
    sent,
    "q-emergency",
    "On-call supervisor, then front desk callback",
    "answer",
  );
  assert.equal(first.questions[0].revisions.length, 1);
  assert.equal(
    first.knowledge.find((k) => k.id === "emergency").status,
    "Needs clarification",
  );
  assert.equal(readiness(first).ready, false);
  const reviewed = reviewAnswer(first, "q-emergency");
  assert.equal(
    reviewed.knowledge.find((k) => k.id === "emergency").status,
    "Customer confirmed",
  );
  assert.equal(
    readiness(reviewed).ready,
    false,
    "integration owner remains unresolved",
  );
  const integrated = reviewAnswer(
    submitAnswer(
      reviewed,
      "q-integration",
      "Maya authorizes read-only lookups; take a message on outage",
      "answer",
    ),
    "q-integration",
  );
  assert.equal(readiness(integrated).ready, true);
  assert.match(
    packageFiles(integrated)["03-team-and-routing.md"],
    /On-call supervisor/i,
  );
  const exported = {
    ...integrated,
    packageSnapshot: integrated.knowledgeRevision,
  };
  assert.equal(readiness(exported).stale, false);
  const amended = submitAnswer(
    exported,
    "q-emergency",
    "Actually route to front desk first",
    "answer",
  );
  assert.equal(amended.questions[0].revisions.length, 2);
  assert.equal(amended.questions[0].reviewedRevision, 1);
  assert.equal(readiness(amended).ready, false);
  assert.equal(readiness(amended).stale, true);
  assert.doesNotMatch(
    packageFiles(amended)["03-team-and-routing.md"],
    /weekend flooding/i,
  );
  assert.match(packageFiles(amended)["07-open-items.md"], /Critical/);
});

test("unknown or delegated answers do not confirm knowledge; unsent questions reject submissions", () => {
  assert.equal(
    submitAnswer(initialState, "q-emergency", "x", "answer"),
    initialState,
  );
  const sent = sentState();
  const unknown = submitAnswer(sent, "q-emergency", "", "unknown");
  assert.equal(reviewAnswer(unknown), unknown);
  assert.equal(readiness(unknown).ready, false);
  const delegate = submitAnswer(sent, "q-integration", "", "delegate");
  assert.equal(delegate.questions[1].revisions[0].kind, "delegate");
});

test("package content and ZIP bytes are deterministic for identical state", () => {
  const files = packageFiles(initialState);
  assert.equal(Object.keys(files).length, 8);
  assert.doesNotMatch(files["03-team-and-routing.md"], /front desk first/i);
  assert.match(files["07-open-items.md"], /weekend emergency routing/i);
  assert.deepEqual(files, packageFiles(initialState));
  const first = zipFiles(files);
  const second = zipFiles(packageFiles(initialState));
  assert.deepEqual(first, second);
  assert.equal(new DataView(first.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(
    new DataView(first.buffer).getUint32(first.length - 22, true),
    0x06054b50,
  );
  assert.equal(
    new DataView(first.buffer).getUint16(first.length - 12, true),
    8,
  );
  const edited = updateQuestion(initialState, "q-emergency", {
    text: "Edited by specialist",
    status: "Ready to send",
  });
  assert.equal(edited.questions[0].text, "Edited by specialist");
  assert.equal(initialState.questions[0].status, "AI draft");
});
