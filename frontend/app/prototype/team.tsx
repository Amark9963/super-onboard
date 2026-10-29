"use client";

import { useState } from "react";
import {
  OWNER,
  cancelInvite,
  inviteMember,
  ownedBy,
  teamRoles,
  type TeamRole,
} from "./state";
import { planTasks } from "./plan";
import { Avatar, Tag, type Ctx } from "./ui";

export function TeamPage({ ctx }: { ctx: Ctx }) {
  const { state, update, flash, go } = ctx;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("Onboarding specialist");
  const [error, setError] = useState("");
  const openTasks = planTasks(state).filter(
    (t) => t.side === "team" && t.status !== "Done",
  );

  function invite() {
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
      return setError("Enter a valid email address.");
    if (state.team.some((m) => m.email.toLowerCase() === clean.toLowerCase()))
      return setError("That person is already on the team.");
    update((s) => inviteMember(s, clean, role));
    setEmail("");
    setError("");
    setOpen(false);
    flash(
      `Simulated: an invite was sent to ${clean}. They show as Invited until they accept. No email was sent.`,
    );
  }

  const active = state.team.filter((m) => m.status === "Active").length;
  return (
    <>
      <div className="v3-pagehead">
        <div>
          <h1>Team</h1>
          <p className="v3-muted">
            {active} active member{active === 1 ? "" : "s"}
            {state.team.length > active
              ? ` · ${state.team.length - active} invited`
              : ""}
            . Anyone who has accepted can own an onboarding.
          </p>
        </div>
        <button
          className="v3-btn"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Close" : "＋ Invite member"}
        </button>
      </div>

      {open && (
        <section className="v3-card v3-invite">
          <h3>Invite a teammate</h3>
          <p className="v3-muted">
            Simulated. They are added as “Invited” and no email is sent.
          </p>
          <div className="v3-formgrid">
            <label className="v3-field">
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.example"
              />
            </label>
            <label className="v3-field">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TeamRole)}
              >
                {teamRoles.map((r) => (
                  <option key={r.role}>{r.role}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="v3-muted">
            {teamRoles.find((r) => r.role === role)?.blurb}
          </p>
          {error && <p className="v3-warn">{error}</p>}
          <div className="v3-actions">
            <button className="v3-btn" onClick={invite}>
              Send invite
            </button>
            <button
              className="v3-btn secondary"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="v3-split">
        <section className="v3-card">
          <table className="v3-table v3-team">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Owns</th>
                <th>Open tasks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.team.map((m) => {
                const owned = ownedBy(state, m);
                const tasks = openTasks.filter(
                  (t) => t.assignee === m.name,
                ).length;
                return (
                  <tr
                    key={m.id}
                    className={m.status === "Invited" ? "invited" : ""}
                  >
                    <td>
                      <span className="v3-person">
                        <Avatar name={m.name} side="team" />
                        <span>
                          <strong>
                            {m.name}
                            {m.name === OWNER && (
                              <small className="you"> you</small>
                            )}
                          </strong>
                          <small>{m.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>{m.role}</td>
                    <td>
                      <Tag kind={m.status === "Active" ? "green" : "amber"}>
                        {m.status}
                      </Tag>
                    </td>
                    <td>
                      {owned.length === 0 && (
                        <span className="v3-muted">—</span>
                      )}
                      {owned.map((o) =>
                        o.live ? (
                          <button
                            key={o.name}
                            className="v3-link block"
                            onClick={() => go("client", "plan")}
                          >
                            {o.name}
                          </button>
                        ) : (
                          <span key={o.name} className="v3-muted block">
                            {o.name} <small>(illustrative)</small>
                          </span>
                        ),
                      )}
                    </td>
                    <td>
                      {state.client && owned.some((o) => o.live) ? (
                        tasks
                      ) : (
                        <span className="v3-muted">—</span>
                      )}
                    </td>
                    <td className="right">
                      {m.status === "Invited" && (
                        <button
                          className="v3-link"
                          onClick={() => update((s) => cancelInvite(s, m.id))}
                        >
                          Cancel invite
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <aside className="v3-side">
          <section className="v3-card">
            <h3>Roles</h3>
            <p className="v3-muted">
              Typical responsibilities. Roles are descriptive in this prototype
              and do not restrict anything.
            </p>
            {teamRoles.map((r) => (
              <div className="v3-role" key={r.role}>
                <strong>{r.role}</strong>
                <small>{r.blurb}</small>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
