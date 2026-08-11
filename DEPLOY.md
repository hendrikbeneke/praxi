# Deployment

praxi runs in production on a netcup root server, deployed from this GitHub
repository by a self-hosted [Coolify](https://coolify.io) instance. Coolify
builds the `Dockerfile` at the repository root, terminates TLS with its own
bundled reverse proxy (Traefik), and Postgres runs as a separate Coolify
database resource — there is no application-level `docker-compose.yml`;
`docker-compose.yml` in this repository stays what it always was, Postgres
for local development only.

Nothing in the application code branches on this — see `CLAUDE.md`'s note
that business logic sits behind an HTTP API and nothing depends on running on
localhost. This file is the checklist from an empty server to a running
instance.

## 1. Prerequisites

- Docker installed on the netcup server (Coolify's own installer handles
  this)
- Coolify installed — a single script per the
  [Coolify docs](https://coolify.io/docs/installation)
- A domain's DNS `A` record pointing at the server's IP

## 2. Coolify project

Create one Coolify project with one environment. Everything below — the
database and the application — goes into that same environment, because
Coolify only attaches resources to each other's internal Docker network
within one environment.

## 3. Postgres resource

Add a PostgreSQL database resource:

- **Image**: `postgres:17-alpine` — the same tag `docker-compose.yml` uses
  locally.
- **Environment variable**: add
  `POSTGRES_INITDB_ARGS=--locale-provider=icu --icu-locale=de-DE --encoding=UTF8`.
  This only takes effect while the data directory is still empty — set it
  *before* the first start, not after. Migration `0002` asserts this locale
  at every migration run (`datlocprovider`/`datlocale`) and refuses to
  proceed with instructions if it is missing; a wrong choice here surfaces
  immediately and loudly, not as a later ordering bug.
- Leave the public port **off**. The application reaches Postgres over
  Coolify's internal network by service hostname — nothing outside that
  network needs to reach it at all.
- Note the **internal connection string** Coolify shows for this resource
  (host/service name, port, credentials) — that becomes `DATABASE_URL` in
  step 5. It is not `localhost` and not port `55432` — those are the local
  `docker-compose.yml` values and do not apply here.

## 4. Application resource

- Connect the GitHub repository, branch `main`.
- Build pack: **Dockerfile** (the one at the repository root).
- Port: `3000`.
- Health check path: `/api/health`.
- Domain: the one pointed at in step 1; enable Coolify's automatic TLS.

## 5. Environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | |
| `DATABASE_URL` | the internal connection string from step 3 | not `localhost` |
| `LOG_LEVEL` | `info` | |
| `DATA_DIR` | `/data` | matches the volume mount in step 6 |
| `GOOGLE_CLIENT_ID` | the **Web application** client's id | see step 7, not the local Desktop client |
| `GOOGLE_CLIENT_SECRET` | that client's secret | |
| `ENCRYPTION_KEY` | freshly generated, see below | **never** the local `.env` value |
| `GOOGLE_REDIRECT_URI` | `https://<domain>/api/google/oauth/callback` | |

Mark `DATABASE_URL`, `GOOGLE_CLIENT_SECRET` and `ENCRYPTION_KEY` as secrets in
Coolify's UI.

### `ENCRYPTION_KEY` must never change once set

Generate it once, on the server, and never regenerate it on a later
redeploy:

```bash
openssl rand -hex 32
```

It is the key `src/secrets.ts` uses to decrypt the Google refresh token and
the SMTP password stored in the database (AES-256-GCM). If this value is
lost or replaced, both become permanently undecryptable — not corrupted, just
unreadable with the new key — and the only way back is re-entering both: a
new SMTP password in the settings and a fresh Google authorization. Nothing
about the record itself is damaged, but the software cannot tell you that
without the key; it will look like a broken connection. Treat it exactly
like a password with no recovery mechanism, because that is what it is:
store it in Coolify's secret store and nowhere else, and do not let a
"regenerate all secrets" habit from other projects touch this one.

## 6. Persistent volume for `DATA_DIR`

netcup has no block storage — this is a directory on the server's own disk,
mounted into the container. In Coolify's "Persistent Storage" for the
application resource, add a mount: host path e.g.
`/data/coolify-volumes/praxi-data`, container path `/data`.

The container runs as the image's built-in `node` user (uid 1000), not root
— a host directory that Docker creates on first mount is typically owned by
`root`, which would make every write from the application fail. Before the
first deployment, on the server:

```bash
mkdir -p /data/coolify-volumes/praxi-data
chown -R 1000:1000 /data/coolify-volumes/praxi-data
```

Nothing needs to be created inside it — `domain/file-store.ts` creates the
`invoices/`, `files/` and template subdirectories as needed, recursively, on
first write.

## 7. Google Cloud: a new Web application client

The code needs no change — `google/oauth.ts` already takes the redirect URI
from `GOOGLE_REDIRECT_URI` and runs the same PKCE flow regardless. What
changes is the Google Cloud configuration:

1. In the same (or a new) Google Cloud project, create a **new** OAuth
   client of type **Web application** — the existing Desktop client used
   for local development stays untouched and keeps working locally.
2. Under **Authorized redirect URIs**, add exactly
   `https://<domain>/api/google/oauth/callback`. This is the actual reason a
   second client is needed: a Desktop client only ever accepts a loopback
   redirect, so pointing `GOOGLE_REDIRECT_URI` at a public HTTPS URL with
   the Desktop client's credentials would be rejected by Google outright.
3. Use that client's id and secret for `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` in step 5.
4. After the first deployment, connect the calendar once from
   *Einstellungen → Google-Kalender* on the production instance. This
   creates its own `google_connection` row, independent of any local one.

## 8. First deployment

Trigger it from the Coolify UI. There is no separate migration step to
configure: the image's `CMD` runs `node apps/server/dist/db/migrate.js`
before starting the server, so migrations always run against the code that
is actually about to serve traffic — including the very first deployment,
when there is no previous container yet to run anything against.

This is deliberate and not Coolify's built-in pre/post-deployment command
hooks. Coolify's **pre-deployment command** runs inside the *previous*
container, before the new image is even built — on the first deployment
there is no previous container, so it would be silently skipped; on any
later one it would run with the *old* code's migration files, never the new
ones. Its **post-deployment command** does run inside the new container, but
only after Coolify has already switched traffic to it and marked the
deployment finished — a failing command there is only logged as a warning,
not treated as a deployment failure. Neither gives what a schema migration
needs: run with the new code, before it takes traffic, and hard-fail the
deployment if it doesn't apply.

**What happens if the migration fails**: the container's `CMD` chain exits
non-zero without ever calling `node apps/server/dist/index.js`, so nothing
ever listens on port 3000. Coolify's health check on `/api/health` never
turns green, the new container never receives traffic, and the previous
container — if this is not the first deployment — keeps serving exactly as
before. The failure is visible in the deployment's container log in the
Coolify UI. There is currently one instance and no horizontal scaling, so
there is no concern about two containers racing to apply the same
migration.

## 9. Seed the first user

`SEED_USER_EMAIL`, `SEED_USER_NAME` and `SEED_USER_PASSWORD` are read only by
the seed script, never by the running server — they do not need to live in
the application's permanent environment variables. Recommended: set them
temporarily (Coolify's "Execute Command" against the running container, with
those three added just for that command), run

```bash
node apps/server/dist/db/seed/run.js
```

once, then remove them again from the persistent environment. The seed
refuses an empty or too-short password and never overwrites the password of
a user that already exists, so leaving them set would be harmless, not
dangerous — removing them afterwards is simply keeping a plaintext password
out of the secret store for longer than it needs to be there.

## 10. Verify

- `https://<domain>/api/health` answers `{"status":"ok", ...}`.
- Log in with the seeded user.
- Create a contact, log an activity, finalize an invoice and open the
  resulting PDF — exercises `DATA_DIR` and PDF rendering end to end.
- Connect the Google calendar (step 7.4) and check a busy interval shows up
  when scheduling.

## What is still open after this

This slice is infrastructure only. `WORKPLAN.md`'s "Before going live"
section lists what is deliberately not part of it — rate limiting, RLS,
an access log, a retention/deletion concept, and squashing the migration
history into a `pg_dump` baseline. Backups are not covered there either and
are being handled separately, outside this document.
