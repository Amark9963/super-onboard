"use client";

import { useState } from "react";
import { addNote, mentionsIn, me, notesFor } from "./collab";
import type { NoteTarget, TeamMember } from "./state";
import { Avatar, type Ctx } from "./ui";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The text with @mentions of real team members highlighted. */
function Marked({ text, team }: { text: string; team: TeamMember[] }) {
  const names = team
    .filter((m) => m.status === "Active")
    .flatMap((m) => [m.name, m.name.split(" ")[0]])
    .sort((a, b) => b.length - a.length)
    .map(escape);
  if (!names.length) return <>{text}</>;
  const parts = text.split(
    new RegExp(`(@(?:${names.join("|")}))(?![\\p{L}\\p{N}])`, "iu"),
  );
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark className="v3-mention" key={i}>
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/**
 * Internal notes on one item. Only our team sees these; the customer portal never does. Typing
 * @name mentions a teammate, who then finds it in their queue.
 */
export function Notes({
  ctx,
  target,
  collapsed,
  label = "Team notes",
}: {
  ctx: Ctx;
  target: NoteTarget;
  /** Fold the thread away until it is opened (used on long lists). */
  collapsed?: boolean;
  label?: string;
}) {
  const { state, update, flash } = ctx;
  const [text, setText] = useState("");
  const notes = notesFor(state, target);
  const author = me(state);
  const others = state.team.filter(
    (m) => m.status === "Active" && m.id !== state.me,
  );
  const body = (
    <div className="v3-notes">
      <p className="v3-muted">
        Internal. The customer never sees these. Type @ and a name to mention a
        teammate.
      </p>
      {notes.map((n) => (
        <div className="v3-note" key={n.id}>
          <Avatar name={n.author} side="team" />
          <div>
            <strong>{n.author}</strong>{" "}
            <small className="v3-muted">{n.at}</small>
            <p>
              <Marked text={n.text} team={state.team} />
            </p>
          </div>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const mentioned = mentionsIn(state.team, text).filter(
            (n) => n !== author?.name,
          );
          update((s) => addNote(s, target, text));
          setText("");
          if (mentioned.length)
            flash(
              `Simulated: ${mentioned.join(" and ")} would be notified in Slack and see this in their queue.`,
            );
        }}
      >
        <label className="v3-field">
          <span className="sr">Add a team note</span>
          <textarea
            aria-label="Add a team note"
            rows={2}
            value={text}
            placeholder={`Write a note as ${author?.name ?? "you"}…`}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="v3-mentionbar">
          {others.map((m) => (
            <button
              type="button"
              className="v3-chip"
              key={m.id}
              onClick={() =>
                setText(
                  (t) =>
                    `${t}${t && !t.endsWith(" ") ? " " : ""}@${m.name.split(" ")[0]} `,
                )
              }
            >
              @{m.name.split(" ")[0]}
            </button>
          ))}
          <button
            className="v3-btn secondary"
            type="submit"
            disabled={!text.trim()}
          >
            Add note
          </button>
        </div>
      </form>
    </div>
  );
  if (collapsed)
    return (
      <details className="v3-evidence v3-notesfold">
        <summary>
          {label}
          {notes.length ? ` · ${notes.length}` : ""}
        </summary>
        {body}
      </details>
    );
  return (
    <section className="v3-notesblock">
      <p className="v3-mono">
        {label.toUpperCase()}
        {notes.length ? ` · ${notes.length}` : ""} · INTERNAL
      </p>
      {body}
    </section>
  );
}
