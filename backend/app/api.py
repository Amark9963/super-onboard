"""M1 internal project and source routes. Every project object is checked server-side."""

import hashlib
from datetime import date
from pathlib import PurePosixPath
from typing import Annotated
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select

from app.auth import DB, User
from app.config import settings
from app.models import (
    AuditEvent,
    CustomerContact,
    InternalUser,
    Job,
    Organization,
    Portfolio,
    Project,
    ProjectMembership,
    Property,
    SourceBlock,
    SourceDocument,
    SourceVersion,
)
from app.parsing import ParseIssue, validate_file
from app.storage import get_store

router = APIRouter(prefix="/api", tags=["projects and sources"])
Store = Annotated[object, Depends(get_store)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NameInput(Input):
    name: str = Field(min_length=1, max_length=200)


class ProjectInput(NameInput):
    organization_id: str
    go_live_target: date | None = None


class ProjectEdit(NameInput):
    go_live_target: date | None = None


class PropertyInput(NameInput):
    portfolio_id: str | None = None


class ContactInput(NameInput):
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(min_length=1, max_length=100)
    authorization_note: str = Field(default="Unverified", max_length=4000)

    @field_validator("email")
    @classmethod
    def email_shape(cls, value):
        if "@" not in value or any(c.isspace() for c in value):
            raise ValueError("Enter a valid email")
        return value.lower()


class TranscriptInput(NameInput):
    text: str = Field(min_length=1, max_length=500000)


class MembershipInput(Input):
    email: str = Field(min_length=3, max_length=320)


def audit(db, project_id, user, action, target):
    db.add(
        AuditEvent(
            project_id=project_id,
            actor_type="internal_user",
            actor_reference=user.id,
            action=action,
            target_id=target,
        )
    )


def project_access(db, user, project_id):
    project = db.scalar(
        select(Project)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(Project.id == project_id, ProjectMembership.user_id == user.id)
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def scoped_object(db, model, project_id, object_id):
    row = db.scalar(select(model).where(model.id == object_id, model.project_id == project_id))
    if row is None:
        raise HTTPException(404, "Record not found")
    return row


def org_access(db, user, organization_id):
    organization = db.get(Organization, organization_id)
    member = db.scalar(
        select(Project.id)
        .join(ProjectMembership)
        .where(Project.organization_id == organization_id, ProjectMembership.user_id == user.id)
        .limit(1)
    )
    if not organization or not (
        user.role == "admin" or organization.created_by == user.id or member
    ):
        raise HTTPException(404, "Organization not found")
    return organization


def project_json(project):
    return {
        "id": project.id,
        "name": project.name,
        "organization_id": project.organization_id,
        "owner_id": project.owner_id,
        "go_live_target": project.go_live_target,
        "readiness": project.readiness,
    }


@router.get("/organizations")
def organizations(db: DB, user: User):
    query = select(Organization)
    if user.role != "admin":
        member_orgs = (
            select(Project.organization_id)
            .join(ProjectMembership)
            .where(ProjectMembership.user_id == user.id)
        )
        query = query.where(
            or_(Organization.created_by == user.id, Organization.id.in_(member_orgs))
        )
    return [{"id": o.id, "name": o.name} for o in db.scalars(query.order_by(Organization.name))]


@router.post("/organizations", status_code=201)
def create_organization(data: NameInput, db: DB, user: User):
    row = Organization(name=data.name, created_by=user.id)
    db.add(row)
    db.commit()
    return {"id": row.id, "name": row.name}


@router.patch("/organizations/{organization_id}")
def edit_organization(organization_id: str, data: NameInput, db: DB, user: User):
    row = org_access(db, user, organization_id)
    if user.role != "admin" and row.created_by != user.id:
        raise HTTPException(403, "Organization owner or admin required")
    row.name = data.name
    db.commit()
    return {"id": row.id, "name": row.name}


@router.get("/projects")
def projects(db: DB, user: User):
    query = (
        select(Project)
        .join(ProjectMembership)
        .where(ProjectMembership.user_id == user.id)
        .order_by(Project.created_at.desc())
    )
    return [project_json(row) for row in db.scalars(query)]


@router.post("/projects", status_code=201)
def create_project(data: ProjectInput, db: DB, user: User):
    org_access(db, user, data.organization_id)
    row = Project(
        name=data.name,
        organization_id=data.organization_id,
        owner_id=user.id,
        go_live_target=data.go_live_target.isoformat() if data.go_live_target else None,
    )
    db.add(row)
    db.flush()
    db.add(ProjectMembership(project_id=row.id, user_id=user.id))
    audit(db, row.id, user, "project.created", row.id)
    db.commit()
    return project_json(row)


@router.get("/projects/{project_id}")
def project_detail(project_id: str, db: DB, user: User):
    return project_json(project_access(db, user, project_id))


@router.patch("/projects/{project_id}")
def edit_project(project_id: str, data: ProjectEdit, db: DB, user: User):
    row = project_access(db, user, project_id)
    row.name = data.name
    row.go_live_target = data.go_live_target.isoformat() if data.go_live_target else None
    audit(db, project_id, user, "project.updated", row.id)
    db.commit()
    return project_json(row)


@router.get("/projects/{project_id}/members")
def members(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    rows = db.scalars(
        select(InternalUser)
        .join(ProjectMembership)
        .where(ProjectMembership.project_id == project_id)
    )
    return [{"id": row.id, "email": row.email, "role": row.role} for row in rows]


@router.post("/projects/{project_id}/members", status_code=201)
def add_member(project_id: str, data: MembershipInput, db: DB, user: User):
    project_access(db, user, project_id)
    if user.role != "admin":
        raise HTTPException(403, "Admin required to assign project access")
    target = db.scalar(
        select(InternalUser).where(
            InternalUser.email == data.email.lower(), InternalUser.disabled.is_(False)
        )
    )
    if target is None:
        raise HTTPException(404, "Provision this staff account with the operator command first")
    existing = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id, ProjectMembership.user_id == target.id
        )
    )
    if not existing:
        db.add(ProjectMembership(project_id=project_id, user_id=target.id))
        audit(db, project_id, user, "membership.added", target.id)
        db.commit()
    return {"id": target.id, "email": target.email, "role": target.role}


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
def remove_member(project_id: str, user_id: str, db: DB, user: User):
    project = project_access(db, user, project_id)
    if user.role != "admin":
        raise HTTPException(403, "Admin required")
    if user_id == project.owner_id:
        raise HTTPException(409, "Project owner access cannot be removed")
    row = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id, ProjectMembership.user_id == user_id
        )
    )
    if row:
        db.delete(row)
        audit(db, project_id, user, "membership.removed", user_id)
        db.commit()


