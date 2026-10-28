#!/usr/bin/env bash
# Back up the database and the private object store into one timestamped directory.
#
#   scripts/backup.sh [target-dir]        (run from the repository root, stack running)
#
# Produces <dir>/postgres.dump (pg_dump custom format) and <dir>/objects/ (a mirror of the private
# bucket). Copy the directory off the host and keep it as protected as the live data: it contains
# customer documents and responses. Verify restores regularly with scripts/restore_check.py.
# The script refuses to report success unless the objects it mirrored are visible in the target.
set -euo pipefail

dir="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
compose="${COMPOSE:-docker compose}"
mkdir -p "$dir/objects"
abs="$(cd "$dir" && pwd)"  # works for relative and absolute targets alike

echo "Dumping PostgreSQL..."
$compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$dir/postgres.dump"
test -s "$dir/postgres.dump" || { echo "Database dump is empty" >&2; exit 1; }

echo "Mirroring the private bucket..."
mirror_log="$($compose run --rm --no-deps -T \
  -v "$abs/objects:/backup" \
  --entrypoint /bin/sh storage-init -c '
    set -e
    mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite local/onboard-private /backup >/dev/null
    expected=$(mc ls --recursive local/onboard-private | wc -l)
    actual=$(find /backup -type f | wc -l)
    if [ "$expected" != "$actual" ]; then
      echo "Object mirror incomplete: bucket has $expected objects, backup has $actual" >&2
      exit 1
    fi
    echo "Mirrored $actual objects"')"

reported="$(echo "$mirror_log" | sed -n 's/^Mirrored \([0-9]*\) objects$/\1/p')"
on_host="$(find "$dir/objects" -type f | wc -l | tr -d ' ')"
if [ -z "$reported" ] || [ "$reported" != "$on_host" ]; then
  echo "Container mirrored ${reported:-no} objects but $on_host are visible in $dir/objects." >&2
  echo "The target directory is probably not shared with Docker; use a path inside the project." >&2
  exit 1
fi
echo "Mirrored $on_host objects"

echo "Backup written to $dir"
du -sh "$dir/postgres.dump" "$dir/objects" 2>/dev/null || true
