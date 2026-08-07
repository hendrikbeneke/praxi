# CLAUDE.md — Practice Management Software (German HPP practice)

This file is the permanent context for this repository. Read it fully at the start of every session. It describes the whole system, including parts that do not exist yet.

## What this is

Practice management software for a German *Heilpraktiker für Psychotherapie* (HPP) practice — a non-physician psychotherapy practitioner licensed under the *Heilpraktikergesetz*. One practitioner, one tenant. It replaces an existing off-the-shelf product that is being retired.

Runs locally on a Mac, accessed in the browser at `http://localhost:3000`. It must be deployable to a server later without architectural rework, so all business logic sits behind an HTTP API and nothing depends on running on localhost.

The practice does not only treat patients. It also sells courses, exam preparation and talks, to individuals and to companies. The data model is therefore built around a generic contact, not around a patient.

## Language rules

- **Talk to me in German.** All chat responses, plans, questions, explanations and summaries are in German. The language of this file does not change that.
- **All code, identifiers, comments, commit messages, documentation and this file: English.** Domain terms use their English equivalent from the glossary below, never the German word. No `rechnungsposition`, no `festschreiben` in code.
- **All user-facing UI strings: German.** Labels, buttons, validation messages, errors shown to the user, PDF content.
- Keep German strings in `apps/web/src/lib/strings.ts` and `apps/server/src/messages.ts` rather than inlining them in components. This is not i18n — it keeps the language split enforceable.
- Database identifiers (tables, columns, enum values) are English.

## Glossary — German domain term → English identifier

| German | English | Notes |
|---|---|---|
| Mandant | `tenant` | identity only, configuration lives in `practice_settings` |
| Praxis / Stammdaten | `practice_settings` | one row per tenant |
| Behandler | `practitioner` | an `app_user` acting as practitioner |
| Kontakt | `contact` | the generic party — person or organization |
| Kontaktnummer | `contact_number` | sequential, every contact gets one |
| Rolle | `contact_role` | patient, prospect, participant, guardian, billing recipient |
| Patient | a `contact` with role `patient` | never its own table |
| Vorgang | `activity` | a dated event where services were rendered |
| Vorgangsposition | `activity_item` | one rendered service within an activity |
| Sitzung | an `activity` of type session | |
| Termin / Kalendereintrag | `appointment` | separate from the activity, optional |
| Notiz / Dokumentation | `note` | attached to a contact, optionally to an activity |
| Anhang / Datei | `note_file` | files are always attached through a note |
| sperren / gesperrt | `lock` / `locked` | never "sign" — locking is not a signature |
| Nachtrag | `addendum` | a note correcting a locked note |
| Leistung | `service` | catalogue entry, acts as a template |
| Leistungsgruppe | `service_group` | selection helper only, never referenced by data |
| Ziffer (GebüH) | `fee_code` | optional, free text |
| Rechnung | `invoice` | |
| Rechnungsposition | `invoice_line` | |
| Entwurf | `draft` | invoice status |
| festschreiben | `finalize` | |
| Stornorechnung | `cancellation_invoice` | German document title stays "Stornorechnung" |
| Gutschrift | credit note | **never used as a document type — see rule 9** |
| Zahlung | `payment` | |
| Zahlweg | `payment_method` | |
| Bezahlübersicht | `receivables` | |
| Nummernkreis | `number_range` | holds the next number, edited manually |
| Zahlungsziel | `payment_term_days` | |
| Einleitungs-/Schlusstext | `text_template` | intro and outro blocks on the invoice |
| Ausfallhonorar | a `service` like any other | no special mechanism |
| Umsatzsteuer | VAT | |
| Aufbewahrungsfrist | retention period | |
| Schweigepflicht | professional confidentiality | § 203 StGB |

## Stack — fixed, do not deviate

- Node 22 LTS, TypeScript `strict`, ESM
- pnpm workspace (monorepo)
- Backend: **Hono** (Node adapter), one process serving both the API and the built frontend
- DB: **PostgreSQL 17**, local via Docker Compose (Postgres only — never the app)
- DB access: **Drizzle ORM** + drizzle-kit
- Validation: **Zod**, schemas in `packages/shared`, imported by server and client
- Frontend: **Vite + React 19**, TanStack Router (file-based), TanStack Query
- UI: Tailwind + shadcn/ui, TanStack Table for lists
- Forms: react-hook-form with `@hookform/resolvers/zod`
- PDF: **@react-pdf/renderer** for content, **pdf-lib** to overlay it onto the uploaded template (no Puppeteer, no Chromium)
- Passwords: `@node-rs/argon2`
- Logging: pino
- Tests: Vitest

