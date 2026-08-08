# WORKPLAN.md

Slice order for this repository. Read together with `CLAUDE.md`, which holds the architecture, the domain rules and the target data model.

**One slice = one plan + one DDL review + one implementation + one commit.** Do not start a slice before I confirm the plan, and do not continue to the next slice unprompted. Update the status column in this file as part of each slice's commit.

| # | Slice | Status |
|---|---|---|
| 0 | Scaffold | **done** |
| 1 | Tenant, user, login, practice settings | **done** |
| 2 | Contacts and roles | **done** |
| 3 | Services and service groups | **done** |
| 4 | Activities and appointments | todo |
| 5 | Notes, files, locking | todo |
| 6 | Invoices: draft, finalize, PDF | todo |
| 7 | Cancellation invoices | todo |
| 8 | Payments and receivables | todo |
| 9 | Google Calendar sync | todo |
| 10 | Sending invoices by email | todo |

---

## Slice 0 — Scaffold

No domain tables yet.

- pnpm workspace: `apps/server`, `apps/web`, `packages/shared`
- `docker-compose.yml` with Postgres 17 only, data in a bind mount under `.docker-data/`, on a non-default port to avoid clashing with other local projects
- Drizzle + drizzle-kit wired up, migration folder, empty schema
- Hono app with `GET /api/health`, error middleware, pino logger
- Vite + React 19 + TanStack Router with a single placeholder route, Tailwind, shadcn/ui initialized
- `apps/server/src/messages.ts` and `apps/web/src/lib/strings.ts` created, even if nearly empty
- `pnpm dev` runs Vite (5173, proxying `/api` to 3000) and the server (3000) together
- `pnpm build` builds the SPA into the server's static directory; `pnpm start` serves everything from `http://localhost:3000`
- `pnpm typecheck`, `pnpm test`, `pnpm lint` exist and pass
- `.env.example`, `.gitignore` (including `apps/server/data/` and `.docker-data/`)
- `README.md` with setup steps

**Done when:** a fresh clone reaches a working `http://localhost:3000` following only the README.

**As built.** Decisions taken in this slice, both deviating from the original stack note in CLAUDE.md and agreed before implementation:

- **Node 24 LTS** instead of Node 22. Node 22 is already in maintenance and ends April 2027; Node 24 is supported until April 2028. CLAUDE.md updated accordingly.
- **Biome 2.5** instead of ESLint + Prettier. One tool, one config file, React-hooks rules included. CLAUDE.md updated accordingly.
- **TypeScript 5.9.3**, deliberately not the newer native compiler (7.x). The type inference of Drizzle and Hono's `hc` is the load-bearing part of this codebase; the switch is a one-line bump later, because TypeScript only type-checks here and never emits for the frontend.
- Postgres on **host port 55432**.
- All dependency versions are pinned exactly, no caret ranges.
- `packages/shared` is consumed as a built package (`tsc` → `dist/`), not through a path alias — the same resolution in dev and in the production build.
- `apps/web/src/routeTree.gen.ts` is generated (`tsr generate` in `typecheck`, the Vite plugin in dev/build) and not in version control.

## Slice 1 — Tenant, user, login, practice settings

First vertical slice. It establishes the pattern every later slice copies.

