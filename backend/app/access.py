"""Repository boundary; caller identity must come from future M1 authentication."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProjectMembership


def require_membership(session: Session, user_id: str, project_id: str) -> None:
    membership = session.scalar(
        select(ProjectMembership).where(
            ProjectMembership.user_id == user_id, ProjectMembership.project_id == project_id
        )
    )
    if membership is None:
        raise PermissionError("Project access denied")


def project_records(session: Session, model, *, user_id: str, project_id: str):
    require_membership(session, user_id, project_id)
    return session.scalars(select(model).where(model.project_id == project_id)).all()