**Never introduce:** Next.js, Redis, BullMQ, Prisma, Auth.js/NextAuth, tRPC, Docker for the application itself, any cloud service or SaaS dependency.

Client-server typing via Hono's `hc<AppType>` client. No separate codegen step.

## Out of scope

Do not implement, and do not add schema for, anything beyond what is specified here:

- Bookkeeping, dunning, VAT filing, DATEV export — handled in separate accounting software
- Cash register, TSE, SumUp integration — the card terminal is operated manually
- Bank statement or CSV import of payments — payments are entered by hand
- Sending invoices by email — planned for later, purely additive when it comes
- Online booking — planned as a third-party integration much later
- Data import from the previous system — migration is manual
- Backup mechanics — handled outside the application
- Multi-user role management — the tables exist, there is exactly one user

## Architecture

```
praxis/
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ db/            schema.ts, client.ts, migrations/
│  │  │  ├─ routes/        one file per resource
│  │  │  ├─ domain/        business logic, transactions
│  │  │  ├─ pdf/           invoice.tsx, overlay.ts, din5008.ts
│  │  │  ├─ google/        (last slice)
│  │  │  ├─ middleware/    auth.ts, tenant.ts, error.ts
│  │  │  ├─ messages.ts    German user-facing strings
│  │  │  ├─ app.ts         Hono app, exports `AppType`
│  │  │  └─ index.ts       serve() + static SPA
│  │  └─ data/             invoices/, templates/, files/  (gitignored)
│  └─ web/
│     └─ src/              routes/, components/, lib/api.ts, lib/strings.ts
├─ packages/shared/        Zod schemas + derived types
├─ docker-compose.yml      Postgres 17 only
├─ .env.example
├─ CLAUDE.md
└─ WORKPLAN.md             slice order and current progress
```

The split between `routes/` (HTTP, auth, validation, error translation) and `domain/` (business rules, transactions) is mandatory. A route handler contains no business rule. Business rules are unit-tested; route handlers usually are not.

## Core domain rules

These rules are the actual value of this software. They live in `domain/` and are covered by tests.

### 1. Tenant scoping

Every domain table has `tenant_id uuid not null` referencing `tenant`. There is exactly one tenant for now, but every query filters on it. Row-level-security policies are created and left disabled (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) with a comment in the migration.

The tenant id comes from the session via `middleware/tenant.ts` and is never accepted from a request body or query string.

### 2. Money

Always `integer` cents. Never floats, never `numeric` in application logic. Formatting only in the presentation layer via `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`.

### 3. Time

All timestamps `timestamptz`, stored in UTC. Display and input in `Europe/Berlin`. Pure dates (date of birth, invoice date, date of service, payment date) as `date`, not timestamps.

### 4. Contacts, kinds and roles

`contact.kind` is `person` or `organization`. It is structural, decides which fields apply, and never changes.

Roles are separate and multiple: a contact can be a prospect who becomes a patient, a parent who is both guardian and billing recipient, a company that is a customer. Roles live in `contact_role`, never in a single type column on `contact`.

Every contact gets a sequential `contact_number` on creation, regardless of role. There is no separate patient number.

Confidentiality follows the role, not the table: professional secrecy under § 203 StGB and the pseudonymization towards Google apply to contacts holding the `patient` role. A company booking a talk is not a confidential relationship.

### 5. Services are templates, never live references

`service` is a catalogue. `service_group` is a selection helper — when you pick a group, it is resolved into individual items immediately, at entry time. **No table ever stores a reference to a group.**

When an `activity_item` is created, description, fee code, price and duration are **copied** from the service. `service_id` remains only as a record of origin and carries no meaning for price or text afterwards.

Consequences, all of them intended:

