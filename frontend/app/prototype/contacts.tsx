"use client";

import { useState } from "react";
import {
  checkContact,
  contactRoleSuggestions,
  topics,
  type Contact,
  type Topic,
} from "./state";
import { Person, Tag } from "./ui";

/** Fields for one new customer team member. Shown after "Add team member" is pressed. */
export function ContactForm({
  existing,
  onAdd,
  onCancel,
  note,
}: {
  existing: Contact[];
  onAdd: (c: Contact) => void;
  onCancel: () => void;
  note?: string;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [decides, setDecides] = useState<Topic[]>([]);
  const [error, setError] = useState("");

  function submit() {
    const result = checkContact(existing, { name, role, email, decides });
    if (!result.ok) return setError(result.error);
    onAdd(result.contact);
  }
  const toggle = (t: Topic) =>
    setDecides(
      decides.includes(t) ? decides.filter((x) => x !== t) : [...decides, t],
    );

  return (
    <div
      className="v3-contactform"
      role="group"
      aria-label="New customer team member"
    >
      <h3>New customer team member</h3>
      <div className="v3-formgrid">
        <label className="v3-field">
          Full name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example: Maya Chen"
            autoFocus
          />
        </label>
        <label className="v3-field">
          Role
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            list="v3-roles"
            placeholder="For example: Operations lead"
          />
          <datalist id="v3-roles">
            {contactRoleSuggestions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <label className="v3-field wide">
          Work email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@customer.example"
          />
        </label>
      </div>
      <p className="v3-muted">
        What do they decide? Questions and document requests go to the person
        who decides the topic.
      </p>
      <div className="v3-chips">
        {topics.map((t) => (
          <label
            key={t.id}
            className={`v3-chip ${decides.includes(t.id) ? "on" : ""}`}
          >
            <input
              type="checkbox"
              hidden
              checked={decides.includes(t.id)}
              onChange={() => toggle(t.id)}
            />
            {t.label}
          </label>
        ))}
      </div>
      {note && <p className="v3-muted">{note}</p>}
      {error && (
        <p className="v3-warn" role="alert">
          {error}
        </p>
      )}
      <div className="v3-actions">
        <button className="v3-btn" onClick={submit}>
          Add to customer team
        </button>
        <button className="v3-btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContactCard({
  c,
  onRemove,
}: {
  c: Contact;
  onRemove?: () => void;
}) {
  return (
    <div className="v3-contactcard">
      <Person name={c.name} role={c.role} side="customer" />
      <span className="decides">
        {c.decides.length ? (
          c.decides.map((d) => (
            <Tag key={d} kind="gray">
              {topics.find((t) => t.id === d)?.label}
            </Tag>
          ))
        ) : (
          <small className="v3-muted">Decides nothing yet</small>
        )}
      </span>
      <small className="v3-muted email">{c.email || "No email"}</small>
      {onRemove && (
        <button
          className="v3-link"
          onClick={onRemove}
          aria-label={`Remove ${c.name}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}
