"use client";

import { useState } from "react";
import {
  allSources,
  claims,
  consistencyReport,
  contactByName,
  factById,
  reopenQuestion,
  requestReadableCopy,
  resolveInternally,
  reviewSource,
  runConsistencyCheck,
  sourceCatalog,
  uploadSource,
  type Source,
} from "./state";
import { documentRows } from "./client";
import { Person, Tag, type Ctx } from "./ui";

function Extraction({ ctx, src }: { ctx: Ctx; src: Source }) {
  const { state, update } = ctx;
  const reviewed = state.reviewedSources.includes(src.id);
  if (src.fills.length === 0)
    return (
      <div className="v3-extract">
        <p className="v3-muted">
          {src.parse === "Needs attention"
            ? "No text could be read from this file. "
            : "Nothing from this file goes into the spec. "}
          {src.note}
        </p>
      </div>
    );
  return (
    <div className="v3-extract">
      <p className="v3-mono">
        SIMULATED EXTRACTION · {src.fills.length} SETUP DETAIL
        {src.fills.length === 1 ? "" : "S"} READ
      </p>
      <ul>
        {src.fills.map((f) => (
          <li key={f.factId}>
            <strong>{factById(state, f.factId)?.label}</strong>
            <span> {f.value}</span>
            <small className="v3-muted">
              {f.anchor} · “{f.evidence}”
            </small>
          </li>
        ))}
      </ul>
      {reviewed ? (
        <Tag kind="green">Extraction checked</Tag>
      ) : (
        <button
          className="v3-btn secondary"
          onClick={() => update((s) => reviewSource(s, src.id))}
        >
          Looks right
        </button>
      )}
    </div>
  );
}