- Editing the catalogue never changes anything that already exists — not past activities, and not future planned ones. An appointment booked today for next month keeps today's price even if the catalogue changes tomorrow. There is no automatic re-pricing and no "refresh price from catalogue" action.
- `service` therefore needs no price history, no `valid_from`/`valid_to`.
- An `activity_item` can exist without any `service_id` at all — a one-off talk, entered freely with its own description and price. The catalogue is a convenience, never a requirement.
- Prices on an `activity_item` are freely editable while it is not billed. Discounts and special rates need no separate mechanism.

### 6. Activity, appointment and billability

`activity` is a dated event where services were rendered to a contact — a session, a talk, a consultation. It is the record of what happened.

`appointment` is the calendar entry. It is separate and optional: `activity.appointment_id` is nullable and unique. In practice both are created together, but an activity can be documented afterwards without ever producing a calendar entry. The foreign key sits on the activity — the appointment knows nothing about business logic, because it is ultimately just a projection towards a calendar.

The appointment status (confirmed, attended, cancelled, no-show) is **descriptive only**. It does not gate billing. Anything in the past can be billed.

Billability is a property of the item, not of a status:

- `activity_item.billable` defaults to true. On a no-show you set it to false and add an "Ausfallhonorar" item instead. The unbilled item stays on the activity, because it documents that a session was planned and did not happen.
- **An item is billable when `billable = true` and no `invoice_line` on a *non-cancelled* invoice references it.** The cancelled-invoice exclusion is essential: cancelling an invoice must return its items to the billable pool, and the lines of the cancelled invoice remain in place because finalized invoices are immutable. Getting this query wrong silently loses revenue.
- An `activity_item` referenced by a finalized, non-cancelled invoice can no longer be modified. Enforce this with a trigger, like locked notes.

The activity is the source of truth and the primary place to make corrections. Invoice lines stay editable while the invoice is a draft, but that is the exception path, not the normal workflow.

### 7. Notes: locking, hash chain, addenda, files

A note belongs to a contact, and optionally to an activity. Files are always attached through a note (`note_file`), never directly to a contact or activity — this gives attachments the same locking semantics as text without a second mechanism.

A note is freely editable until locked. On lock:

- set `locked_at`, `locked_by`
- `content_hash` = SHA-256 over a canonical JSON serialization of `{ noteDate, type, text, fileHashes, createdAt, createdBy }`, keys sorted alphabetically, no whitespace
- `prev_hash` = `content_hash` of the most recently locked note of the same contact, `null` for the first

This forms a hash chain per contact. `verifyChain(contactId)` walks it and reports deviations; there is a UI view for it.

After locking, neither the note nor its files can be changed or deleted. Enforced by trigger, not only in application code:

