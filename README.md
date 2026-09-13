# praxi

Practice management software for a German *Heilpraktiker für Psychotherapie*
practice. One practitioner, one tenant, running locally on a Mac.

`CLAUDE.md` holds the architecture, the domain rules and the target data model.
`WORKPLAN.md` holds the slice order and the current progress. `DEPLOY.md`
holds the production deployment steps.

## Requirements

- **Node 24 LTS** — the exact version is pinned in `.nvmrc`
- **pnpm 11** — `corepack enable` is enough, the version is pinned in
  `package.json` under `packageManager`
- **Docker** — for Postgres 17 locally; the application itself is not
  containerised for development, only for the production deployment
  described in `DEPLOY.md`

## Setup

```bash
corepack enable          # provides the pinned pnpm
pnpm install
cp .env.example .env     # then set SEED_USER_PASSWORD and BETTER_AUTH_SECRET
pnpm db:up               # starts Postgres 17 on host port 55432
pnpm db:migrate          # creates the tables
pnpm db:app-role         # gives the server's own role its password (required)
pnpm db:seed             # local development: tenant, user, catalogues, example prices
pnpm dev                 # http://localhost:5173
```

The server does **not** connect as the owner. `praxi` is a superuser, has
`BYPASSRLS` and owns every table, so row-level security would never apply to it;
the server uses `praxi_app` instead, through `APP_DATABASE_URL`. Migrations, the
seed and the scripts keep `DATABASE_URL`. Generate the password once, put it in
both `APP_DATABASE_PASSWORD` and `APP_DATABASE_URL`, and run `pnpm db:app-role`:

```bash
openssl rand -hex 24      # APP_DATABASE_PASSWORD
```

`BETTER_AUTH_SECRET` signs the session cookie and is the one variable the
server refuses to start without — without it nobody could sign in, which is
better said at startup than at the login form:

```bash
openssl rand -hex 32      # BETTER_AUTH_SECRET
```

Like `ENCRYPTION_KEY` below, it holds a key things are protected *with*, never
a credential being protected. Changing it invalidates every open session and
costs one sign-in; it loses no data.

