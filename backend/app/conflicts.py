"""Potential conflict, variant and gap grouping for candidate requirements.

Everything here is a *suggestion for staff*: groups are never resolved automatically and nothing
here changes a requirement. Rules are intentionally simple and explainable:

* Two rules are comparable when they share category and topic, both state an action, and their
  conditions are equal or one set contains the other.
* If their scopes overlap and the actions differ, that is a potential conflict. Severity is highest
  for the identical scope with identical conditions (e.g. two weekend routes for one building).
* If their scopes do not overlap (different buildings) the difference is an allowed *variant*.
* Candidate-level gaps come from model-reported missing information and live-lookup dependencies;
  coverage gaps list buildings with no rule on a topic that only exists at narrower scopes.

Only candidates that are not rejected/duplicate and whose evidence is fully verified take part.
"""

import hashlib
import json
from itertools import combinations

from sqlalchemy import delete, select

from app.models import ConflictGroup, ConflictMember, Portfolio, Property, RequirementVersion

MAX_GROUPS = 500
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}


def scope_key(version) -> tuple[str, str | None]:
    if version.scope_type == "property":
        return "property", version.property_id
    if version.scope_type == "portfolio":
        return "portfolio", version.portfolio_id
    return "company", None


def scope_overlap(a, b, portfolio_of: dict[str, str | None]):
    """Return (relation, narrowest_scope) when the scopes overlap, else None.

    relation is "same" for identical scopes and "nested" when one contains the other.
    """
    ka, kb = scope_key(a), scope_key(b)
    if ka == kb:
        return "same", ka
    if ka[0] == "company":
        return "nested", kb
    if kb[0] == "company":
        return "nested", ka
    for outer, inner in ((ka, kb), (kb, ka)):
        if outer[0] == "portfolio" and inner[0] == "property":
            if portfolio_of.get(inner[1]) == outer[1]:
                return "nested", inner
    return None


def condition_relation(a, b):
    left, right = set(a.conditions or []), set(b.conditions or [])
    if left == right:
        return "equal"
    if left < right or right < left:
        return "nested"
    return None


def _severity(scope_relation, condition_rel):
    if scope_relation == "same" and condition_rel == "equal":
        return "high"
    if scope_relation == "same" or condition_rel == "equal":
        return "medium"
    return "low"


def _fingerprint(kind, parts) -> str:
    return hashlib.sha256(json.dumps([kind, parts], sort_keys=True).encode()).hexdigest()


def _member_state(version):
    return [
        version.id,
        version.scope_type,
        version.property_id,
        version.portfolio_id,
        sorted(version.conditions or []),
        version.proposed_action,
    ]


def _words(value):
    return (value or "").replace("_", " ")


def detect(versions, properties, portfolios) -> list[dict]:
    """Pure detection over live candidates. `properties`/`portfolios` are model rows."""
    names = {p.id: p.name for p in properties} | {p.id: p.name for p in portfolios}
    portfolio_of = {p.id: p.portfolio_id for p in properties}

    def scope_label(scope):
        return "Company-wide" if scope[0] == "company" else names.get(scope[1], scope[0])

    ordered = sorted(versions, key=lambda v: v.id)
    by_topic: dict[tuple[str, str], list] = {}
    for version in ordered:
        if version.topic:
            by_topic.setdefault((version.category, version.topic), []).append(version)

    groups = []
    for (_, topic), members in by_topic.items():
        for a, b in combinations(members, 2):
            if not a.proposed_action or not b.proposed_action:
                continue
            if a.proposed_action == b.proposed_action:
                continue
            cond = condition_relation(a, b)
            if cond is None:
                continue
            overlap = scope_overlap(a, b, portfolio_of)
            label = f"{_words(topic).capitalize()}: {_words(a.proposed_action)} vs {_words(b.proposed_action)}"
            if overlap is None:
                kind, severity = "variant", "info"
                where = f"{scope_label(scope_key(a))} and {scope_label(scope_key(b))}"
                explanation = (
                    "Allowed variation: these rules apply to different, non-overlapping scopes "
                    f"({where}). Not treated as a contradiction."
                )
                intersection = {"relation": "none", "scope": None}
            else:
                relation, narrow = overlap
                kind, severity = "conflict", _severity(relation, cond)
                intersection = {
                    "relation": relation,
                    "scope": {"type": narrow[0], "id": narrow[1], "name": scope_label(narrow)},
                }
                explanation = (
                    f"Incompatible actions for overlapping scope ({scope_label(narrow)}) with "
                    f"{'identical' if cond == 'equal' else 'nested'} conditions. "
                    "Staff must confirm whether both can apply; ask the customer if unclear."
                )
            intersection["conditions"] = cond
            intersection["explanation"] = explanation
            groups.append(
                {
                    "kind": kind,
                    "severity": severity,
                    "title": label,
                    "scope_intersection": intersection,
                    "member_ids": [a.id, b.id],
                    "signature": _fingerprint(kind, sorted([_member_state(a), _member_state(b)])),
                }
            )

    for version in ordered:
        if version.missing_information:
            groups.append(
                _gap(
                    version,
                    "missing_information",
                    "medium",
                    "Missing information: " + "; ".join(version.missing_information),
                    "The source leaves required details undefined. Do not guess; ask the customer.",
                )
            )
        if version.requires_live_lookup:
            groups.append(
                _gap(
                    version,
                    "live_lookup",
                    "low",
                    "Needs live system lookup: " + version.statement[:100],
                    "This depends on live data (for example a roster or work-order status). "
                    "A snapshot must not become an evergreen agent assertion.",
                )
            )

    all_properties = [p.id for p in properties]
    for (_, topic), members in by_topic.items():
        if any(scope_key(m)[0] == "company" for m in members):
            continue
        covered = set()
        for member in members:
            kind_, id_ = scope_key(member)
            if kind_ == "property":
                covered.add(id_)
            else:
                covered.update(pid for pid in all_properties if portfolio_of.get(pid) == id_)
        uncovered = sorted(set(all_properties) - covered)
        if uncovered:
            groups.append(
                {
                    "kind": "gap",
                    "severity": "low",
                    "title": f"No {_words(topic)} rule found for "
                    + ", ".join(names[p] for p in uncovered),
                    "scope_intersection": {
                        "relation": "none",
                        "scope": None,
                        "uncovered_property_ids": uncovered,
                        "explanation": (
                            "Rules on this topic exist only for narrower scopes. A missing rule may "
                            "be intentional; confirm with the customer."
                        ),
                    },
                    "member_ids": [m.id for m in members],
                    "signature": _fingerprint(
                        "coverage", [topic, uncovered, [_member_state(m) for m in members]]
                    ),
                }
            )
    groups.sort(key=lambda g: (SEVERITY_ORDER[g["severity"]], g["title"]))
    return groups[:MAX_GROUPS]


