from datetime import datetime, timedelta, timezone

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, inspect, select, text, update
from sqlalchemy.exc import IntegrityError

from app import main
from app.access import project_records
from app.ai import BlockInput, Candidate, ExtractionRequest, get_provider
from app.models import (
    ArtifactVersion,
    ClarificationQuestion,
    CustomerContact,
    CustomerResponseVersion,
    InternalUser,
    InvitationItem,
    Project,
    Property,
    Requirement,
    RequirementVersion,
    ReviewInvitation,
    ReviewRequest,
    ReviewRequestItem,
)
from app.seed import key, seed
from app.tokens import hash_token, new_token


def test_evidence_cannot_claim_another_source_version(session):
    from app.models import RequirementEvidence, SourceBlock, SourceVersion

    block = session.scalar(select(SourceBlock))
    wrong_version = session.scalar(
        select(SourceVersion).where(SourceVersion.id != block.source_version_id)
    )
    session.add(Requirement(id="req", project_id=key("project"), title="Fixture"))
    session.flush()
    session.add(
        RequirementVersion(
            id="revision",
            project_id=key("project"),
            requirement_id="req",
            version=1,
            category="pets",
            statement="Fixture",
            scope_type="company",
        )
    )
    session.flush()
    session.add(
        RequirementEvidence(
            project_id=key("project"),
            requirement_version_id="revision",
            source_version_id=wrong_version.id,
            block_id=block.id,
            quoted_text=block.text,
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_worker_persists_single_fresh_heartbeat(engine, monkeypatch):
    from sqlalchemy.orm import sessionmaker

    from app import worker
    from app.models import WorkerHeartbeat

    factory = sessionmaker(engine)
    monkeypatch.setattr(worker, "SessionLocal", factory)
    worker.tick()
    worker.tick()
    with factory() as session:
        rows = session.scalars(select(WorkerHeartbeat)).all()
        assert len(rows) == 1
        assert rows[0].name == "foundation"
        assert datetime.now(timezone.utc) - rows[0].seen_at.replace(
            tzinfo=timezone.utc
        ) < timedelta(seconds=10)


def test_migrations_schema_and_no_drift(engine):
    tables = inspect(engine).get_table_names()
    assert {
        "organizations",
        "properties",
        "requirement_versions",
        "invitation_items",
        "artifact_requirements",
        "audit_events",
        "worker_heartbeats",
    } <= set(tables)
    command.check(Config("alembic.ini"))


def test_seed_is_idempotent_and_fictional(session):
    seed(session)
    session.commit()
    assert session.scalar(select(func.count()).select_from(Property)) == 2
    assert all(p.name.startswith("Fictional") for p in session.scalars(select(Property)))
    assert session.scalar(select(func.count()).select_from(RequirementVersion)) == 0


def test_backend_membership_and_scope(session):
    session.add(InternalUser(id="outsider", email="outsider@example.invalid"))
    session.flush()
    with pytest.raises(PermissionError):
        project_records(session, Property, user_id="outsider", project_id=key("project"))
    rows = project_records(session, Property, user_id=key("staff"), project_id=key("project"))
    assert len(rows) == 2


def test_cross_project_foreign_key_rejected(session):
    session.add(
        Project(
            id="other", organization_id=key("organization"), owner_id=key("staff"), name="Other"
        )
    )
    session.add(Requirement(id="req", project_id=key("project"), title="Pet policy"))
    session.flush()
    session.add(
        RequirementVersion(
            project_id="other",
            requirement_id="req",
            version=1,
            category="pets",
            statement="Pets allowed",
            scope_type="company",
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_property_scope_requires_property(session):
    session.add(Requirement(id="req", project_id=key("project"), title="Pet policy"))
    session.flush()
    session.add(
        RequirementVersion(
            project_id=key("project"),
            requirement_id="req",
            version=1,
            category="pets",
            statement="Pets allowed",
            scope_type="property",
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_mock_is_deterministic_labeled_and_unapproved():
    provider = get_provider("mock")
    request = ExtractionRequest(
        [BlockInput("block", "Fictional pets policy: two cats are permitted.", "line 1")]
    )
    result = provider.extract(request)
    assert result == provider.extract(request)
    assert result.simulated and "SIMULATED" in result.provider
    candidate = result.candidates[0]
    assert candidate.citations[0].block_id == "block"
    assert not hasattr(candidate, "staff_review_state")
    assert provider.extract(ExtractionRequest([BlockInput("b", "", "")])).candidates == []
    with pytest.raises(ValueError):
        get_provider("live")
    # A provider cannot assert review or confirmation state: the schema has no such fields.
    with pytest.raises(ValidationError):
        Candidate(**{**candidate.model_dump(), "staff_review_state": "accepted"})


def test_token_primitives():
    token, digest = new_token()
    assert len(token) >= 43 and len(digest) == 64
    assert digest == hash_token(token) and token != digest
    assert new_token()[0] != token


def invitation(session):
    project = key("project")
    contact = session.scalar(select(CustomerContact))
    session.add(ReviewRequest(id="request", project_id=project, title="Fictional review"))
    session.add(ClarificationQuestion(id="question", project_id=project, text="Confirm?"))
    session.flush()
    session.add(
        ReviewRequestItem(
            id="item",
            project_id=project,
            request_id="request",
            question_id="question",
            shared_payload={"question": "Confirm?"},
        )
    )
    session.add(
        ReviewRequestItem(
            id="unshared",
            project_id=project,
            request_id="request",
            question_id="question",
            shared_payload={"question": "Private"},
        )
    )
    session.add(
        ReviewInvitation(
            id="invite",
            project_id=project,
            request_id="request",
            contact_id=contact.id,
            token_hash=new_token()[1],
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    session.flush()
    session.add(
        InvitationItem(
            project_id=project, request_id="request", invitation_id="invite", item_id="item"
        )
    )
    session.commit()


def response(item="item", version=1, submission="retry-key"):
    return CustomerResponseVersion(
        project_id=key("project"),
        invitation_id="invite",
        item_id=item,
        version=version,
        submission_id=submission,
        response_type="answer",
        answer={"text": "yes"},
    )


def test_responses_require_explicit_invitation_item(session):
    invitation(session)
    session.add(response("unshared"))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_retry_uniqueness_preserves_original_response(session):
    invitation(session)
    session.add(response())
    session.commit()
    session.add(response(version=2))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()
    assert session.scalar(select(func.count()).select_from(CustomerResponseVersion)) == 1


def test_artifacts_are_immutable(session):
    session.add(
        ArtifactVersion(
            id="artifact",
            project_id=key("project"),
            kind="blueprint",
            version=1,
            markdown="Fixture only",
            structured={},
        )
    )
    session.commit()
    with pytest.raises(Exception, match="[Ii]mmutable"):
        session.execute(update(ArtifactVersion).values(markdown="overwritten"))
    session.rollback()


def test_confirmed_requirement_is_immutable(session):
    session.add(Requirement(id="req", project_id=key("project"), title="Fixture"))
    session.flush()
    session.add(
        RequirementVersion(
            id="version",
            project_id=key("project"),
            requirement_id="req",
            version=1,
            category="pets",
            statement="Fixture",
            scope_type="company",
            customer_confirmation_state="confirmed",
        )
    )
    session.commit()
    with pytest.raises(Exception, match="[Ii]mmutable"):
        session.execute(update(RequirementVersion).values(statement="overwritten"))
    session.rollback()


def test_health_and_no_business_routes(engine, monkeypatch):
    monkeypatch.setattr(main, "engine", engine)
    client = TestClient(main.app)
    assert client.get("/health/live").json() == {"status": "ok", "milestone": 2}
    assert client.get("/health/ready").status_code == 200
    assert client.get("/api/projects").status_code == 401
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE alembic_version"))
    assert client.get("/health/ready").status_code == 503
    # Restore metadata for fixture downgrade.
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
        )
        connection.execute(text("INSERT INTO alembic_version VALUES ('0004')"))