Sign in with `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` from your `.env`. The
seed is idempotent and never overwrites the password of a user that already
exists — to change it, delete the user and seed again. Authentication runs on
[Better Auth](https://www.better-auth.com); the password is hashed with argon2
by this application's own functions, which the library is handed rather than
using its own scrypt.

`pnpm dev` starts three processes: the shared package in watch mode, the Hono
server on port 3000, and Vite on port 5173. Work happens on **5173** — Vite
proxies `/api` to the server, so the frontend always calls the relative path
`/api` and needs no environment switch.

## Production mode

```bash
pnpm build
pnpm start               # http://localhost:3000
```

`pnpm build` compiles the shared package and the server to `dist/` and writes
the SPA into `apps/server/public`. `pnpm start` then serves the API and the SPA
from a **single process on port 3000**. Unknown paths fall back to `index.html`
so client-side routing survives a reload; unknown `/api` paths stay a JSON 404.

Set `NODE_ENV=production` for the static file serving to be registered.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | shared watch + server (3000) + Vite (5173) |
| `pnpm build` | shared → server → SPA into `apps/server/public` |
| `pnpm start` | single process on port 3000 |
| `pnpm typecheck` | `tsc` across all packages, in dependency order |
| `pnpm test` | Vitest across all packages |
| `pnpm lint` | Biome (lint + format check) |
| `pnpm format` | Biome, writing fixes |
| `pnpm db:up` / `pnpm db:down` | start / stop Postgres |
| `pnpm db:migrate` | apply pending migrations (written by hand — see below) |
| `pnpm db:app-role` | give the server's own role its password |
| `pnpm db:seed` | `praxi dev seed` — local development only |
| `pnpm db:seed:demo` | `praxi dev demo` — local development only |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm praxi …` | the administration CLI, below |

## The CLI

Administration — creating tenants and users — is `praxi`, one entry point with
subcommands:

```bash
pnpm praxi                       # the list
pnpm praxi tenant create         # asks for what it needs
pnpm praxi tenant create --help
pnpm praxi user add --tenant "Praxis am Wall"
```

In the container there is no pnpm, and the image installs a wrapper, so it is
`praxi tenant create` there too — that is what goes into Coolify's *Execute
Command*.

**A missing value is asked for, a given one is not**, and `--no-input` turns
asking off and aborts naming the flag instead — which is also what happens on
its own when there is no terminal, so a command in a pipe refuses rather than
waiting for an answer that cannot come. Both paths validate with the same Zod
schema the API uses; only the reaction differs, because a script cannot be asked
twice.

A password can be typed at a prompt (hidden, asked twice), passed as
`--password`, or read with `--password-stdin`. Prefer the first by hand and the
third in a script: `--password` lands in the shell history, in the process table
while the command runs, and in Coolify's command log.

Every command writes through one transaction scoped to one tenant, as
`praxi_app`, under the row-level-security policies — `tenant create` included:
the id is generated first, and the policy on `tenant` then permits that one
tenant and no other. The owner's connection is handed out in `cli/owner.ts`
alone, for the tenant directory, which is the one read that legitimately looks
across tenants.

**`praxi dev seed` and `praxi dev demo` are for local development only.** They
write a made-up practice, invented prices and demo patients. The runner refuses
them when `NODE_ENV` is `production`, and their data (`src/cli/seeds/demo/`) is
not copied into the container image at all, so on a server they fail whatever
`NODE_ENV` says. `praxi tenant create` is the one that creates a real practice,
and it invents nothing: the practice name is asked for and every other field
stays empty.

The starting catalogues live in `apps/server/src/cli/seeds/default/` as one JSON
file per catalogue, each validated against the same schema the settings form
uses. `README.md` there says why the values are what they are — some of the
orders carry a decision.

## Database

Postgres 17 runs in Docker on **host port 55432** — deliberately far away from
5432 and 5433 so it cannot clash with another local Postgres. Its data lives in
a bind mount under `.docker-data/`, which is not in version control.

The server refuses to start when Postgres is unreachable, rather than failing at
the first request.

### Migrations are written by hand

There is no `pnpm db:generate`. drizzle-kit sees only what stands in
`db/schema.ts` — not the triggers, the row-level-security policies, the
`EXCLUDE` constraint, the partial indexes or the ICU locale guard — so a
generated migration would look complete and be half a schema. Write the file
out in full, including `set_updated_at`, `ENABLE ROW LEVEL SECURITY` and the
table's tenant policy; `routes/rls.test.ts` fails if the last of those is
missing.

`src/db/migrations/0000_baseline.sql` is the whole schema at go-live, produced
with `pg_dump --schema-only` against a database the old migrations had built.
Its header says what it contains and what it must never be regenerated from.

### Tests need the database

The domain layer is tested against a real Postgres — triggers and constraints
are part of the rules being tested and cannot be checked any other way. So
`pnpm test` needs `pnpm db:up`.

Each Vitest worker gets its own database (`praxi_test_w1`, `praxi_test_w2`, …)
on the same container, created and migrated on first use and truncated between
test cases. Workers never share tables, so the suite stays correct while Vitest
runs files in parallel. The development database is never touched.

## Ports

| Port | Process |
|---|---|
| 5173 | Vite dev server (development only) |
| 3000 | Hono — API always, SPA in production |
| 55432 | Postgres in Docker |

## Google Calendar

Optional and off until configured. Create a Google Cloud project, enable the
Calendar API, add an OAuth client of type *Desktop app*, and put its id and
secret plus a key for the token store into `.env`:

```bash
openssl rand -hex 32      # ENCRYPTION_KEY
```

`ENCRYPTION_KEY` is the key credentials are encrypted *with*, not a credential
itself — no password of yours belongs in it. It covers the Google refresh token
and the SMTP password alike.

Then connect under *Einstellungen → Google-Kalender* and pick a practice
calendar — ideally one of its own, not a private one.

**Google never receives data identifying a patient.** An event carries the
contact number, the times and one bit of status; there is no description, no
participants and no invitation. The reasoning is § 203 StGB and sits in full at
the top of `apps/server/src/google/payload.ts`. The read side asks for busy
intervals only, and the token's scope (`calendar.freebusy`, never
`calendar.readonly`) is what makes that a guarantee rather than a promise.

Pushes go through an outbox, so a failed call never blocks entering or moving
an appointment — pulling the network cable breaks nothing.

## Sending invoices by mail

Optional and off until configured. The SMTP account is entered under
*Einstellungen → Mailversand* — it is configuration, not deployment, so it does
not live in `.env`. The password is encrypted at rest with `ENCRYPTION_KEY`, the
same mechanism as the Google refresh token.

The **test send goes to the configured sender address and nowhere else**. There
is no field for another address and no parameter that could carry one: a button
that exists to check the configuration must not double as a way to send an
invoice somewhere by accident.

Sending is never automatic and never part of finalizing — always a separate
action, and a draft cannot be sent at all. Every attempt is recorded with time,
recipient and outcome, failures included; the last successful send is derived
from that log rather than stored on the invoice.

## Layout

```
apps/server      Hono API, Drizzle schema and migrations, PDF rendering
apps/web         Vite + React 19 + TanStack Router SPA
packages/shared  Zod schemas, imported by both sides
```

`apps/server/data/` holds uploaded PDF templates, generated invoice PDFs and
note attachments. It sits outside the web root on purpose: nothing in it is ever
served statically, only through an authenticated route.

## Conventions

Code, identifiers, comments and documentation are English; everything the
practitioner reads is German. German strings live in
`apps/server/src/messages.ts` and `apps/web/src/lib/strings.ts`, never inlined.

Logs carry identifiers, never content — no names, no note text, no file names,
no query strings. See `CLAUDE.md` rule 12.