```sql
CREATE FUNCTION protect_locked_note() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked note is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

as `BEFORE UPDATE OR DELETE`, plus an equivalent guard on `note_file` checking its parent note.

A locked note cannot be corrected, only supplemented: a new note of type `addendum` with `corrects_note_id` pointing at the locked one. Addenda render indented beneath the note they correct, labelled as an addendum with their own date. There is no unlock path — not for admins, not via a flag, not via a maintenance script.

*Why: § 630f BGB requires corrections to remain traceable with the original content recognizable. Lock plus append-only addenda satisfies this without a full change log. Locking is legally meaningful only for treatment documentation, but the mechanism is available on every note.*

### 8. Invoice numbering

`number_range` holds a **`next_value` that is edited by hand**. There is no automatic yearly reset — before the first invoice of a new year the practitioner edits the range. Whoever edits it is responsible for entering something sensible; on assignment the system checks that the resulting number does not already exist and refuses with a clear message if it does.

- Assignment happens only on finalization, in the same transaction, via `SELECT ... FOR UPDATE` on the `number_range` row. Never a Postgres sequence — sequences leave gaps on rollback.
- Invoices and cancellation invoices share one range.
- `number` is null while `status = 'draft'`. `unique (tenant_id, number)`.
- Discarded drafts may be deleted; they never held a number, so no gaps arise.

### 9. Finalizing, cancelling, paying

Finalization is one transaction that assigns the number, copies each line's description, fee code and unit price into `invoice_line`, resolves the selected intro and outro text templates into `invoice.intro_text` and `invoice.outro_text`, stores `recipient_snapshot`, computes the total, renders the PDF to `data/invoices/{year}/{number}.pdf`, stores its SHA-256, and sets `status = 'finalized'`.

Everything is snapshotted because everything else is editable afterwards: services, texts, contact addresses. A finalized invoice must render identically for the whole retention period, so the PDF is served from disk and never re-rendered on request.

After finalization the invoice row is immutable except for `status` and `cancelled_by_invoice_id`, enforced by trigger. Payments live in their own table and never touch the invoice row.

**Cancellation** produces a new document: `type = 'cancellation_invoice'`, negative amounts, its own number from the same range, `cancels_invoice_id` on the new one and `cancelled_by_invoice_id` on the original. There is no partial cancellation — cancel the whole invoice and write a new one. No replacement draft is created automatically; the freed items simply become billable again.

In the PDF and the UI the document is titled **"Stornorechnung"** or **"Rechnungskorrektur"**, never **"Gutschrift"**. In German VAT law that term means self-billing by the recipient (§ 14 Abs. 2 UStG); misusing it can trigger a tax liability under § 14c UStG.

**Payments** are entered by hand from the invoice. The amount is editable, so partial payments fall out of the model for free; the invoice status (open, partially paid, paid, overdue) is always derived from the sum of payments and never stored.

There is a "Betrag erhalten" action on finalization for the common case of payment by card right after the session: one transaction that finalizes, records a payment over the full amount dated to the invoice date with method `card`, and selects the outro template marked as the paid variant. All of it correctable afterwards.

### 10. VAT and invoice content

The practice bills private payers only. There is no VAT breakdown and no tax line. Any VAT note — for treatments typically the exemption under § 4 Nr. 14 lit. a UStG — is written by the practitioner into the outro text template. The software does not compute, insert or validate tax statements.

### 11. Invoice layout

The practitioner uploads a PDF template carrying the letterhead, logo, practice name, tax number and the return address line. The software renders only the variable content and overlays it onto that template with pdf-lib.

- Template with one page: that page backs every page of the document.
- Template with two pages: page 1 backs the first page, page 2 backs all following pages.

Layout follows **DIN 5008 Form B**. Put the millimetre constants (address field position and size, fold marks, hole mark, information block) in `pdf/din5008.ts` — never scattered as magic numbers.

Content order: recipient and date block, intro text, line items, total, outro text. Practice identity comes from the template, not from the code.

### 12. Logging and data protection

Health data falls under Art. 9 GDPR and professional confidentiality under § 203 StGB. Consequences for the code:

- Never log contact names, note text, file names or any clinical content — not in logs, error messages or stack traces. Logs carry IDs only.
- Uploaded files live outside the web root and are served only through an authenticated route, never by static file serving.
- No telemetry, no external fonts, no CDN references in the frontend. Bundle every asset locally.
- No outbound network requests at all, except to the Google Calendar API in the final slice.

## Target data model

**This is a sketch, not a contract.** It exists so you keep the whole system in view and do not design an early slice in a way that breaks a later one. It is not the final schema.

Tables are created slice by slice. The slice that creates a table is where its columns are decided — for real, with me, at that moment. Column names, optional fields and enum values are open to change then. Expect that some will change.

What *is* binding, because the domain rules above depend on it: `tenant_id` everywhere; integer cents; `timestamptz` in UTC; roles as their own table; `activity_item` carrying its own description and price; `activity.appointment_id` nullable and unique; `activity_item.billable`; `invoice.number` nullable for drafts; text and recipient snapshots on the invoice; `note` carrying `locked_at`, `content_hash`, `prev_hash`, `corrects_note_id`; immutability of finalized invoices and locked notes at database level.

Enum values marked `?` below are deliberately undecided and get settled in their slice.

All tables carry `id uuid primary key` (UUIDv7, generated in the application), `tenant_id`, `created_at`, `updated_at`.

```
tenant                name

practice_settings     tenant_id (unique), practice_name, street, postal_code, city,
                      country, phone, email, website, tax_number,
                      bank_name, iban, bic,
                      default_payment_term_days,
                      invoice_template_path, letter_template_path

app_user              tenant_id, email, password_hash, name, active
session               user_id, token_hash, expires_at

contact               tenant_id, contact_number (unique per tenant, sequential),
                      kind (person|organization),
                      -- person
                      salutation, title, first_name, last_name, date_of_birth,
                      -- organization
                      company_name, vat_id, contact_person,
                      -- both
                      street, postal_code, city, country, email, phone,
                      internal_note, archived_at

