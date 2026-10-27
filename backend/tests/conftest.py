import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app import main, worker
from app.auth import get_db, password_hash
from app.config import settings
from app.models import InternalUser
from app.seed import key, seed
from app.storage import get_store
from tests.support import MemoryStore, Staff, sign_in


@pytest.fixture
def engine(tmp_path, monkeypatch):
    # TEST_DATABASE_URL must point to a disposable empty database.
    url = os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(Config("alembic.ini"), "head")
    engine = create_engine(url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    yield engine
    engine.dispose()
    command.downgrade(Config("alembic.ini"), "base")


@pytest.fixture
def session(engine):
    with Session(engine) as session:
        seed(session)
        session.commit()
        yield session


@pytest.fixture
def client(engine):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        seed(db)
        user = db.get(InternalUser, key("staff"))
        user.password_hash = password_hash("fictional-passphrase-2026")
        user.role = "admin"
        db.add(
            InternalUser(
                id="outsider",
                email="outsider@example.invalid",
                password_hash=password_hash("another-fictional-passphrase"),
            )
        )
    memory = MemoryStore()

    def db_override():
        with factory() as db:
            yield db

    main.app.dependency_overrides[get_db] = db_override
    main.app.dependency_overrides[get_store] = lambda: memory
    with TestClient(main.app) as client:
        yield client, factory, memory
    main.app.dependency_overrides.clear()


@pytest.fixture
def staff(client, monkeypatch):
    web, factory, memory = client
    monkeypatch.setattr(worker, "SessionLocal", factory)
    return Staff(web, factory, memory, sign_in(web))