@router.get("/projects/{project_id}/scopes")
def scopes(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    return {
        "portfolios": [
            {"id": p.id, "name": p.name}
            for p in db.scalars(
                select(Portfolio).where(Portfolio.project_id == project_id).order_by(Portfolio.name)
            )
        ],
        "properties": [
            {"id": p.id, "name": p.name, "portfolio_id": p.portfolio_id}
            for p in db.scalars(
                select(Property).where(Property.project_id == project_id).order_by(Property.name)
            )
        ],
    }


@router.post("/projects/{project_id}/portfolios", status_code=201)
def create_portfolio(project_id: str, data: NameInput, db: DB, user: User):
    project_access(db, user, project_id)
    row = Portfolio(project_id=project_id, name=data.name)
    db.add(row)
    db.flush()
    audit(db, project_id, user, "portfolio.created", row.id)
    db.commit()
    return {"id": row.id, "name": row.name}


@router.patch("/projects/{project_id}/portfolios/{object_id}")
def edit_portfolio(project_id: str, object_id: str, data: NameInput, db: DB, user: User):
    project_access(db, user, project_id)
    row = scoped_object(db, Portfolio, project_id, object_id)
    row.name = data.name
    audit(db, project_id, user, "portfolio.updated", row.id)
    db.commit()
    return {"id": row.id, "name": row.name}


@router.post("/projects/{project_id}/properties", status_code=201)
def create_property(project_id: str, data: PropertyInput, db: DB, user: User):
    project_access(db, user, project_id)
    if data.portfolio_id:
        scoped_object(db, Portfolio, project_id, data.portfolio_id)
    row = Property(project_id=project_id, name=data.name, portfolio_id=data.portfolio_id)
    db.add(row)
    db.flush()
    audit(db, project_id, user, "property.created", row.id)
    db.commit()
    return {"id": row.id, "name": row.name, "portfolio_id": row.portfolio_id}


@router.patch("/projects/{project_id}/properties/{object_id}")
def edit_property(project_id: str, object_id: str, data: PropertyInput, db: DB, user: User):
    project_access(db, user, project_id)
    row = scoped_object(db, Property, project_id, object_id)
    if data.portfolio_id:
        scoped_object(db, Portfolio, project_id, data.portfolio_id)
    row.name, row.portfolio_id = data.name, data.portfolio_id
    audit(db, project_id, user, "property.updated", row.id)
    db.commit()
    return {"id": row.id, "name": row.name, "portfolio_id": row.portfolio_id}


@router.get("/projects/{project_id}/contacts")
def contacts(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    return [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "authorization_note": row.authorization_note,
        }
        for row in db.scalars(
            select(CustomerContact)
            .where(CustomerContact.project_id == project_id)
            .order_by(CustomerContact.name)
        )
    ]


@router.post("/projects/{project_id}/contacts", status_code=201)
def create_contact(project_id: str, data: ContactInput, db: DB, user: User):
    project_access(db, user, project_id)
    row = CustomerContact(project_id=project_id, **data.model_dump())
    db.add(row)
    db.flush()
    audit(db, project_id, user, "contact.created", row.id)
    db.commit()
    return {"id": row.id, **data.model_dump()}


@router.patch("/projects/{project_id}/contacts/{object_id}")
def edit_contact(project_id: str, object_id: str, data: ContactInput, db: DB, user: User):
    project_access(db, user, project_id)
    row = scoped_object(db, CustomerContact, project_id, object_id)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    audit(db, project_id, user, "contact.updated", row.id)
    db.commit()
    return {"id": row.id, **data.model_dump()}


def version_json(row):
    return {
        "id": row.id,
        "document_id": row.document_id,
        "version": row.version,
        "filename": row.filename,
        "media_type": row.media_type,
        "byte_size": row.byte_size,
        "content_hash": row.content_hash,
        "parse_status": row.parse_status,
        "error_code": row.error_code,
        "created_at": row.created_at,
        "has_original": bool(row.object_key),
    }


def save_source(db, user, store, project_id, filename, content, kind, document_id=None):
    try:
        media_type = validate_file(filename, content)
    except ParseIssue as error:
        raise HTTPException(413 if str(error) == "file_too_large" else 422, str(error)) from None
    if document_id:
        # Lock the parent to serialize concurrent version allocation in PostgreSQL.
        document = db.scalar(
            select(SourceDocument)
            .where(SourceDocument.id == document_id, SourceDocument.project_id == project_id)
            .with_for_update()
        )
        if document is None:
            raise HTTPException(404, "Source not found")
        if (document.kind == "transcript") != (kind == "transcript"):
            raise HTTPException(422, "Source revisions must keep their intake type")
    else:
        document = SourceDocument(project_id=project_id, name=filename, kind=kind)
        db.add(document)
        db.flush()
    number = (
        db.scalar(
            select(func.max(SourceVersion.version)).where(SourceVersion.document_id == document.id)
        )
        or 0
    ) + 1
    version_id = str(uuid4())
    object_key = f"projects/{project_id}/sources/{document.id}/{version_id}"
    version = SourceVersion(
        id=version_id,
        project_id=project_id,
        document_id=document.id,
        version=number,
        filename=filename,
        media_type=media_type,
        byte_size=len(content),
        content_hash=hashlib.sha256(content).hexdigest(),
    )
    db.add(version)
    db.flush()
    try:
        store.put(object_key, content)
        version.object_key = object_key
    except Exception:
        version.parse_status, version.error_code = "failed", "storage_write_failed"
        audit(db, project_id, user, "source.storage_failed", version.id)
        db.commit()
        raise HTTPException(
            503,
            "Private storage unavailable. Failed source is recorded; upload a new version to retry.",
        ) from None
    db.add(Job(project_id=project_id, kind="ingestion", source_version_id=version.id))
    audit(db, project_id, user, "source.version_uploaded", version.id)
    db.commit()
    return version_json(version)


def safe_filename(name):
    name = PurePosixPath((name or "upload").replace("\\", "/")).name
    if not name or len(name) > 200 or any(ord(c) < 32 for c in name):
        raise HTTPException(422, "Invalid filename")
    return name


@router.post("/projects/{project_id}/sources/upload", status_code=201)
def upload(
    project_id: str,
    db: DB,
    user: User,
    store: Store,
    file: Annotated[UploadFile, File()],
    document_id: str | None = None,
):
    project_access(db, user, project_id)
    filename = safe_filename(file.filename)
    try:
        content = file.file.read(settings.max_upload_bytes + 1)
    finally:
        file.file.close()
    return save_source(db, user, store, project_id, filename, content, "file", document_id)


@router.post("/projects/{project_id}/sources/transcript", status_code=201)
def transcript(
    project_id: str,
    data: TranscriptInput,
    db: DB,
    user: User,
    store: Store,
    document_id: str | None = None,
):
    project_access(db, user, project_id)
    filename = safe_filename(
        data.name if data.name.lower().endswith(".txt") else data.name + ".txt"
    )
    return save_source(
        db, user, store, project_id, filename, data.text.encode(), "transcript", document_id
    )


@router.get("/projects/{project_id}/sources")
def sources(project_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    docs = db.scalars(
        select(SourceDocument)
        .where(SourceDocument.project_id == project_id)
        .order_by(SourceDocument.created_at.desc())
    ).all()
    versions = db.scalars(
        select(SourceVersion)
        .where(SourceVersion.project_id == project_id)
        .order_by(SourceVersion.version.desc())
    ).all()
    by_document = {}
    for version in versions:
        by_document.setdefault(version.document_id, []).append(version_json(version))
    return [
        {"id": d.id, "name": d.name, "kind": d.kind, "versions": by_document.get(d.id, [])}
        for d in docs
    ]


@router.get("/projects/{project_id}/sources/versions/{version_id}/blocks")
def blocks(
    project_id: str,
    version_id: str,
    db: DB,
    user: User,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    project_access(db, user, project_id)
    version = scoped_object(db, SourceVersion, project_id, version_id)
    query = select(SourceBlock).where(
        SourceBlock.project_id == project_id, SourceBlock.source_version_id == version_id
    )
    count = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(SourceBlock.position, SourceBlock.id).offset(offset).limit(limit)
    )
    return {
        "version": version_json(version),
        "total": count,
        "blocks": [
            {"id": b.id, "text": b.text, "locator": b.locator, "position": b.position} for b in rows
        ],
    }


@router.get("/projects/{project_id}/sources/versions/{version_id}/original")
def original(project_id: str, version_id: str, db: DB, user: User, store: Store):
    project_access(db, user, project_id)
    version = scoped_object(db, SourceVersion, project_id, version_id)
    if not version.object_key:
        raise HTTPException(404, "Original not available for this version")
    try:
        content = store.get(version.object_key)
    except Exception:
        raise HTTPException(503, "Private storage unavailable") from None
    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''"
            + quote(version.filename or "source"),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@router.post("/projects/{project_id}/sources/versions/{version_id}/retry")
def retry(project_id: str, version_id: str, db: DB, user: User):
    project_access(db, user, project_id)
    version = db.scalar(
        select(SourceVersion)
        .where(SourceVersion.id == version_id, SourceVersion.project_id == project_id)
        .with_for_update()
    )
    if not version:
        raise HTTPException(404, "Source not found")
    if version.parse_status != "failed" or not version.object_key:
        raise HTTPException(409, "Only failed jobs with stored originals can be retried")
    version.parse_status, version.error_code = "pending", None
    db.add(Job(project_id=project_id, kind="ingestion", source_version_id=version.id))
    audit(db, project_id, user, "source.parse_retried", version.id)
    db.commit()
    return version_json(version)