contact_role          contact_id, role (?patient|prospect|participant|
                                         guardian|billing_recipient|other),
                      since
                      unique (contact_id, role)

service               tenant_id, short_code, description, fee_code,
                      default_price_cents, default_duration_min, active

service_group         tenant_id, name, active
service_group_item    service_group_id, service_id, quantity, position

activity              tenant_id, contact_id, type (?session|talk|consultation|other),
                      occurred_at, duration_min,
                      appointment_id (nullable, unique),
                      title, internal_note

activity_item         tenant_id, activity_id, position,
                      service_id (nullable),
                      description, fee_code,
                      quantity, unit_price_cents, duration_min,
                      billable (default true)

appointment           tenant_id, contact_id (nullable),
                      starts_at, ends_at,
                      status (?planned|confirmed|attended|cancelled|
                              cancelled_late|no_show),
                      title, note,
                      google_event_id, google_etag, last_pushed_at

note                  tenant_id, contact_id, activity_id (nullable),
                      note_date, type (?general|session|file|correspondence|
                                       addendum|other),
                      text, created_by,
                      locked_at, locked_by,
                      content_hash, prev_hash, corrects_note_id

note_file             tenant_id, note_id, file_name, mime_type, size_bytes,
                      storage_path, sha256

text_template         tenant_id, kind (intro|outro), name, body,
                      is_default, is_paid_variant

number_range          tenant_id, code, prefix, next_value, padding
                      unique (tenant_id, code)

invoice               tenant_id, contact_id,
                      type (invoice|cancellation_invoice),
                      number (nullable), status (draft|finalized|cancelled),
                      invoice_date, payment_term_days,
                      recipient_snapshot (jsonb),
                      intro_text, outro_text,
                      total_cents,
                      pdf_path, pdf_hash, finalized_at,
                      cancels_invoice_id, cancelled_by_invoice_id

invoice_line          tenant_id, invoice_id, position,
                      activity_item_id (nullable),
                      description, fee_code, date_of_service,
                      quantity, unit_price_cents, amount_cents

payment               tenant_id, invoice_id, paid_on, amount_cents,
                      method (bank_transfer|card|other), note

google_sync_queue     tenant_id, appointment_id, operation (create|update|delete),
                      attempts, last_error, next_attempt_at
```

`app_user` is deliberately not called `user` — `user` is reserved in Postgres and would force quoting everywhere.

## How we work

Development proceeds in **vertical slices**. One slice covers one or a few closely related entities end to end: Zod schema → migration → domain functions → API routes → UI → tests. A slice is finished and committed before the next begins. `WORKPLAN.md` holds the slice order and marks progress.

For every slice:

1. Propose a short plan first and wait for my confirmation. Name explicitly which tables, routes, files and UI screens you will touch.
2. **If the slice creates or alters a table, show me the concrete DDL first** — every column with its type, nullability, defaults, enum values, indexes and constraints — and wait for my approval before writing the migration. Do not treat the sketch above as settled. Where you think it is wrong, incomplete or badly named, say so at this point; that is what this step is for.
3. Implement it. Migrations are additive — never edit an existing migration file, always add a new one.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm lint` yourself and fix what fails. Do not hand me failing output.
5. Replace that table's block in the data model above with the schema as actually built and mark it `-- as built`. The sketch converges into documentation as we go.
6. Give me a short German summary of what changed and what I should click through to verify.
7. Wait. Do not start the next slice unprompted.

If a slice reveals that a table built earlier was wrong, say so instead of working around it. Renaming a column in slice 3 costs a migration; living with a bad name until slice 9 costs far more.

## Conventions

- No `any`, no `@ts-ignore`. Fix the root cause.
- One Zod schema per entity in `packages/shared`, types derived from it. No hand-maintained parallel interfaces.
- Migrations are immutable. A schema change means a new migration.
- Every new entity follows the structure of the entity built before it. Consistency beats local cleverness — if you want to deviate from an established pattern, say so and explain why before doing it.
- Tests are mandatory for everything in `domain/`. UI and simple CRUD routes need none.
- No realistic person names in seeds or fixtures. Use obviously fake test names.
- Conventional Commits, in English, one commit per slice.