export function DocumentsTab({ ctx }: { ctx: Ctx }) {
  const { state, update, flash, go } = ctx;
  const rows = documentRows(state);
  const draftSrc = sourceCatalog.find((s) => s.id === "prompt-draft")!;
  const later = allSources(state).filter((s) => s.later);
  const missing = rows.filter((r) => r.status === "Not received");
  const report = consistencyReport(state);
  const drafted = state.questions.length;
  const [reading, setReading] = useState<string[]>([]);
  /** Simulated: a short "reading file" step, then the extraction results appear. */
  function startUpload(ids: string[]) {
    ids.forEach((id, i) => {
      setReading((r) => (r.includes(id) ? r : [...r, id]));
      window.setTimeout(
        () => {
          update((s) => uploadSource(s, id));
          setReading((r) => r.filter((x) => x !== id));
        },
        800 + i * 500,
      );
    });
  }
  const readingNow = (id: string) => reading.includes(id);
  return (
    <>
      <section className="v3-card">
        <div className="v3-cardhead">
          <div>
            <h3>Documents</h3>
            <p className="v3-muted">
              Uploads and extraction are simulated with sample files. A real
              tool would read each file.
            </p>
          </div>
        </div>
        <button
          className={`v3-dropzone ${reading.length ? "busy" : ""}`}
          disabled={missing.length === 0 || reading.length > 0}
          onClick={() => {
            startUpload(missing.map((r) => r.sourceId));
            flash("Simulated: reading the sample documents.");
          }}
        >
          <span className="icon">⬆</span>
          <strong>
            {missing.length === 0
              ? "All requested documents received"
              : reading.length
                ? "Reading files…"
                : `Drop files here, or click to add the ${missing.length} sample document${missing.length === 1 ? "" : "s"}`}
          </strong>
          <small>
            Simulated: nothing is uploaded from your computer. Sample files
            stand in for the customer’s documents.
          </small>
        </button>
        {rows.map((r) => (
          <div className="v3-doc" key={r.sourceId}>
            <div className="line">
              <div className="what">
                <i className="v3-file">
                  {r.source.type.split(" ")[0].slice(0, 4).toUpperCase()}
                </i>
                <span>
                  <strong>{r.label}</strong>
                  <small>
                    {r.source.title} · {r.source.type}
                  </small>
                </span>
              </div>
              <Person name={r.assignee} role={r.role} side={r.side} />
              <Tag kind={readingNow(r.sourceId) ? "blue" : undefined}>
                {readingNow(r.sourceId) ? "Reading file…" : r.status}
              </Tag>
              {r.status === "Not received" ? (
                <button
                  className="v3-btn secondary"
                  disabled={readingNow(r.sourceId)}
                  onClick={() => startUpload([r.sourceId])}
                >
                  {readingNow(r.sourceId) ? "Reading…" : "Upload sample"}
                </button>
              ) : (
                <span className="v3-muted">
                  {r.source.fills.length
                    ? `${r.source.fills.length} detail${r.source.fills.length === 1 ? "" : "s"} read`
                    : "—"}
                </span>
              )}
            </div>
            {readingNow(r.sourceId) && (
              <div className="v3-reading" role="status">
                <span className="bar" />
                <small>
                  Reading “{r.source.title}” and matching it to the spec…
                  (simulated)
                </small>
              </div>
            )}
            {r.status !== "Not received" && (
              <Extraction ctx={ctx} src={r.source} />
            )}
            {r.status === "Needs a readable copy" && (
              <div className="v3-actions">
                <button
                  className="v3-btn secondary"
                  disabled={state.copyRequested}
                  onClick={() => update(requestReadableCopy)}
                >
                  {state.copyRequested
                    ? "Readable copy requested"
                    : "Request a readable copy"}
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="v3-doc optional">
          <div className="line">
            <div className="what">
              <i className="v3-file">MD</i>
              <span>
                <strong>Our draft agent instructions</strong>
                <small>Optional · checked for contradictions too</small>
              </span>
            </div>
            <Person
              name={state.client!.owner}
              side="team"
              role="Onboarding specialist"
            />
            <Tag kind={readingNow(draftSrc.id) ? "blue" : undefined}>
              {readingNow(draftSrc.id)
                ? "Reading file…"
                : state.addedSources.includes(draftSrc.id)
                  ? "Received"
                  : "Not received"}
            </Tag>
            {!state.addedSources.includes(draftSrc.id) ? (
              <button
                className="v3-btn secondary"
                disabled={readingNow(draftSrc.id)}
                onClick={() => startUpload([draftSrc.id])}
              >
                Add draft
              </button>
            ) : (
              <span className="v3-muted">—</span>
            )}
          </div>
        </div>
        {later.map((s) => (
          <div className="v3-doc" key={s.id}>
            <div className="line">
              <div className="what">
                <i className="v3-file">EML</i>
                <span>
                  <strong>{s.title}</strong>
                  <small>Arrived later · {s.type}</small>
                </span>
              </div>
              <Person
                name={s.suppliedBy}
                role={contactByName(state, s.suppliedBy)?.role}
                side="customer"
              />
              <Tag>Received</Tag>
              <span className="v3-muted">
                {s.fills.length} detail{s.fills.length === 1 ? "" : "s"} read
              </span>
            </div>
            <Extraction ctx={ctx} src={s} />
          </div>
        ))}
      </section>

      <section className="v3-card">
        <div className="v3-cardhead">
          <div>
            <h3>Contradictions</h3>
            <p className="v3-muted">
              {state.addedSources.length === 0
                ? "Upload documents first."
                : !report.ran
                  ? `${report.claimsChecked} statements from ${report.sourcesChecked} sources are waiting to be compared.`
                  : report.stale
                    ? "A new document arrived after the last check. Run it again."
                    : `${report.conflicts.length} conflict${report.conflicts.length === 1 ? "" : "s"} found · ${report.open.length} open · ${report.variations.length} legitimate variation${report.variations.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <button
            className={`v3-btn ${report.ran && !report.stale ? "secondary" : ""}`}
            disabled={state.addedSources.length === 0}
            onClick={() => {
              update(runConsistencyCheck);
              flash(
                "Contradiction check run on the documents and our draft instructions.",
              );
            }}
          >
            {report.ran ? "Run again" : "Detect contradictions"}
          </button>
        </div>
        {report.ran &&
          report.conflicts.map((c) => (
            <ConflictCard key={c.id} ctx={ctx} c={c} />
          ))}
        {report.ran &&
          report.variations.map((v) => (
            <article className="v3-conflict calm" key={v.id}>
              <header>
                <span className="v3-mono">
                  NOT A CONFLICT · {v.topicLabel.toUpperCase()}
                </span>
                <Tag kind="gray">Different scopes</Tag>
              </header>
              <div className="evidence">
                {v.claimIds.map((id) => {
                  const cl = claims.find((x) => x.id === id)!;
                  return (
                    <div className="row" key={id}>
                      <span className="label">{cl.scope.toUpperCase()}</span>
                      <span>{cl.value}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        {report.ran && drafted > 0 && (
          <div className="v3-cta">
            <span>
              <strong>
                {drafted} question{drafted === 1 ? "" : "s"} drafted
              </strong>{" "}
              for {new Set(state.questions.map((q) => q.recipient)).size}{" "}
              customer contact
              {new Set(state.questions.map((q) => q.recipient)).size === 1
                ? ""
                : "s"}
              .
            </span>
            <button
              className="v3-btn"
              onClick={() => go("client", "clarifications")}
            >
              Review and send for clarification →
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function ConflictCard({
  ctx,
  c,
}: {
  ctx: Ctx;
  c: ReturnType<typeof consistencyReport>["conflicts"][number];
}) {
  const { state, update, go } = ctx;
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const q = state.questions.find((x) => x.id === c.questionId);
  return (
    <article className={`v3-conflict ${c.resolved ? "resolved" : "open"}`}>
      <header>
        <span className="v3-mono">
          {c.needs === "customer" ? "SOURCES DISAGREE" : "OUR DRAFT DISAGREES"}{" "}
          · {c.topicLabel.toUpperCase()} · {c.scope.toUpperCase()}
        </span>
        <Tag kind={c.resolved ? "green" : "red"}>
          {c.resolved ? "Resolved" : "Open"}
        </Tag>
      </header>
      <div className="evidence">
        {c.claimIds.map((id, i) => {
          const cl = claims.find((x) => x.id === id)!;
          const src = allSources(state).find((x) => x.id === cl.sourceId);
          return (
            <div className="row hit" key={id}>
              <span className="label">{i === 0 ? "A" : "B"}</span>
              <span>
                “{cl.quote}”
                <small>
                  {src?.title} · {cl.anchor}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <footer>
        {c.resolved ? (
          <span>
            <strong>
              {c.resolution?.how === "internal fix"
                ? "Fixed in our draft"
                : c.resolution?.how === "default"
                  ? "Proceeding on default (unconfirmed)"
                  : "Customer answer approved"}
              :
            </strong>{" "}
            {c.resolution?.note}
          </span>
        ) : c.needs === "customer" ? (
          q && (q.status === "Resolved" || q.status === "Defaulted") ? (
            <button
              className="v3-btn"
              onClick={() => update((s) => reopenQuestion(s, q.id))}
            >
              New evidence: ask {q.recipient} again
            </button>
          ) : q ? (
            <>
              <span className="v3-assigned">
                Assigned to{" "}
                <Person
                  name={q.recipient}
                  role={contactByName(state, q.recipient)?.role}
                  side="customer"
                  compact
                />
              </span>
              <button
                className="v3-btn secondary"
                onClick={() => go("client", "clarifications")}
              >
                Open in Clarifications
              </button>
            </>
          ) : (
            <span className="v3-muted">
              Run the check to draft the question.
            </span>
          )
        ) : (
          <div className="v3-fix">
            <strong>Which instruction is intended?</strong>
            {c.claimIds.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name={`fix-${c.id}`}
                  checked={choice === id}
                  onChange={() => setChoice(id)}
                />{" "}
                {claims.find((x) => x.id === id)?.value}
              </label>
            ))}
            <label className="v3-field">
              Reason, recorded with the fix
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              className="v3-btn"
              disabled={!choice || !note.trim()}
              onClick={() =>
                update((s) => resolveInternally(s, c.id, choice, note))
              }
            >
              Record fix
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
