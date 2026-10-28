"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Readiness = {
  state: string;
  approved_count: number;
  pending_confirmation_count: number;
  pending_revision_count: number;
  open_high_conflict_count: number;
  note: string;
};
type Approval = {
  requirement_version_id: string;
  version: number;
  title: string;
  statement: string;
  scope: string;
  approved: boolean;
  blockers: string[];
};
type Artifact = {
  id: string;
  kind: string;
  version: number;
  stale: boolean;
  exclusions: { title: string; reason: string }[];
  requirement_version_ids: string[];
  created_at: string;
};
type Conflict = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  resolved: boolean;
  members: { id: string; title: string; statement: string }[];
};
type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  actor_type: string;
  created_at: string;
  detail: Record<string, unknown> | null;
};
type Answer = {
  response_id: string;
  conflict_id: string | null;
  response_type: string;
  answer: Record<string, unknown>;
  question: string;
};

const words = (value: string) => value.replaceAll("_", " ");

export function OutputsPanel(props: {
  projectId: string;
  csrf: string;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, onError } = props;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [audit, setAudit] = useState<{
    total: number;
    items: AuditEvent[];
  } | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<{
    markdown: string;
    stale: boolean;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosenConflict, setChosenConflict] = useState("");
  const [chosenResponse, setChosenResponse] = useState("");
  const [chosenRule, setChosenRule] = useState("");
  const [resolution, setResolution] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [revisionReason, setRevisionReason] = useState("");

  const refresh = useCallback(async () => {
    const [status, rules, exports, groups, inbox, trail] = await Promise.all([
      api<Readiness>(`/projects/${projectId}/readiness`),
      api<Approval[]>(`/projects/${projectId}/approvals`),
      api<Artifact[]>(`/projects/${projectId}/artifacts`),
      api<Conflict[]>(`/projects/${projectId}/conflicts`),
      api<Answer[]>(`/projects/${projectId}/responses`),
      api<{ total: number; items: AuditEvent[] }>(
        `/projects/${projectId}/audit?limit=40`,
      ),
    ]);
    setReadiness(status);
    setApprovals(rules);
    setArtifacts(exports);
    setConflicts(groups);
    setAnswers(inbox);
    setAudit(trail);
  }, [projectId]);

  useEffect(() => {
    Promise.resolve()
      .then(() => refresh())
      .catch((error) => onError(String(error)));
  }, [refresh, onError]);

  async function act(task: () => Promise<void>) {
    setBusy(true);
    onError("");
    try {
      await task();
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const conflict = conflicts.find((item) => item.id === chosenConflict);
  const conflictAnswers = answers.filter(
    (item) =>
      item.conflict_id === chosenConflict && item.response_type === "answer",
  );

  return (
    <section>
      <p className="eyebrow">OUTPUTS · APPROVALS · VERSIONING</p>
      <h2>Approvals, blueprint and test plan</h2>
      <p className="subtle">
        These are human-facing specifications and manual tests. No live agent is
        configured or deployed here.
      </p>
      {readiness && (
        <p className="notice">
          Document readiness: <strong>{words(readiness.state)}</strong> ·{" "}
          {readiness.approved_count} approved
          {readiness.pending_confirmation_count > 0 &&
            ` · ${readiness.pending_confirmation_count} awaiting customer confirmation`}
          {readiness.pending_revision_count > 0 &&
            ` · ${readiness.pending_revision_count} revision(s) in progress (the confirmed baseline stays approved until a revision is validated)`}
          {readiness.open_high_conflict_count > 0 &&
            ` · ${readiness.open_high_conflict_count} high conflict(s) open`}
        </p>
      )}

      <h3>Current requirement versions</h3>
      {approvals.length === 0 && <p>No requirements yet.</p>}
      <ul>
        {approvals.map((rule) => (
          <li key={rule.requirement_version_id}>
            <strong>{rule.title}</strong> v{rule.version} · {rule.scope} ·{" "}
            {rule.approved
              ? "Approved for blueprint"
              : `Blocked: ${rule.blockers.map(words).join(", ")}`}
          </li>
        ))}
      </ul>

      <h3>Resolve a customer-answered conflict</h3>
      <div className="grid-two tight">
        <label>
          Conflict
          <select
            value={chosenConflict}
            onChange={(event) => {
              setChosenConflict(event.target.value);
              setChosenResponse("");
              setChosenRule("");
            }}
          >
            <option value="">Select an unresolved conflict</option>
            {conflicts
              .filter((item) => item.kind === "conflict" && !item.resolved)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.severity} · {item.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Customer answer
          <select
            value={chosenResponse}
            onChange={(event) => setChosenResponse(event.target.value)}
          >
            <option value="">Select the latest linked answer</option>
            {conflictAnswers.map((item) => (
              <option key={item.response_id} value={item.response_id}>
                {item.question} · {JSON.stringify(item.answer).slice(0, 100)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confirmed rule that applies
          <select
            value={chosenRule}
            onChange={(event) => setChosenRule(event.target.value)}
          >
            <option value="">Select a conflict member</option>
            {conflict?.members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.statement}
              </option>
            ))}
          </select>
        </label>
        <label>
          Staff resolution rationale
          <textarea
            value={resolution}
            maxLength={2000}
            onChange={(event) => setResolution(event.target.value)}
          />
        </label>
        <button
          disabled={
            busy ||
            !chosenConflict ||
            !chosenResponse ||
            !chosenRule ||
            resolution.trim().length < 10
          }
          onClick={() =>
            void act(async () => {
              await api(
                `/projects/${projectId}/conflicts/${chosenConflict}/resolve`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    response_id: chosenResponse,
                    chosen_version_id: chosenRule,
                    rationale: resolution,
                  }),
                },
                csrf,
              );
              setChosenConflict("");
              setChosenResponse("");
              setChosenRule("");
              setResolution("");
            })
          }
        >
          Record customer-backed resolution
        </button>
      </div>

      <h3>Draft a revision after approval</h3>
      <p className="subtle">
        The confirmed version stays frozen. A new version needs fresh customer
        confirmation.
      </p>
      <div className="grid-two tight">
        <label>
          Approved rule
          <select
            value={revisionId}
            onChange={(event) => {
              setRevisionId(event.target.value);
              setRevisionText(
                approvals.find(
                  (item) => item.requirement_version_id === event.target.value,
                )?.statement || "",
              );
            }}
          >
            <option value="">Select a rule</option>
            {approvals
              .filter((item) => item.approved)
              .map((item) => (
                <option
                  key={item.requirement_version_id}
                  value={item.requirement_version_id}
                >
                  {item.title} v{item.version}
                </option>
              ))}
          </select>
        </label>
        <label>
          Revised wording
          <textarea
            value={revisionText}
            maxLength={2000}
            onChange={(event) => setRevisionText(event.target.value)}
          />
        </label>
        <label>
          Reason for change
          <textarea
            value={revisionReason}
            maxLength={2000}
            onChange={(event) => setRevisionReason(event.target.value)}
          />
        </label>
        <button
          disabled={
            busy ||
            !revisionId ||
            !revisionText.trim() ||
            revisionReason.trim().length < 10
          }
          onClick={() =>
            void act(async () => {
              await api(
                `/projects/${projectId}/requirements/${revisionId}/revisions`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    statement: revisionText,
                    reason: revisionReason,
                  }),
                },
                csrf,
              );
              setRevisionId("");
              setRevisionText("");
              setRevisionReason("");
            })
          }
        >
          Create unconfirmed revision
        </button>
      </div>

      <h3>Generate versioned outputs</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        I reviewed the unresolved issues and exclusions that will be listed in
        the export.
      </label>
      <div className="action-row">
        {(["blueprint", "test_plan"] as const).map((kind) => (
          <button
            key={kind}
            disabled={
              busy ||
              !acknowledged ||
              !readiness?.approved_count ||
              !!readiness?.open_high_conflict_count
            }
            onClick={() =>
              void act(async () => {
                await api(
                  `/projects/${projectId}/artifacts/${kind}/generate`,
                  {
                    method: "POST",
                    body: JSON.stringify({ acknowledge_exclusions: true }),
                  },
                  csrf,
                );
              })
            }
          >
            Generate {words(kind)}
          </button>
        ))}
      </div>
      {artifacts.length === 0 && <p>No output versions yet.</p>}
      {artifacts.map((item) => (
        <div key={item.id} className="notice">
          <strong>
            {words(item.kind)} v{item.version}
          </strong>{" "}
          · {item.stale ? "Stale" : "Current"} ·{" "}
          {item.requirement_version_ids.length} approved rules ·{" "}
          {item.exclusions.length} exclusions
          <div className="action-row">
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void act(async () => {
                  setSelectedArtifact(
                    await api(`/projects/${projectId}/artifacts/${item.id}`),
                  );
                })
              }
            >
              Preview
            </button>
            <a
              href={`/api/projects/${projectId}/artifacts/${item.id}/export/md`}
            >
              Markdown
            </a>
            <a
              href={`/api/projects/${projectId}/artifacts/${item.id}/export/json`}
            >
              JSON
            </a>
          </div>
        </div>
      ))}
      <h3>Audit trail</h3>
      <p className="subtle">
        Staff decisions, customer replies (by unverified link) and exports,
        newest first
        {audit ? ` · showing ${audit.items.length} of ${audit.total}` : ""}.
      </p>
      <ul className="history">
        {(audit?.items ?? []).map((event) => (
          <li key={event.id}>
            <strong>{event.action}</strong> · {event.actor}{" "}
            <small>{new Date(event.created_at).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      {selectedArtifact && (
        <div>
          <h3>
            Export preview {selectedArtifact.stale ? "· stale" : "· current"}
          </h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {selectedArtifact.markdown}
          </pre>
        </div>
      )}
    </section>
  );
}
