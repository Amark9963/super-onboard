"use client";

import { useState } from "react";
import {
  canRequestReview,
  decideReview,
  me,
  requestReview,
  reviewers,
} from "./collab";
import {
  coverage,
  reviewApproved,
  reviewReady,
  reviewRequestStale,
  reviewStale,
} from "./state";
import { Tag, type Ctx } from "./ui";

/** The second-person review: someone other than the owner signs off before setup starts. */
export function ReviewCard({ ctx }: { ctx: Ctx }) {
  const { state, update, flash } = ctx;
  const client = state.client!;
  const review = state.review;
  const options = reviewers(state);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const reviewer =
    choice ||
    options.find((m) => m.role === "QA reviewer")?.name ||
    options[0]?.name ||
    "";
  const ready = reviewReady(state);
  const approved = reviewApproved(state);
  const stale = reviewStale(state);
  const requestStale = reviewRequestStale(state);
  const cov = coverage(state);
  const who = me(state);
  const isReviewer =
    review?.status === "Requested" && who?.name === review.reviewer;
  const ask = canRequestReview(state, reviewer);
  const reviewerMember = state.team.find((m) => m.name === review?.reviewer);

  return (
    <section className="v3-card v3-review" aria-label="Second-person review">
      <div className="v3-cardhead">
        <div>
          <h3>Second-person review</h3>
          <p className="v3-muted">
            Someone other than {client.owner} checks the approved details before
            setup starts in the platform.
          </p>
        </div>
        {approved ? (
          <Tag kind="green">Approved</Tag>
        ) : requestStale ? (
          <Tag kind="red">Needs new review</Tag>
        ) : review?.status === "Requested" ? (
          <Tag kind="amber">Waiting for {review.reviewer}</Tag>
        ) : review?.status === "Changes requested" ? (
          <Tag kind="red">Changes requested</Tag>
        ) : (
          <Tag kind="gray">{ready ? "Not requested" : "Not ready"}</Tag>
        )}
      </div>

      {approved && review && (
        <p>
          <strong>{review.reviewer}</strong> approved the details ({review.at}).
          {review.reason ? ` Note: ${review.reason}` : ""}
        </p>
      )}
      {stale && review && (
        <p className="v3-warn">
          {review.reviewer} approved earlier, but details or ownership changed
          since. Ask for another review before setup.
        </p>
      )}
      {requestStale && review && (
        <p className="v3-warn">
          Details or ownership changed after the review was requested.{" "}
          {client.owner} must request a new review of the current details.
        </p>
      )}
      {review?.status === "Changes requested" && (
        <p className="v3-warn">
          {review.reviewer} asked for changes: {review.reason}
        </p>
      )}

      {!ready && !review && (
        <p className="v3-muted">
          Available once clarification is complete: conflicts resolved, answers
          approved and gaps closed.
        </p>
      )}

      {isReviewer && !requestStale && ready && (
        <div className="v3-reviewform">
          <p>
            You are the reviewer ({who?.name}). {cov.known} of {cov.total}{" "}
            details are known and {cov.confirmed} are confirmed by the customer.
            Check the Requirements below, then decide.
          </p>
          <label className="v3-field">
            Reason (required if you ask for changes)
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="v3-actions">
            <button
              className="v3-btn"
              onClick={() => {
                update((s) => decideReview(s, "approve", reason));
                setReason("");
                flash(`Approved. Setup is now unlocked for ${client.name}.`);
              }}
            >
              Approve
            </button>
            <button
              className="v3-btn secondary"
              disabled={!reason.trim()}
              onClick={() => {
                update((s) => decideReview(s, "changes", reason));
                setReason("");
                flash(`Sent back to ${client.owner} with your reason.`);
              }}
            >
              Ask for changes
            </button>
          </div>
        </div>
      )}

      {review?.status === "Requested" && !isReviewer && !requestStale && (
        <p className="v3-muted">
          Round {review.round}. {review.reviewer}
          {reviewerMember ? ` (${reviewerMember.role})` : ""} finds it in their
          queue. To try the reviewer’s side, choose {review.reviewer} under
          “Viewing as” in the sidebar.
        </p>
      )}

      {ready &&
        !approved &&
        (review?.status !== "Requested" || requestStale) && (
          <div className="v3-reviewform">
            <label className="v3-field">
              Ask
              <select
                value={reviewer}
                onChange={(e) => setChoice(e.target.value)}
                aria-label="Reviewer"
              >
                {options.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
            </label>
            <div className="v3-actions">
              <button
                className="v3-btn"
                disabled={!ask.ok}
                onClick={() => {
                  update((s) => requestReview(s, reviewer));
                  flash(
                    `Simulated: ${reviewer} would be notified in Slack and sees it in their queue.`,
                  );
                }}
              >
                {review?.status === "Changes requested" || stale || requestStale
                  ? "Ask for another review"
                  : "Request review"}
              </button>
              {!ask.ok && <small className="v3-muted">{ask.why}</small>}
            </div>
          </div>
        )}
    </section>
  );
}
