"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Item = {
  item_id: string;
  kind: "confirm_rule" | "question";
  question: string;
  answer_type: string;
  choices: string[];
  proposed_rule: {
    title: string;
    statement: string;
    scope: string | null;
    conditions: string[];
    action: string | null;
  } | null;
  excerpts: { text: string; source: string }[];
  allowed_responses: string[];
  locked: boolean;
  current_response: {
    response_type: string;
    answer: Record<string, unknown>;
    version: number;
    submitted_at: string;
  } | null;
};
type Page = {
  organization: string;
  sender: string;
  recipient: { name: string; role: string };
  title: string;
  message: string | null;
  expires_at: string;
  total: number;
  answered: number;
  outstanding: number;
  notice: string;
  items: Item[];
};
type Draft = {
  type: string;
  text: string;
  choice: string;
  choices: string[];
  comment: string;
  corrected: string;
  dirty: boolean;
};
type Saved = { at: string; saved: number; outstanding: number };

const LABELS: Record<string, string> = {
  confirm: "Yes, this is correct",
  request_correction: "This needs a correction",
  cannot_confirm: "I can't confirm this",
  answer: "Answer",
};

function newId() {
  // getRandomValues also works on plain-HTTP origins, unlike crypto.randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function draftFrom(item: Item): Draft {
  const current = item.current_response;
  const answer = (current?.answer || {}) as Record<string, string | string[]>;
  return {
    type: current?.response_type || "",
    text: (answer.text as string) || "",
    choice: (answer.choice as string) || "",
    choices: (answer.choices as string[]) || [],
    comment: (answer.comment as string) || "",
    corrected: (answer.corrected_statement as string) || "",
    dirty: false,
  };
}

async function fail(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const detail = body.detail;
  throw new Error(
    typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((d: { msg: string }) => d.msg).join("; ")
        : "Something went wrong. Please try again.",
  );
}

