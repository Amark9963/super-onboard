"""Prove that a database backup can actually be restored.

Dumps the application database, restores the dump into a throw-away database inside the same
PostgreSQL container, compares the migration revision and row counts of every table, then drops the
scratch database. The application database is only read, never modified.

    python scripts/restore_check.py            (run from the repository root, stack running)

Exit status 0 means the restore produced identical row counts. Run it before trusting any backup
procedure and after every migration.
"""

import subprocess
import sys

SCRATCH = "onboard_restore_check"


def compose(*args, stdin=None, check=True):
    result = subprocess.run(["docker", "compose", *args], input=stdin, capture_output=True, check=False)
    if check and result.returncode:
        sys.exit(f"command failed: docker compose {' '.join(args)}\n{result.stderr.decode()[-600:]}")
    return result


def psql(database, sql):
    result = compose(
        "exec", "-T", "postgres", "sh", "-c",
        f'psql -U "$POSTGRES_USER" -d {database} -At -c "{sql}"',
    )
    return result.stdout.decode().strip()


def counts(database):
    tables = psql(
        database, "select tablename from pg_tables where schemaname = 'public' order by 1"
    ).splitlines()
    return {t: int(psql(database, f'select count(*) from "{t}"')) for t in tables}


def main():
    compose("exec", "-T", "postgres", "sh", "-c", f'dropdb -U "$POSTGRES_USER" --if-exists {SCRATCH}')
    dump = compose("exec", "-T", "postgres", "sh", "-c", 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"').stdout
    print(f"dump size: {len(dump):,} bytes")
    compose("exec", "-T", "postgres", "sh", "-c", f'createdb -U "$POSTGRES_USER" {SCRATCH}')
    try:
        restored = compose(
            "exec", "-T", "postgres", "sh", "-c",
            f'pg_restore -U "$POSTGRES_USER" -d {SCRATCH} --no-owner --exit-on-error',
            stdin=dump, check=False,
        )
        if restored.returncode:
            sys.exit("pg_restore failed:\n" + restored.stderr.decode()[-800:])
        live_db = compose("exec", "-T", "postgres", "sh", "-c", "echo $POSTGRES_DB").stdout.decode().strip()
        original, copy = counts(live_db), counts(SCRATCH)
        revision = (psql(live_db, "select version_num from alembic_version"), psql(SCRATCH, "select version_num from alembic_version"))
        assert revision[0] == revision[1], f"migration revision differs: {revision}"
        assert original == copy, {t: (original.get(t), copy.get(t)) for t in set(original) | set(copy) if original.get(t) != copy.get(t)}
        # The immutable-history triggers must survive a restore too.
        trigger_sql = "select count(*) from pg_trigger where not tgisinternal"
        triggers = int(psql(SCRATCH, trigger_sql))
        assert triggers == int(psql(live_db, trigger_sql)) > 0, "triggers were not restored intact"
        rows = sum(original.values())
        print(f"PASS: restored {len(original)} tables / {rows:,} rows, revision {revision[0]}, {triggers} triggers")
    finally:
        compose("exec", "-T", "postgres", "sh", "-c", f'dropdb -U "$POSTGRES_USER" --if-exists {SCRATCH}')


if __name__ == "__main__":
    main()