def _gap(version, reason, severity, title, explanation):
    return {
        "kind": "gap",
        "severity": severity,
        "title": title,
        "scope_intersection": {
            "relation": "none",
            "scope": None,
            "reason": reason,
            "explanation": explanation,
        },
        "member_ids": [version.id],
        "signature": _fingerprint(
            "gap:" + reason, [_member_state(version), version.missing_information or []]
        ),
    }


def current_versions(db, project_id: str) -> list:
    """The version each requirement currently stands on.

    A confirmed baseline stays current until a newer revision is itself confirmed, so a pending
    or rejected revision never silently displaces an approved rule. With no confirmed version, the
    latest version is current.
    """
    chosen = {}
    for version in db.scalars(
        select(RequirementVersion)
        .where(RequirementVersion.project_id == project_id)
        .order_by(RequirementVersion.requirement_id, RequirementVersion.version)
    ):
        held = chosen.get(version.requirement_id)
        if (
            held is None
            or version.customer_confirmation_state == "confirmed"
            or held.customer_confirmation_state != "confirmed"
        ):
            chosen[version.requirement_id] = version
    return list(chosen.values())


def refresh_conflicts(db, project_id: str) -> None:
    """Recompute suggestions. Staff triage survives; groups whose members changed go obsolete."""
    versions = [
        v
        for v in current_versions(db, project_id)
        if v.staff_review_state != "rejected" and v.evidence_status == "verified"
    ]
    properties = db.scalars(select(Property).where(Property.project_id == project_id)).all()
    portfolios = db.scalars(select(Portfolio).where(Portfolio.project_id == project_id)).all()
    wanted = {g["signature"]: g for g in detect(versions, properties, portfolios)}

    existing = {
        g.signature: g
        for g in db.scalars(
            select(ConflictGroup).where(
                ConflictGroup.project_id == project_id, ConflictGroup.signature.is_not(None)
            )
        )
    }
    for signature, spec in wanted.items():
        group = existing.get(signature)
        if group is None:
            group = ConflictGroup(
                project_id=project_id,
                signature=signature,
                kind=spec["kind"],
                severity=spec["severity"],
                title=spec["title"],
                scope_intersection=spec["scope_intersection"],
            )
            db.add(group)
            db.flush()
            for member_id in spec["member_ids"]:
                db.add(
                    ConflictMember(
                        project_id=project_id,
                        conflict_id=group.id,
                        requirement_version_id=member_id,
                    )
                )
        else:
            group.kind, group.severity = spec["kind"], spec["severity"]
            group.title, group.scope_intersection = spec["title"], spec["scope_intersection"]
            if group.triage_state == "obsolete":
                group.triage_state = "open"
    for signature, group in existing.items():
        if signature in wanted:
            continue
        if group.triage_state == "open" and not group.resolved:
            db.execute(delete(ConflictMember).where(ConflictMember.conflict_id == group.id))
            db.delete(group)
        else:
            group.triage_state = "obsolete"
    db.flush()
