"""Internal authentication: revocable opaque sessions, CSRF and DB-backed login limits."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.clientip import client_ip
from app.config import settings
from app.db import SessionLocal
from app.models import InternalSession, InternalUser, LoginThrottle
from app.ratelimit import throttle
from app.tokens import hash_token, new_token

router = APIRouter(prefix="/api/auth", tags=["authentication"])
COOKIE = "onboard_session"


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000)
    return f"pbkdf2_sha256$600000${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    # Use the same expensive operation for unknown accounts.
    stored = stored or "pbkdf2_sha256$600000$" + "00" * 16 + "$" + "00" * 32
    try:
        algorithm, rounds, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def get_db():
    with SessionLocal() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


def check_origin(request: Request):
    if request.headers.get("origin") != settings.app_origin:
        raise HTTPException(403, "Request origin rejected")


def current_user(request: Request, db: DB) -> InternalUser:
    token = request.cookies.get(COOKIE, "")
    if not token:
        raise HTTPException(401, "Sign in required")
    session = db.scalar(
        select(InternalSession).where(InternalSession.token_hash == hash_token(token))
    )
    if not session or utc(session.expires_at) <= now():
        raise HTTPException(401, "Sign in required")
    user = db.get(InternalUser, session.user_id)
    if not user or user.disabled:
        raise HTTPException(401, "Sign in required")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), session.csrf_token):
            raise HTTPException(403, "CSRF token required")
    request.state.auth_session = session
    return user


User = Annotated[InternalUser, Depends(current_user)]


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


def login_limit(db: Session, key: str):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(LoginThrottle)
        .values(key=key, attempts=0, window_start=now())
        .on_conflict_do_nothing()
    )
    row = db.scalar(select(LoginThrottle).where(LoginThrottle.key == key).with_for_update())
    if utc(row.window_start) < now() - timedelta(minutes=15):
        row.attempts, row.window_start = 0, now()
    if row.attempts >= 10:
        db.commit()
        raise HTTPException(429, "Too many sign-in attempts. Try again in 15 minutes.")
    row.attempts += 1


@router.post("/login")
def login(data: LoginInput, request: Request, response: Response, db: DB):
    check_origin(request)
    # Per-address limit first, so one client cannot spray guesses across many accounts.
    throttle(
        db,
        f"login-ip:{client_ip(request)}",
        settings.rate_limit_login_per_ip,
        15,
        "Too many sign-in attempts. Try again in 15 minutes.",
    )
    email = data.email.strip().lower()
    login_limit(db, hash_token("account:" + email))
    user = db.scalar(select(InternalUser).where(InternalUser.email == email))
    valid = verify_password(data.password, user.password_hash if user else None)
    if not valid or not user or user.disabled:
        db.commit()
        raise HTTPException(401, "Invalid email or password")
    # Rotate any existing browser session rather than keeping its old capability alive.
    db.execute(
        delete(InternalSession).where(
            InternalSession.token_hash == hash_token(request.cookies.get(COOKIE, ""))
        )
    )
    token, digest = new_token()
    csrf = secrets.token_hex(32)
    db.add(
        InternalSession(
            user_id=user.id,
            token_hash=digest,
            csrf_token=csrf,
            expires_at=now() + timedelta(hours=settings.session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.session_hours * 3600,
        path="/api",
    )
    return {"id": user.id, "email": user.email, "role": user.role, "csrf_token": csrf}


@router.get("/me")
def me(request: Request, user: User):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "csrf_token": request.state.auth_session.csrf_token,
    }


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User, db: DB):
    db.delete(request.state.auth_session)
    db.commit()
    response.delete_cookie(
        COOKIE, path="/api", secure=settings.cookie_secure, httponly=True, samesite="strict"
    )
