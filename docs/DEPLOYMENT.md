# Deployment guide

This guide takes the local development stack to a single-host production deployment behind TLS. It is a starting point, not a certification: **the production override was validated for configuration only. It has not been deployed to a real host, no certificate has been issued with it, and no real mail relay has been exercised.** Review everything against your own security and privacy requirements, especially because the application stores customer documents and responses.

Super Onboard is independent software and is not affiliated with or endorsed by Super. No license has been selected for this code yet; choose one before distributing it.

## What you need

- A Linux host with Docker Engine and Compose v2.24+, 4 GB RAM or more, and persistent disk for the `postgres-data` and `minio-data` volumes (plus off-host backup space).
- A DNS name pointing at the host and ports 80/443 reachable from the internet (Caddy obtains and renews the certificate).
- An SMTP relay you control for invitation email (STARTTLS recommended).
- Long random secrets for the database and object store, generated and stored in your secret manager.

## Configuration

Create `.env.prod` (never commit it) next to `compose.yaml`:

| Variable | Purpose |
|---|---|
| `DOMAIN` | Public host name, for example `onboard.example.com`. Sets `APP_ORIGIN`/`PUBLIC_BASE_URL` and the TLS site. |
| `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` | **Required**, no defaults in production. Use 32+ random characters. |
| `POSTGRES_USER`, `POSTGRES_DB`, `MINIO_ROOT_USER` | Optional overrides. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_STARTTLS`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Mail relay. `SMTP_HOST` and `SMTP_FROM` are required. |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Optional live extraction. Leave `AI_API_KEY` empty to keep only the SIMULATED mock. Enabling it sends document segments to that third-party API; tell your customers. |

Fixed by `compose.prod.yaml`: `COOKIE_SECURE=true`, `TRUSTED_PROXY_HOPS=2` (Caddy, then the web container), `WEB_PRIVATE_HOST_ALLOWLIST=` (empty: never allow website import to reach private addresses), `WEB_ALLOWED_PORTS=80,443`, no published ports except 80/443 on Caddy, Mailpit disabled, `restart: unless-stopped`.

## First start

```sh
docker compose -f compose.yaml -f compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f compose.yaml -f compose.prod.yaml exec backend python -m app.manage_user --email you@your-domain --role admin
```

The migration job runs automatically before the API and worker start. Do **not** run `python -m app.seed` in production: it creates fictional demo data. Provision staff accounts with the operator command; there is no public registration. Confirm `https://$DOMAIN/api/health` returns `{"status":"ok",...}` and sign in.

If you change the number of proxies in front of the API (for example a cloud load balancer before Caddy), update `TRUSTED_PROXY_HOPS`: too low means all clients share one address and one rate-limit budget; too high lets clients spoof their address.

## Backups and restore

Back up the database **and** the object store. Documents and their parsed blocks live in both.

```sh
scripts/backup.sh backups/$(date +%Y%m%d)                  # pg_dump + bucket mirror, verified
python scripts/restore_check.py                              # restores a fresh dump into a scratch DB and compares
```

- `scripts/backup.sh` writes `postgres.dump` and an `objects/` mirror and refuses to report success unless the number of mirrored objects matches the bucket and is visible in the target directory. Copy the result off the host and protect it like the live data; it contains customer information.
- `scripts/restore_check.py` is the restore test: it restores a dump into a throw-away database, checks the migration revision, every table's row count and that the immutable-history triggers came back, then drops the scratch database. Run it after each migration and on a schedule. It proves the database dump restores; **restoring the object mirror into a new MinIO is documented here but not scripted**, so rehearse that yourself (`mc mirror` the `objects/` directory back into `onboard-private`).
- Default retention: nothing is deleted automatically. Administrators remove data deliberately. There is currently **no application feature to delete a project**; the immutable-history triggers deliberately block ordinary deletes. A documented purge procedure (run by a database operator) is still to be written, so plan retention and customer data-deletion requests accordingly.

## Upgrades

1. Take a backup and run the restore check.
2. `git pull`, then `docker compose -f compose.yaml -f compose.prod.yaml --env-file .env.prod up -d --build`. The migrate job applies new migrations before services start. Migrations are forward-only in production; the downgrade paths exist for development and tests.
3. Check `docker compose ps` (backend, worker, frontend should be healthy; the worker health check proves its heartbeat is fresh) and sign in.

## Hardening checklist

- [ ] Strong, unique `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD`; secrets kept in a secret manager, not in the repository or shell history.
- [ ] `DOMAIN` resolves to this host; the certificate was issued (browse to `https://$DOMAIN`); HTTP redirects to HTTPS.
- [ ] `docker compose ps` shows only Caddy publishing ports; the database, storage console, API and web container are not reachable from outside (check from another machine).
- [ ] `WEB_PRIVATE_HOST_ALLOWLIST` is empty (`docker compose exec backend env | grep WEB_`).
- [ ] Host firewall allows only 22 (from your admin network), 80 and 443; SSH is key-only; the OS and Docker are patched.
- [ ] Off-host, encrypted backups with a tested restore; backup access is restricted and logged.
- [ ] Mail relay credentials are scoped to sending only; SPF/DKIM/DMARC are set for `SMTP_FROM`'s domain so invitations are deliverable.
- [ ] `docker compose logs` do not capture request bodies; the backend runs with `--no-access-log` because review-link URLs carry bearer tokens in their path. Keep it that way, and check your reverse proxy and any platform log collectors do not record full URLs of `/review/*` or `/api/public/*`.
- [ ] You decided on the MinIO situation: its upstream repository is archived and the development build is compiled from pinned source. For production, switch to a maintained S3-compatible store (managed object storage, or a supported MinIO distribution) and keep the bucket private with least-privilege credentials separate from the root user.
- [ ] You disclosed third-party AI processing (if enabled) and chose a license and privacy notice appropriate to your deployment. This software provides no compliance guarantee and no legally binding signatures: customer confirmations are bearer-link responses with unverified recipient identity.

## Local demo of website import

The `fixture-site` profile serves a tiny fictional static website (robots.txt, sitemap, a disallowed page, hidden injected text) so you can try website import without the internet:

```sh
WEB_PRIVATE_HOST_ALLOWLIST=fixture-site WEB_ALLOWED_PORTS=80,443,8080 \
  docker compose --profile fixture up -d fixture-site backend worker
```

Then import `http://fixture-site:8080/`. Recreate `backend` and `worker` without those variables afterwards to restore the safe defaults.
