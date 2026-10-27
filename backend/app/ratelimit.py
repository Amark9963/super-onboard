"""Small database-backed fixed-window limiter (shared by all API processes)."""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.models import LoginThrottle
from app.tokens import hash_token


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def throttle(db, name: str, limit: int, window_minutes: int, detail: str = "Too many requests"):
    """Count one hit for `name`; raise 429 (after persisting the counter) above `limit`."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    now = datetime.now(timezone.utc)
    key = hash_token("rate:" + name)
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(LoginThrottle).values(key=key, attempts=0, window_start=now).on_conflict_do_nothing()
    )
    row = db.scalar(select(LoginThrottle).where(LoginThrottle.key == key).with_for_update())
    if _utc(row.window_start) < now - timedelta(minutes=window_minutes):
        row.attempts, row.window_start = 0, now
    if row.attempts >= limit:
        db.commit()
        raise HTTPException(429, detail)
    row.attempts += 1
    db.commit()