export default function CustomerReview({ token }: { token: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [problem, setProblem] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const submission = useRef<string | null>(null);
  const url = `/api/public/review/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (response.status === 404 || response.status === 410) {
      const body = await response.json().catch(() => ({}));
      setUnavailable(body.detail || "This review link is not available.");
      return;
    }
    if (!response.ok) return fail(response);
    const data: Page = await response.json();
    setPage(data);
    setDrafts(
      Object.fromEntries(data.items.map((i) => [i.item_id, draftFrom(i)])),
    );
  }, [url]);

  useEffect(() => {
    Promise.resolve()
      .then(load)
      .catch((reason) => setProblem(String(reason.message || reason)));
  }, [load]);

  function update(id: string, patch: Partial<Draft>) {
    submission.current = null; // edited content gets a fresh retry key
    setSaved(null);
    setDrafts((old) => ({
      ...old,
      [id]: { ...old[id], ...patch, dirty: true },
    }));
  }

  async function save() {
    if (!page) return;
    const responses = page.items
      .filter(
        (i) => drafts[i.item_id]?.dirty && drafts[i.item_id].type && !i.locked,
      )
      .map((i) => {
        const d = drafts[i.item_id];
        const answer: Record<string, unknown> = {};
        if (d.comment.trim()) answer.comment = d.comment;
        if (d.type === "answer") {
          if (i.answer_type === "free_text") answer.text = d.text;
          else if (i.answer_type === "multiple_choice")
            answer.choices = d.choices;
          else answer.choice = d.choice;
        }
        if (d.type === "request_correction" && d.corrected.trim())
          answer.corrected_statement = d.corrected;
        return { item_id: i.item_id, response_type: d.type, answer };
      });
    if (responses.length === 0) {
      setProblem("Choose a response for at least one item before saving.");
      return;
    }
    setBusy(true);
    setProblem("");
    submission.current ??= newId();
    try {
      const response = await fetch(`${url}/responses`, {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submission.current, responses }),
      });
      if (!response.ok) await fail(response);
      const result = await response.json();
      submission.current = null;
      setSaved({
        at: result.submitted_at,
        saved: result.saved.length,
        outstanding: result.outstanding,
      });
      await load();
    } catch (reason) {
      setProblem(
        reason instanceof Error
          ? reason.message
          : "We could not save your answers. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (unavailable)
    return (
      <main className="customer">
        <h1>Review request</h1>
        <p role="alert" className="error">
          {unavailable}
        </p>
      </main>
    );
  if (!page)
    return (
      <main className="customer">
        <p>{problem || "Loading your review request…"}</p>
      </main>
    );

  return (
    <main className="customer">
      <p className="eyebrow">{page.organization.toUpperCase()}</p>
      <h1>{page.title}</h1>
      <p className="lead">
        Prepared for {page.recipient.name} by the {page.sender.toLowerCase()}.
        {page.message ? ` ${page.message}` : ""}
      </p>
      <p className="subtle">
        {page.total} item{page.total === 1 ? "" : "s"} · {page.outstanding}{" "}
        still to answer · link valid until{" "}
        {new Date(page.expires_at).toLocaleString()}
      </p>
      {saved && (
        <div className="saved-banner" role="status">
          <strong>Your answers were saved.</strong> {saved.saved} item
          {saved.saved === 1 ? "" : "s"} recorded at{" "}
          {new Date(saved.at).toLocaleString()}.{" "}
          {saved.outstanding === 0
            ? "Everything has an answer. You can change answers until the link expires."
            : `${saved.outstanding} item${saved.outstanding === 1 ? "" : "s"} still need an answer; you can return to this link.`}
        </div>
      )}
      {problem && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
      {page.items.map((item, index) => {
        const draft = drafts[item.item_id];
        if (!draft) return null;
        const rule = item.proposed_rule;
        return (
          <section className="customer-item" key={item.item_id}>
            <p className="eyebrow">
              ITEM {index + 1} OF {page.total}
              {item.current_response ? " · ANSWERED" : ""}
            </p>
            <h2>{item.question}</h2>
            {rule && (
              <div className="rule-box">
                <strong>{rule.title}</strong>
                <p>{rule.statement}</p>
                <small>
                  Applies to: {rule.scope}
                  {rule.conditions.length
                    ? ` · when ${rule.conditions.join(", ")}`
                    : ""}
                  {rule.action ? ` · ${rule.action}` : ""}
                </small>
              </div>
            )}
            {item.excerpts.map((e, i) => (
              <blockquote key={i}>
                {e.text}
                <footer>From: {e.source}</footer>
              </blockquote>
            ))}
            {item.locked ? (
              <p className="subtle">
                This item was already confirmed and recorded by the
                implementation team. Contact them to change it.
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <fieldset>
                  <legend>Your response</legend>
                  {item.allowed_responses.map((type) => (
                    <label className="choice" key={type}>
                      <input
                        type="radio"
                        name={`type-${item.item_id}`}
                        checked={draft.type === type}
                        onChange={() => update(item.item_id, { type })}
                      />
                      {type === "cannot_confirm" && item.kind === "question"
                        ? "I can't answer this"
                        : LABELS[type]}
                    </label>
                  ))}
                </fieldset>
                {draft.type === "answer" &&
                  item.answer_type === "free_text" && (
                    <label>
                      Your answer
                      <textarea
                        rows={3}
                        maxLength={4000}
                        value={draft.text}
                        onChange={(e) =>
                          update(item.item_id, { text: e.target.value })
                        }
                      />
                    </label>
                  )}
                {draft.type === "answer" &&
                  (item.answer_type === "yes_no" ||
                    item.answer_type === "single_choice") && (
                    <fieldset>
                      <legend>Choose one</legend>
                      {(item.answer_type === "yes_no"
                        ? ["yes", "no"]
                        : item.choices
                      ).map((c) => (
                        <label className="choice" key={c}>
                          <input
                            type="radio"
                            name={`choice-${item.item_id}`}
                            checked={draft.choice === c}
                            onChange={() => update(item.item_id, { choice: c })}
                          />
                          {c}
                        </label>
                      ))}
                    </fieldset>
                  )}
                {draft.type === "answer" &&
                  item.answer_type === "multiple_choice" && (
                    <fieldset>
                      <legend>Choose all that apply</legend>
                      {item.choices.map((c) => (
                        <label className="choice" key={c}>
                          <input
                            type="checkbox"
                            checked={draft.choices.includes(c)}
                            onChange={(e) =>
                              update(item.item_id, {
                                choices: e.target.checked
                                  ? [...draft.choices, c]
                                  : draft.choices.filter((x) => x !== c),
                              })
                            }
                          />
                          {c}
                        </label>
                      ))}
                    </fieldset>
                  )}
                {draft.type === "request_correction" && (
                  <label>
                    How should it read?
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={draft.corrected}
                      onChange={(e) =>
                        update(item.item_id, { corrected: e.target.value })
                      }
                    />
                  </label>
                )}
                <label>
                  Comment (optional)
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={draft.comment}
                    onChange={(e) =>
                      update(item.item_id, { comment: e.target.value })
                    }
                  />
                </label>
              </form>
            )}
          </section>
        );
      })}
      <button className="save-all" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save my answers"}
      </button>
      <p className="subtle">
        You can save part of your answers now and come back later. {page.notice}
      </p>
    </main>
  );
}
