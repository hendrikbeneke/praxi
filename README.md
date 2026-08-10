# praxi

Practice management software for a German *Heilpraktiker für Psychotherapie*
practice. One practitioner, one tenant, running locally on a Mac.

`CLAUDE.md` holds the architecture, the domain rules and the target data model.
`WORKPLAN.md` holds the slice order and the current progress.

## Requirements

- **Node 24 LTS** — the exact version is pinned in `.nvmrc`
- **pnpm 11** — `corepack enable` is enough, the version is pinned in
  `package.json` under `packageManager`
- **Docker** — for Postgres 17 only; the application itself is never
  containerised

## Setup

```bash
corepack enable          # provides the pinned pnpm
pnpm install
cp .env.example .env     # then set SEED_USER_PASSWORD
pnpm db:up               # starts Postgres 17 on host port 55432
pnpm db:migrate          # creates the tables
pnpm db:seed             # tenant, practice settings, user, example catalogue
pnpm dev                 # http://localhost:5173
```

Sign in with `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` from your `.env`. The
seed is idempotent and never overwrites the password of a user that already
exists — to change it, delete the user and seed again.

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
| `pnpm db:generate` | generate a migration from the Drizzle schema |
| `pnpm db:migrate` | apply pending migrations |
| `pnpm db:seed` | tenant, practice settings, user and example catalogue |
| `pnpm db:seed:services` | the example service catalogue on its own |
| `pnpm db:studio` | Drizzle Studio |

## Database

Postgres 17 runs in Docker on **host port 55432** — deliberately far away from
5432 and 5433 so it cannot clash with another local Postgres. Its data lives in
a bind mount under `.docker-data/`, which is not in version control.

The server refuses to start when Postgres is unreachable, rather than failing at
the first request.

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
openssl rand -hex 32      # GOOGLE_TOKEN_KEY
```

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
