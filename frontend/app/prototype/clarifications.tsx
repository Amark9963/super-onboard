"use client";

import { useState } from "react";
import {
  contactByName,
  coverageOf,
  factById,
  questionCritical,
  requestReadableCopy,
  reviewAnswer,
  sendRequest,
  sentQuestionIds,
  updateQuestion,
  waiveFact,
  type Question,
} from "./state";
import { Notes } from "./notes";
import { Avatar, Empty, Person, Tag, type Ctx } from "./ui";

const SENT = ["Sent", "Response received", "Resolved", "Defaulted"];
const STEPS = ["Drafted", "Wording approved", "Sent", "Answered", "Approved"];
const stepIndex = (q: Question) =>
  q.status === "AI draft"
    ? 0
    : q.status === "Ready to send"
      ? 1
      : q.status === "Sent"
        ? 2
        : q.status === "Response received"
          ? 3
          : 4;

export function ClarificationsTab({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const questions = [...state.questions].sort(
    (a, b) =>
      Number(questionCritical(state, b)) - Number(questionCritical(state, a)),
  );
  const gaps = state.facts.filter(
    (f) =>
      !f.critical &&
      coverageOf(f) === "empty" &&
      state.addedSources.length > 0 &&
      !state.questions.some(
        (q) => q.factIds.includes(f.id) && SENT.includes(q.status),
      ) &&
      !(f.id === "F4" && state.copyRequested),
  );
  const people = [...new Set(questions.map((q) => q.recipient))];
  const firstActionable =
    questions.find(
      (q) => q.status !== "Resolved" && q.status !== "Defaulted",
    ) ?? questions[0];
  const [selected, setSelected] = useState<string>(
    firstActionable?.id ?? (gaps[0] ? `gap:${gaps[0].id}` : ""),
  );

  if (questions.length === 0 && gaps.length === 0)
    return (
      <Empty title="No questions yet">
        Questions are drafted when the contradiction check finds a conflict or
        an open critical detail. Run it from the Documents tab.
      </Empty>
    );

  const q = questions.find((x) => x.id === selected);
  const gap = selected.startsWith("gap:")
    ? factById(state, selected.slice(4))
    : undefined;
  return (
    <div className="v3-master">
      <aside className="v3-list" aria-label="Questions">
        {people.map((p) => (
          <div key={p}>
            <div className="v3-listgroup">
              <Person
                name={p}
                role={contactByName(state, p)?.role}
                side="customer"
              />
            </div>
            {questions
              .filter((x) => x.recipient === p)
              .map((x) => (
                <button
                  key={x.id}
                  className={`v3-listitem ${selected === x.id ? "active" : ""}`}
                  onClick={() => setSelected(x.id)}
                >
                  <span className="t">{x.title}</span>
                  <span className="m">
                    {questionCritical(state, x) && (
                      <Tag kind="red">Blocks launch</Tag>
                    )}
                    <Tag>{x.status}</Tag>
                  </span>
                </button>
              ))}
          </div>
        ))}
        {gaps.length > 0 && (
          <div>
            <div className="v3-listgroup">
              <Avatar name="Gaps" side="team" />
              <strong>Open gaps</strong>
            </div>
            {gaps.map((g) => (
              <button
                key={g.id}
                className={`v3-listitem ${selected === `gap:${g.id}` ? "active" : ""}`}
                onClick={() => setSelected(`gap:${g.id}`)}
              >
                <span className="t">{g.label}</span>
                <span className="m">
                  <Tag kind="red">Not received</Tag>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>
      <section className="v3-detail">
        {q && <QuestionDetail ctx={ctx} q={q} />}
        {gap && <GapDetail key={gap.id} ctx={ctx} fid={gap.id} />}
        {!q && !gap && <Empty title="Select an item" />}
      </section>
    </div>
  );
}

function QuestionDetail({ ctx, q }: { ctx: Ctx; q: Question }) {
  const { state, update, flash, go, setPortalName } = ctx;
  const critical = questionCritical(state, q);
  const idx = stepIndex(q);
  const person = contactByName(state, q.recipient);
  const pending = q.revisions.length > q.reviewedRevision;
  const ready = state.questions.filter(
    (x) => x.recipient === q.recipient && x.status === "Ready to send",
  );
  return (
    <>
      <header className="v3-detailhead">
        <div>
          <p className="v3-mono">
            QUESTION · {critical ? "BLOCKS LAUNCH" : "NON-CRITICAL"}
          </p>
          <h2>{q.title}</h2>
        </div>
        <Person name={q.recipient} role={person?.role} side="customer" />
      </header>
      <ol className="v3-progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < idx ? "done" : i === idx ? "now" : ""}>
            <b>{i < idx ? "✓" : i + 1}</b> {s}
          </li>
        ))}
      </ol>
      {q.status === "AI draft" ? (
        <label className="v3-field">
          Question wording (AI draft, edit before approving)
          <textarea
            value={q.text}
            onChange={(e) =>
              update((s) => updateQuestion(s, q.id, { text: e.target.value }))
            }
          />
        </label>
      ) : (
        <blockquote className="v3-question">{q.text}</blockquote>
      )}
      <dl className="v3-props wide">
        <dt>Why we are asking</dt>
        <dd>{q.why}</dd>
        <dt>Sources</dt>
        <dd>{q.source}</dd>
        <dt>Options offered</dt>
        <dd>
          <ul>
            {q.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </dd>
        <dt>If nobody replies</dt>
        <dd>
          {q.defaultIfNoReply
            ? `Proceed on: ${q.defaultIfNoReply}`
            : "No default. This needs a customer answer before launch."}
        </dd>
      </dl>
      {q.revisions.length > 0 && (
        <div className="v3-thread">
          <p className="v3-mono">REPLIES</p>
          {q.revisions.map((r, i) => (
            <div className="v3-bubble" key={i}>
              <Avatar name={q.recipient} side="customer" />
              <div>
                <strong>{q.recipient}</strong>{" "}
                <small className="v3-muted">{r.at}</small>
                <p>
                  {r.kind === "answer"
                    ? r.value
                    : r.kind === "unknown"
                      ? "“I don’t know”"
                      : "“Someone else should answer”"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="v3-actions">
        {q.status === "AI draft" && (
          <button
            className="v3-btn"
            onClick={() =>
              update((s) =>
                updateQuestion(s, q.id, { status: "Ready to send" }),
              )
            }
          >
            Approve wording
          </button>
        )}
        {q.status === "Ready to send" && (
          <button
            className="v3-btn"
            onClick={() => {
              update((s) => sendRequest(s, q.recipient, [q.id]));
              setPortalName(q.recipient);
              flash(
                `Simulated: sent to ${q.recipient}. No email or link was generated.`,
              );
            }}
          >
            Send to {q.recipient}
            {ready.length > 1 ? ` (1 of ${ready.length} ready)` : ""}
          </button>
        )}
        {pending && q.revisions[q.revisions.length - 1].kind === "answer" && (
          <button
            className="v3-btn"
            onClick={() => {
              update((s) => reviewAnswer(s, q.id));
              flash("Approved. The linked details are now customer-confirmed.");
            }}
          >
            Approve instruction
          </button>
        )}
        {sentQuestionIds(state, q.recipient).includes(q.id) && (
          <button
            className="v3-btn secondary"
            onClick={() => {
              setPortalName(q.recipient);
              go("portal");
            }}
          >
            Open {q.recipient.split(" ")[0]}’s answer form
          </button>
        )}
      </div>
      <Notes ctx={ctx} target={{ kind: "question", id: q.id }} />
    </>
  );
}

function GapDetail({ ctx, fid }: { ctx: Ctx; fid: string }) {
  const { state, update } = ctx;
  const f = factById(state, fid)!;
  const [reason, setReason] = useState("");
  return (
    <>
      <header className="v3-detailhead">
        <div>
          <p className="v3-mono">OPEN GAP · {f.area.toUpperCase()}</p>
          <h2>{f.label}</h2>
        </div>
        <Person
          name={state.client!.owner}
          role="Onboarding specialist"
          side="team"
        />
      </header>
      <p>{f.note ?? "This required detail has no value yet."}</p>
      <div className="v3-actions">
        {f.id === "F4" && state.addedSources.includes("scan") && (
          <button
            className="v3-btn"
            disabled={state.copyRequested}
            onClick={() => update(requestReadableCopy)}
          >
            {state.copyRequested
              ? "Readable copy requested"
              : "Request a readable copy"}
          </button>
        )}
      </div>
      <label className="v3-field">
        Or waive it with a reason (recorded as a risk)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: not needed for launch"
          aria-label={`Reason to waive ${f.label}`}
        />
      </label>
      <div className="v3-actions">
        <button
          className="v3-btn secondary"
          disabled={!reason.trim()}
          onClick={() => update((s) => waiveFact(s, fid, reason))}
        >
          Waive with reason
        </button>
      </div>
      <Notes ctx={ctx} target={{ kind: "fact", id: fid }} />
    </>
  );
}