- Tables `tenant`, `practice_settings`, `app_user`, `session`, with RLS policies created and disabled
- Seed: one tenant, one `practice_settings` row with fake but realistic master data, one user with a password from an env variable
- `domain/auth.ts`: argon2 verification, session creation, validation, expiry
- `middleware/auth.ts` and `middleware/tenant.ts` — tenant id derived from the session, never from the request
- Routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/PUT /api/settings`
- Session cookie `httpOnly`, `SameSite=Lax`, `secure` only when not on localhost
- UI: login page, app shell with sidebar navigation (Kontakte, Termine, Vorgänge, Rechnungen, Leistungen, Einstellungen — targets may be stubs), practice settings form
- Tests for `domain/auth.ts`

**Done when:** I can log in, edit the practice master data, reload and stay logged in, log out.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`session` carries `tenant_id`** on top of `user_id`, against the sketch, so
  the auth middleware resolves user and tenant in one select. The
  denormalization is held true by a composite foreign key
  `(user_id, tenant_id) -> app_user (id, tenant_id)`, which needs the extra
  `unique (id, tenant_id)` on `app_user`. A session cannot claim a tenant its
  user does not belong to; there is a test for it.
- **`app_user.email` is unique globally**, not per tenant — the login form has
  no tenant context — plus `check (email = lower(email))` so case cannot
  produce duplicates. The functional-index variant was the alternative; only
  one of the two, not both.
- **`invoice_template_path` / `letter_template_path` deferred to slice 6**,
  where the upload that fills them is built. Nothing on spec.
- **Tests run against a real Postgres from now on.** Isolation is one database
  per Vitest worker (`praxi_test_w1`, …), created and migrated on demand in
  `src/test/setup.ts`, truncated between test cases. The originally planned
  schema-per-worker does not work: drizzle-kit writes foreign keys as
  `REFERENCES "public"."tenant"`, so every worker would land on the same
  tables. `pnpm test` therefore needs `pnpm db:up`.
- **UUIDv7 from the `uuid` package** (`src/id.ts`). Postgres 17 has no native
  `uuidv7()`, and ids are generated in the application anyway.
- **URL paths are English** (`/login`, `/settings`, `/contacts` …), consistent
  with the identifier rule; all visible labels stay German. The glossary row in
  CLAUDE.md that was thought to say otherwise does not exist — nothing to
  change there.
- **Sessions**: 32 random bytes base64url, stored only as SHA-256, 14 days
  sliding, written back at most once an hour. Logout deletes the row; expired
  rows are cleared out on each login. Unknown email and deactivated account
  both cost a real Argon2 verification against a dummy hash produced with the
  same parameters, so neither answer nor timing tells accounts apart.
- **Seed** is `pnpm db:seed`, idempotent, refuses an empty or too short
  `SEED_USER_PASSWORD` and never overwrites the password of an existing user.
- Two things found while building, both fixed here:
  `@hono/zod-validator` answers validation failures with its own English body
  that echoes the rejected input — wrapped in `middleware/validate.ts` so it
  throws instead and only field *names* reach the log (rule 12). And `shadcn`
  pulled `next-themes` in with the toaster; removed, the toaster follows the
  operating system.

## Slice 2 — Contacts and roles

- Tables `contact` and `contact_role`
- `domain/counter.ts`: a reusable `SELECT ... FOR UPDATE` counter, used here for `contact_number` and reused for invoice numbers in slice 6. Build it properly now, at a low-risk site.
- Form adapts to `kind`: person fields versus organization fields
- Roles as a multi-select, several roles per contact, `since` recorded
- Routes: list with search across name, company name and contact number; get, create, update, archive (soft, via `archived_at`, no hard delete)
- UI: contact list (TanStack Table, role filter, archived hidden by default), create/edit form, contact detail page with tabs — Stammdaten filled, Notizen / Vorgänge / Termine / Rechnungen present but empty
- Tests for the counter, including a concurrent-call test

**Done when:** I can create people and organizations, assign several roles, search and archive them.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`number_range` created now with `code` and `next_value` only**; `prefix`
  and `padding` arrive in slice 6 with the upload that fills them.
  `domain/counter.ts` may create a missing row **only for whitelisted codes**
  (currently `contact`). For anything else — `invoice` above all — a missing
  row raises `MissingNumberRangeError`: that range is configured on purpose and
  may continue a numbering from the previous system, so a silent start at 1
  would reissue existing numbers. Both branches are tested.
- **Enum versus check constraint** is now a written rule under Conventions in
  CLAUDE.md. `contact.kind` is a `pgEnum` (structurally fixed); `contact_role.role`
  is `text` with the named constraint `contact_role_role_check` (the set is
  expected to change). The TypeScript union comes from the Zod schema in
  `packages/shared` and the Drizzle type is derived from it.
- **`contact_kind_fields` check constraint** enforces which fields belong to
  which kind. `vat_id` is deliberately *not* restricted to organizations — a
  sole trader is a person and can have a VAT id.
- **Generated column `sort_name`** (surname first, company name for
  organizations) for ordering; displaying goes through `formatContactName()` in
  `packages/shared`, which slice 6 reuses for `recipient_snapshot` so the
  stored name reads exactly like the one on screen.
- **The search term never enters the URL.** Role filter and "show archived" are
  router search params; the free-text term is component state, because in this
  application it is almost always a patient's name and the URL reaches browser
  history and autocomplete.
- **Roles travel inside the contact payload** and are reconciled in the same
  transaction. Existing rows are updated in place, never deleted and
  recreated — that is what keeps `since` from being reset on every save.
- **Composite foreign key** `(contact_id, tenant_id) -> contact (id, tenant_id)`,
  the same pattern as `session` in slice 1.
- **No index for the search** — a leading-wildcard `ILIKE` cannot use a btree,
  and at the expected row count a sequential scan beats maintaining `pg_trgm`.
  Two indexes from the first draft were dropped for the same reason: an
  `archived_at` index (the filter matches nearly every row) and a
  `contact_role (contact_id)` index (`unique (contact_id, role)` already leads
  with that column).

**`updated_at` decided for the whole schema:** a generic `set_updated_at()`
trigger, created in migration `0002` and attached to every table including the
four from slice 1; `$onUpdate` was removed from the Drizzle schema. The first
attempt skipped writes that changed nothing, which does not work: Postgres
fills generated columns *after* `BEFORE` triggers, so `NEW IS DISTINCT FROM OLD`
is always true on a table with one. Migration `0005` corrects it — `updated_at`
now means *last write*, uniformly.

Migration `0002` also asserts the database runs under the ICU provider with
locale `de-DE`, checked via `datlocprovider`/`datlocale`; `datcollate` still
reports the libc locale under ICU and would have passed a wrongly built
cluster.

## Slice 3 — Services and service groups

Deliberately small — it confirms the slice-2 pattern is repeatable.

- Tables `service`, `service_group`, `service_group_item`
- CRUD for both, `active` flag instead of deletion
- Group editor: assemble services with quantity and order
- **No pricing logic, no history.** The catalogue is a template store; see CLAUDE.md rule 5.

**Done when:** the catalogue is maintainable and inactive entries no longer appear in selection lists.

**As built.** Decisions taken in this slice, agreed before implementation:

- **`short_code` optional but unique where given**, via a partial unique index.
  A required code would force one onto services nobody ever types.
- **`default_price_cents >= 0`.** A discount is not a service; rule 5 handles
  it by editing the price on the `activity_item`. Relaxing this later is a
  `DROP CONSTRAINT` that cannot fail, which makes it the cheaper direction.
- **`quantity` is `integer`** here and on `activity_item` in slice 4. A session
  is the unit; length lives in `duration_min`.
- **`active` travels in the payload**, no `activate`/`deactivate` routes. This
  differs from archiving a contact on purpose: that is a guarded action with a
  confirmation, this is a checkbox in a form, and two paths to one outcome
  would be worse than the inconsistency.
- **Group items travel in the group payload** and are replaced wholesale in one
  transaction. Unlike a contact's roles these rows carry nothing worth
  preserving — no date, no history — so delete-and-insert is both simpler and
  correct, and `position` is rewritten from the array index.
- **No unique constraint on `position`**, so reordering does not need a
  deferred constraint or a shuffle through spare values.
- **Money formatting lives in `packages/shared`** (`formatEuro`,
  `formatEuroAmount`, `parseEuroAmount`), not in the frontend: slice 6 formats
  the same amounts server-side for the PDF, and a printed invoice must not read
  differently from the screen it was checked on. `parseEuroAmount` is the only
  logic in this slice testable without a database, and it has the tests.
- **The forms are dialogs, not routes** — again a deviation from the contacts
  pattern. A catalogue entry has seven fields and is maintained by jumping
  between many of them; keeping the list in view is worth more here than
  matching the contact page.
- **Seed** extended with a plausible HPP catalogue: seven services, one group
  (`Prüfungsvorbereitung Kompakttag`, 4× Prüfungsvorbereitung + 1× telefonische
  Beratung) so slice 4 has a real group to resolve. `fee_code` is left empty
  throughout — inventing GebüH numbers would put made-up billing codes on real
  invoices. `pnpm db:seed:services` runs that section alone; the seed never
  updates an entry that already exists.

Found while building: `uniqueViolationConstraint` read the SQLSTATE off the
thrown error directly and therefore never matched — Drizzle wraps driver errors
in a `DrizzleQueryError` and the code sits on `cause`. A duplicate short code
came back as a generic 500 with no complaint anywhere. `db/errors.ts` now walks
the cause chain, and `db/errors.test.ts` asserts it against a genuine Drizzle
error rather than a hand-built object.

## Slice 4 — Activities and appointments

Two tables in one slice because they are created together in practice.

- Tables `activity`, `activity_item`, `appointment`, plus the `btree_gist` extension and the overlap constraint on `appointment` in a hand-written migration:

```sql
ALTER TABLE appointment ADD CONSTRAINT appointment_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'cancelled_late'));
```

  SQLSTATE `23P01` is caught and translated into a readable German message.
- `domain/activity.ts`: creating an activity copies description, fee code, price and duration from the chosen services into `activity_item`; picking a `service_group` resolves it into individual items immediately and stores no group reference. Free items without `service_id` are supported.
- Creating an activity also creates its appointment by default, with an option to skip it. `activity.appointment_id` is nullable and unique.
- `billable` toggle per item, and the ability to add further items — this is how a no-show becomes an Ausfallhonorar
- Routes: activities per contact and per date range, create, update, delete; appointments by date range, reschedule, change status
- UI: week and day calendar view, create from calendar and from the contact page, activity editor with its item list, Vorgänge and Termine tabs on the contact
- Tests: price copy independent of later catalogue changes, group resolution, overlap rejection, cancelled appointments not blocking a slot

**Done when:** I can book an appointment with services, change the catalogue afterwards without the booking changing, and mark a no-show with an Ausfallhonorar.

## Slice 5 — Notes, files, locking

The most rule-heavy slice. See CLAUDE.md rule 7.

- Tables `note`, `note_file`, plus the `protect_locked_note` trigger and the equivalent guard on `note_file`
- File upload to `data/files/`, served only through an authenticated route, never statically
- `domain/note-lock.ts`: canonical serialization including file hashes, `lockNote`, `verifyChain`
- Addenda via `corrects_note_id`
- Routes: notes per contact and per activity, create, update while unlocked, lock, add addendum, upload and download files, verify chain
- UI: Notizen tab on the contact with a chronological list, editor for unlocked notes, lock button with a confirmation dialog stating plainly that this cannot be undone, addenda indented under the note they correct, chain verification view, notes also visible on the activity
- Tests: chain across several notes, tamper detection, trigger blocks updates to locked rows and their files, addendum flow

**Done when:** I can document a session, attach a file, lock it, supplement it with an addendum, and the verification reports a manually tampered row as broken.

## Slice 6 — Invoices: draft, finalize, PDF

See CLAUDE.md rules 8, 9, 10 and 11.

- Tables `invoice`, `invoice_line`, `number_range`, `text_template`, plus the immutability trigger for finalized invoices and the guard on `activity_item` referenced by a finalized invoice
- `domain/number-range.ts` (reusing the slice-2 counter): editable `next_value`, collision check on assignment with a clear error
- `domain/finalize-invoice.ts`: number, line snapshots, text snapshots, `recipient_snapshot`, total, PDF, hash, status
- Billable query per CLAUDE.md rule 6, including the cancelled-invoice exclusion — write the test for that case before the implementation
- `pdf/din5008.ts` with the Form B constants, `pdf/invoice.tsx` for the content, `pdf/overlay.ts` merging onto the uploaded template with pdf-lib; template page 2 backs all following pages when present
- Template upload in the practice settings
- Text templates: manage intro and outro blocks, mark defaults and the paid variant
- Routes: create draft from selected billable items or empty, edit lines, choose texts, preview PDF, finalize, finalize with "Betrag erhalten", download
- UI: invoice list with status filter, draft editor, billable-items picker per contact, finalize confirmation
- Tests: number assignment including concurrency and collision, snapshotting, trigger blocks changes to finalized invoices, totals

**Done when:** a finalized invoice has a number, a PDF on disk with a stored hash, correct DIN 5008 placement on the template, and cannot be modified.

## Slice 7 — Cancellation invoices

See CLAUDE.md rule 9.

- `domain/cancel-invoice.ts`: cancellation document with negative amounts, same number range, mutual references
- PDF title "Stornorechnung" with a reference to the original number
- The freed `activity_item` rows become billable again — no replacement draft is created
- UI: cancel action on a finalized invoice, both documents visibly linked
- Tests: amounts negate the original, references on both rows, no double cancellation, items reappear in the billable list

**Done when:** cancelling produces a correct second document, leaves the original untouched apart from its reference, and returns the items to the billable pool.

## Slice 8 — Payments and receivables

- Table `payment`
- Routes: record, list and delete payments for an invoice
- Derived status per invoice: open, partially paid, paid, overdue — computed, never stored
- UI: payment entry from the invoice and as a shortcut from the activity (which resolves to that activity's invoice), receivables overview with amount, due date, days overdue, filters
- Tests: partial payment, overpayment, due date arithmetic

**Done when:** the receivables view answers "who still owes what" at a glance.

## Slice 9 — Google Calendar sync

Only once everything above is in daily use. Design constraint: **Google never receives data identifying a patient.** The local database stays the system of record; Google Calendar is a projection.

- Table `google_sync_queue` (outbox), worker as a `setInterval` in the same process
- OAuth2 loopback flow (`http://127.0.0.1:PORT/oauth/callback`), refresh token stored encrypted locally
- Read: `freebusy.query` against the practitioner's private calendars, shown as busy blocks while scheduling. Intervals only, never event content.
- Write: appointments pushed to a dedicated "Praxis" calendar with the contact number as the event title, no description, no attendees, no invitations
- Limited return channel: `events.list` with `syncToken`, applying only `starts_at`, `ends_at` and `cancelled` back onto the matching `google_event_id`. Everything else ignored. Simultaneous changes on both sides mark the appointment as a sync conflict for manual resolution instead of merging.
- Works offline: a failed push never blocks creating or changing an appointment

**Done when:** appointments appear pseudonymously in Google Calendar, private blockers are visible while scheduling, and pulling the network cable breaks nothing.

## Slice 10 — Sending invoices by email

Purely additive; nothing earlier depends on it.

- SMTP configuration in the practice settings
- `sent_at`, `sent_to` on the invoice, plus a small send log
- Send the finalized PDF as an attachment to the contact's email address, with a configurable subject and body template
- Sending is never automatic and never part of finalization

**Done when:** I can send a finalized invoice from the app and see when it went where.
