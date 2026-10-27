"""Operator-only user provisioning. No default passwords or public registration."""

import argparse
import getpass
import os

from sqlalchemy import delete, select

from app.auth import password_hash
from app.db import SessionLocal
from app.models import InternalSession, InternalUser


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=["admin", "specialist", "manager"], default="specialist")
    parser.add_argument("--reset-password", action="store_true")
    args = parser.parse_args()
    password = os.environ.get("BOOTSTRAP_PASSWORD") or getpass.getpass(
        "New password (12+ characters): "
    )
    if len(password) < 12 or len(password) > 1024:
        raise SystemExit("Password must contain 12–1024 characters")
    email = args.email.strip().lower()
    if "@" not in email or len(email) > 320:
        raise SystemExit("A valid email is required")
    with SessionLocal.begin() as db:
        user = db.scalar(select(InternalUser).where(InternalUser.email == email))
        if user and user.password_hash and not args.reset_password:
            raise SystemExit("Account already enabled; use --reset-password to rotate credentials")
        if user is None:
            user = InternalUser(email=email)
            db.add(user)
            db.flush()
        user.password_hash, user.role, user.disabled = password_hash(password), args.role, False
        db.execute(delete(InternalSession).where(InternalSession.user_id == user.id))
    print("Account provisioned; existing sessions revoked. Password was not logged.")


if __name__ == "__main__":
    main()
