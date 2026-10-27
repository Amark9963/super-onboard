"""Idempotent, entirely fictional M0 fixtures. No authentication credentials."""

import hashlib
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (
    CustomerContact,
    InternalUser,
    Organization,
    Project,
    ProjectMembership,
    Property,
    SourceBlock,
    SourceDocument,
    SourceVersion,
)


def key(label: str) -> str:
    return str(uuid5(NAMESPACE_URL, "super-onboard:fictional:" + label))


FIXTURES = {
    "Aster House policy": "Fictional Aster House permits two cats. Emergencies route to the on-call maintenance supervisor.",
    "Birch Court old SOP": "Fictional obsolete SOP: Birch Court weekend emergencies go to the front desk.",
    "Birch Court transcript": "00:12 Fictional discussion: Birch Court allows one cat. Weekend emergencies may go to the supervisor; please confirm.",
    "Contact roster": "Fictional primary: Maintenance Supervisor. Backup: Weekend Manager; phone missing. Requires live system lookup.",
    "Website snapshot": "Fictional public hours: Monday–Friday 9–5. Stale maintenance snippet: call the front desk on weekends.",
}


def seed(session):
    if session.get(Organization, key("organization")):
        return
    session.add(InternalUser(id=key("staff"), email="specialist@example.invalid"))
    session.add(Organization(id=key("organization"), name="Fictional Lantern Property Group"))
    session.flush()
    session.add(
        Project(
            id=key("project"),
            organization_id=key("organization"),
            owner_id=key("staff"),
            name="Fictional onboarding demo",
        )
    )
    session.flush()
    session.add(ProjectMembership(project_id=key("project"), user_id=key("staff")))
    session.add(
        CustomerContact(
            project_id=key("project"),
            name="Fictional Alex",
            email="alex@example.invalid",
            role="Property manager",
        )
    )
    for name in ("Aster House", "Birch Court"):
        session.add(Property(id=key(name), project_id=key("project"), name="Fictional " + name))
    for name, text in FIXTURES.items():
        session.add(
            SourceDocument(id=key(name), project_id=key("project"), name=name, kind="fixture")
        )
        session.flush()
        session.add(
            SourceVersion(
                id=key(name + ":v1"),
                project_id=key("project"),
                document_id=key(name),
                version=1,
                content_hash=hashlib.sha256(text.encode()).hexdigest(),
                parse_status="fixture",
            )
        )
        session.flush()
        session.add(
            SourceBlock(
                project_id=key("project"),
                source_version_id=key(name + ":v1"),
                text=text,
                locator={"section": name, "synthetic": True},
            )
        )
    session.flush()


if __name__ == "__main__":
    with SessionLocal.begin() as session:
        seed(session)
        count = len(
            session.scalars(select(Property).where(Property.project_id == key("project"))).all()
        )
        print(f"Fictional seed ready: {count} buildings; no approved policies.")
