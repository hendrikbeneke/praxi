/**
 * Drizzle schema.
 *
 * Every domain table carries `tenant_id uuid not null` (CLAUDE.md rule 1),
 * `id uuid primary key` filled with a UUIDv7 from the application (see
 * `src/id.ts`), and `created_at` / `updated_at` as `timestamptz`.
 *
 * `updated_at` is maintained by the `set_updated_at()` trigger, which every
 * table gets — see CLAUDE.md under Conventions. It is deliberately not set
 * from the application: a value that silently stays behind on a `psql` update
 * is worse than no value at all. A `BEFORE UPDATE` trigger rewrites the row
 * before it is stored, so `returning` still sees the new value.
 */

import type {
  ActivityType,
  AppointmentStatus,
  ContactKind,
  ContactRole,
  NoteType,
} from '@praxi/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** Columns every table repeats. Spread into the table definition. */
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}

/**
 * Identity only. Everything configurable about the practice lives in
 * `practice_settings`, so this table never grows columns.
 */
export const tenant = pgTable('tenant', {
  id: uuid().primaryKey(),
  name: text().notNull(),
  ...timestamps,
})

/**
 * Exactly one row per tenant. Address and bank details are optional because
 * the practitioner fills them in over time; the invoice PDF takes the practice
 * identity from the uploaded template, not from these columns
 * (CLAUDE.md rule 11).
 */
export const practiceSettings = pgTable(
  'practice_settings',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .unique()
      .references(() => tenant.id),
    practiceName: text().notNull(),
    street: text(),
    postalCode: text(),
    city: text(),
    country: text().notNull().default('DE'),
    phone: text(),
    email: text(),
    website: text(),
    taxNumber: text(),
    bankName: text(),
    iban: text(),
    bic: text(),
    defaultPaymentTermDays: integer().notNull().default(14),
    ...timestamps,
  },
  (t) => [
    check(
      'practice_settings_payment_term_range',
      sql`${t.defaultPaymentTermDays} between 0 and 365`,
    ),
  ],
)

/**
 * Deliberately not called `user` — that is reserved in Postgres and would
 * force quoting everywhere.
 *
 * `email` is unique across all tenants, not per tenant: the login form has no
 * tenant context, so the user is found by email alone. The check constraint
 * keeps the column lower-cased, which makes that lookup a plain equality
 * against the unique index.
 */
export const appUser = pgTable(
  'app_user',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    email: text().notNull(),
    passwordHash: text().notNull(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('app_user_email_key').on(t.email),
    index('app_user_tenant_idx').on(t.tenantId),
    check('app_user_email_lowercase', sql`${t.email} = lower(${t.email})`),
    // Referenced by the composite foreign key on `session`; see below.
    unique('app_user_id_tenant_key').on(t.id, t.tenantId),
  ],
)

/**
 * `tenant_id` is denormalized onto the session so the auth middleware resolves
 * user and tenant in a single select. The composite foreign key against
 * `app_user (id, tenant_id)` makes the denormalization impossible to get
 * wrong — a session can only ever carry the tenant of its own user.
 *
 * The cookie holds a random token; only its SHA-256 is stored, so a dump of
 * this table does not hand out live sessions.
 */
export const session = pgTable(
  'session',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    userId: uuid().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.userId, t.tenantId],
      foreignColumns: [appUser.id, appUser.tenantId],
      name: 'session_user_tenant_fk',
    }).onDelete('cascade'),
    uniqueIndex('session_token_hash_key').on(t.tokenHash),
    index('session_user_idx').on(t.userId),
    index('session_expires_idx').on(t.expiresAt),
  ],
)

/**
 * The reusable counter behind `contact_number` and, from slice 6, invoice
 * numbers. `next_value` is edited by hand for invoices (CLAUDE.md rule 8);
 * `prefix` and `padding` arrive in that slice, together with the UI that fills
 * them.
 */
export const numberRange = pgTable(
  'number_range',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    code: text().notNull(),
    nextValue: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('number_range_tenant_code_key').on(t.tenantId, t.code),
    check('number_range_next_value_positive', sql`${t.nextValue} >= 1`),
  ],
)

export const contactKind = pgEnum('contact_kind', ['person', 'organization'])

/**
 * The generic party — person or organization. A patient is a contact holding
 * the `patient` role, never its own table (CLAUDE.md rule 4).
 */
export const contact = pgTable(
  'contact',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactNumber: integer().notNull(),
    kind: contactKind().notNull().$type<ContactKind>(),

    // person
    salutation: text(),
    title: text(),
    firstName: text(),
    lastName: text(),
    dateOfBirth: date({ mode: 'string' }),

    // organization
    companyName: text(),
    contactPerson: text(),

    // both — a sole trader is a person and can still have a VAT id
    vatId: text(),
    street: text(),
    postalCode: text(),
    city: text(),
    country: text().notNull().default('DE'),
    email: text(),
    phone: text(),
    internalNote: text(),
    archivedAt: timestamp({ withTimezone: true }),

    /**
     * Surname first for people, company name for organizations, so one index
     * orders the list the way a card index does. Sorting uses the database
     * collation, which migration 0002 asserts is ICU `de-DE`.
     *
     * Raw column names inside the expression on purpose — referencing the
     * column objects here would be a circular reference during table
     * definition.
     */
    sortName: text().generatedAlwaysAs(
      sql`coalesce("company_name", btrim(coalesce("last_name", '') || ' ' || coalesce("first_name", '')))`,
    ),
    ...timestamps,
  },
  (t) => [
    unique('contact_tenant_number_key').on(t.tenantId, t.contactNumber),
    // Referenced by the composite foreign key on `contact_role`.
    unique('contact_id_tenant_key').on(t.id, t.tenantId),
    index('contact_tenant_sort_idx').on(t.tenantId, t.sortName),
    check('contact_number_positive', sql`${t.contactNumber} >= 1`),
    /**
     * `kind` decides which fields apply, and the database says so. Without
     * this a half-filled record reaches slice 6 and ends up in an invoice's
     * `recipient_snapshot`, where it can no longer be corrected.
     */
    check(
      'contact_kind_fields',
      sql`(
        ${t.kind} = 'person'
          and ${t.lastName} is not null
          and ${t.companyName} is null and ${t.contactPerson} is null
      ) or (
        ${t.kind} = 'organization'
          and ${t.companyName} is not null
          and ${t.salutation} is null and ${t.title} is null
          and ${t.firstName} is null and ${t.lastName} is null
          and ${t.dateOfBirth} is null
      )`,
    ),
  ],
)

/**
 * Roles live here rather than in a column on `contact`, because a contact
 * holds several at once and they come and go over time (CLAUDE.md rule 4).
 *
 * `role` is `text` with a named check constraint, not an enum: this set is
 * expected to change, and a check constraint is replaced with DROP/ADD in one
 * migration. The allowed values are defined once, in `packages/shared`.
 */
export const contactRole = pgTable(
  'contact_role',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    role: text().notNull().$type<ContactRole>(),
    since: date({ mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'contact_role_contact_tenant_fk',
    }).onDelete('cascade'),
    // Also serves lookups by contact — contact_id is the leading column.
    unique('contact_role_contact_role_key').on(t.contactId, t.role),
    index('contact_role_tenant_role_idx').on(t.tenantId, t.role),
    check(
      'contact_role_role_check',
      sql`${t.role} in ('patient', 'prospect', 'participant', 'guardian', 'billing_recipient', 'other')`,
    ),
  ],
)

/**
 * The catalogue. Every `service` is a template: creating an `activity_item`
 * copies description, fee code, price and duration out of it, and `service_id`
 * survives only as a record of origin (CLAUDE.md rule 5).
 *
 * Hence no price history and no validity dates — editing the catalogue is
 * meant to leave everything that already exists untouched, past and future
 * alike.
 */
export const service = pgTable(
  'service',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    shortCode: text(),
    description: text().notNull(),
    feeCode: text(),
    defaultPriceCents: integer().notNull(),
    defaultDurationMin: integer(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // Referenced by the composite foreign key on `service_group_item`.
    unique('service_id_tenant_key').on(t.id, t.tenantId),
    /**
     * Unique only where given: not every service needs a handle, but two
     * sharing one would make quick entry ambiguous.
     */
    uniqueIndex('service_tenant_short_code_key')
      .on(t.tenantId, t.shortCode)
      .where(sql`${t.shortCode} is not null`),
    /**
     * No negative prices in the catalogue. A discount is not a service — rule
     * 5 handles it by editing the price on the `activity_item`, which stays
     * free until the item is billed.
     */
    check('service_price_not_negative', sql`${t.defaultPriceCents} >= 0`),
    check(
      'service_duration_positive',
      sql`${t.defaultDurationMin} is null or ${t.defaultDurationMin} > 0`,
    ),
  ],
)

/**
 * A selection helper, nothing more. Picking a group resolves it into
 * individual items at entry time; no table outside this one ever stores a
 * group id (CLAUDE.md rule 5), so renaming or emptying a group cannot reach
 * back into an activity that was entered from it.
 */
export const serviceGroup = pgTable(
  'service_group',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('service_group_tenant_name_key').on(t.tenantId, t.name),
    unique('service_group_id_tenant_key').on(t.id, t.tenantId),
  ],
)

export const serviceGroupItem = pgTable(
  'service_group_item',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    serviceGroupId: uuid().notNull(),
    serviceId: uuid().notNull(),
    /** A session is the unit; the length of one lives in `duration_min`. */
    quantity: integer().notNull().default(1),
    /**
     * Sort order only, not an identity — deliberately without a unique
     * constraint, so reordering can rewrite the rows one by one instead of
     * needing a deferred constraint or a shuffle through spare values. Saving
     * renumbers them from 0 without gaps.
     */
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.serviceGroupId, t.tenantId],
      foreignColumns: [serviceGroup.id, serviceGroup.tenantId],
      name: 'service_group_item_group_tenant_fk',
    }).onDelete('cascade'),
    // No cascade: services are never deleted, only deactivated. This foreign
    // key is what makes that stick.
    foreignKey({
      columns: [t.serviceId, t.tenantId],
      foreignColumns: [service.id, service.tenantId],
      name: 'service_group_item_service_tenant_fk',
    }),
    unique('service_group_item_group_service_key').on(t.serviceGroupId, t.serviceId),
    index('service_group_item_group_idx').on(t.serviceGroupId, t.position),
    check('service_group_item_quantity_positive', sql`${t.quantity} > 0`),
  ],
)

/**
 * The calendar entry. Separate from the activity and optional: the foreign key
 * sits on `activity`, because the appointment knows nothing about business
 * logic (CLAUDE.md rule 6).
 *
 * `contact_id` is `not null`, unlike the original sketch. Every appointment
 * here belongs to an activity for a contact, and the private blockers of
 * slice 9 arrive from Google as read-only intervals that are never stored — a
 * nullable column nothing can fill would just be a dead one.
 */
export const appointment = pgTable(
  'appointment',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** Descriptive only — it does not gate billing (rule 6). It does decide
     *  whether the slot stays occupied; see the exclusion constraint in
     *  migration 0009. */
    status: text().notNull().default('planned').$type<AppointmentStatus>(),
    title: text(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'appointment_contact_tenant_fk',
    }),
    /**
     * Target of the composite foreign key on `activity`. Carrying `contact_id`
     * through makes it impossible for an activity of one contact to hold the
     * appointment of another.
     */
    unique('appointment_id_contact_tenant_key').on(t.id, t.contactId, t.tenantId),
    index('appointment_tenant_starts_idx').on(t.tenantId, t.startsAt),
    check(
      'appointment_status_check',
      sql`${t.status} in ('planned', 'confirmed', 'attended', 'cancelled', 'cancelled_late', 'no_show')`,
    ),
    check('appointment_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

/**
 * A dated event where services were rendered — the record of what happened,
 * and the primary place to correct it (CLAUDE.md rule 6).
 */
export const activity = pgTable(
  'activity',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    type: text().notNull().$type<ActivityType>(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    /** Descriptive only, and nothing is derived from it. Redundant while there
     *  is an appointment, but an activity documented afterwards has no
     *  calendar entry to take a length from. */
    durationMin: integer(),
    appointmentId: uuid(),
    title: text(),
    internalNote: text(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'activity_contact_tenant_fk',
    }),
    /**
     * Three columns, not two: `contact_id` travels along so the appointment
     * cannot belong to a different contact than the activity does.
     *
     * The real constraint in the database is
     * `ON DELETE SET NULL (appointment_id)` — see migration 0009. drizzle-kit
     * cannot express the column list, and a bare `SET NULL` on a three-column
     * key would null `tenant_id` too and fail. `onDelete('set null')` stays
     * here so intent and snapshot line up; 0009 replaces the constraint under
     * the same name.
     */
    foreignKey({
      columns: [t.appointmentId, t.contactId, t.tenantId],
      foreignColumns: [appointment.id, appointment.contactId, appointment.tenantId],
      name: 'activity_appointment_contact_tenant_fk',
    }).onDelete('set null'),
    // Nulls do not collide in Postgres, so any number of activities may have
    // no appointment at all.
    unique('activity_appointment_key').on(t.appointmentId),
    unique('activity_id_tenant_key').on(t.id, t.tenantId),
    // Target of note's three-column foreign key, so a note cannot hang on the
    // activity of a different contact.
    unique('activity_id_contact_tenant_key').on(t.id, t.contactId, t.tenantId),
    index('activity_tenant_occurred_idx').on(t.tenantId, t.occurredAt),
    index('activity_contact_idx').on(t.contactId, t.occurredAt),
    check('activity_type_check', sql`${t.type} in ('session', 'talk', 'consultation', 'other')`),
    check('activity_duration_positive', sql`${t.durationMin} is null or ${t.durationMin} > 0`),
  ],
)

/**
 * One rendered service within an activity. Description, fee code, price and
 * duration are **copied** from the catalogue at entry time; `service_id`
 * remains only as a record of origin and means nothing for price or text
 * afterwards (CLAUDE.md rule 5).
 *
 * These rows are stable: slice 6 points `invoice_line.activity_item_id` at
 * them, so editing an activity updates rows in place rather than replacing
 * them.
 */
export const activityItem = pgTable(
  'activity_item',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    activityId: uuid().notNull(),
    position: integer().notNull(),
    serviceId: uuid(),
    description: text().notNull(),
    feeCode: text(),
    quantity: integer().notNull().default(1),
    /**
     * No sign restriction here, unlike `service.default_price_cents`. Rule 5
     * handles discounts by leaving this price free, so a negative one-off line
     * is the intended way to grant one.
     */
    unitPriceCents: integer().notNull(),
    durationMin: integer(),
    /** False for a session that did not happen: the item stays, because it
     *  documents that one was planned, and an Ausfallhonorar is added next to
     *  it (rule 6). */
    billable: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.activityId, t.tenantId],
      foreignColumns: [activity.id, activity.tenantId],
      name: 'activity_item_activity_tenant_fk',
    }).onDelete('cascade'),
    // No cascade: services are never deleted, only deactivated.
    foreignKey({
      columns: [t.serviceId, t.tenantId],
      foreignColumns: [service.id, service.tenantId],
      name: 'activity_item_service_tenant_fk',
    }),
    // Target of invoice_line's composite foreign key in slice 6.
    unique('activity_item_id_tenant_key').on(t.id, t.tenantId),
    index('activity_item_activity_idx').on(t.activityId, t.position),
    check('activity_item_quantity_positive', sql`${t.quantity} > 0`),
    check('activity_item_duration_positive', sql`${t.durationMin} is null or ${t.durationMin} > 0`),
  ],
)

/**
 * Documentation. Freely editable until locked; after that neither the note nor
 * its files can be changed or deleted, enforced by the `protect_locked_note`
 * trigger in migration 0011 and not only in application code (CLAUDE.md
 * rule 7). There is no unlock path — not for admins, not via a flag, not via a
 * maintenance script.
 *
 * A locked note is corrected by supplementing it: a new note of type
 * `addendum` with `corrects_note_id` pointing at the locked one.
 *
 * *Why: § 630f BGB requires corrections to remain traceable with the original
 * content recognizable. Lock plus append-only addenda satisfies this without a
 * full change log.*
 */
export const note = pgTable(
  'note',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    activityId: uuid(),
    /** The day being documented — not necessarily the day of writing, which is
     *  `created_at`. Both go into the content hash. */
    noteDate: date({ mode: 'string' }).notNull(),
    type: text().notNull().$type<NoteType>(),
    /** Named `text` rather than `body` because CLAUDE.md rule 7 spells the
     *  canonical serialization with that key, and the two lining up is worth
     *  more than avoiding `text text`. */
    text: text().notNull(),
    createdBy: uuid().notNull(),
    lockedAt: timestamp({ withTimezone: true }),
    lockedBy: uuid(),
    /** SHA-256 over the canonical serialization — see `domain/note-hash.ts`.
     *  Null until locked. */
    contentHash: text(),
    /** The `content_hash` of the previously locked note of the same contact;
     *  null for the first link. */
    prevHash: text(),
    correctsNoteId: uuid(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'note_contact_tenant_fk',
    }),
    /**
     * Restrict, not set null: nulling `activity_id` is an UPDATE, and on a
     * locked note the trigger would reject it — deleting an activity would
     * fail with "locked note is immutable". `deleteActivity` checks for notes
     * beforehand and refuses with something readable instead.
     */
    foreignKey({
      columns: [t.activityId, t.contactId, t.tenantId],
      foreignColumns: [activity.id, activity.contactId, activity.tenantId],
      name: 'note_activity_contact_tenant_fk',
    }).onDelete('restrict'),
    // Three columns again: an addendum cannot correct another contact's note.
    foreignKey({
      columns: [t.correctsNoteId, t.contactId, t.tenantId],
      foreignColumns: [t.id, t.contactId, t.tenantId],
      name: 'note_corrects_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.createdBy, t.tenantId],
      foreignColumns: [appUser.id, appUser.tenantId],
      name: 'note_created_by_tenant_fk',
    }),
    foreignKey({
      columns: [t.lockedBy, t.tenantId],
      foreignColumns: [appUser.id, appUser.tenantId],
      name: 'note_locked_by_tenant_fk',
    }),
    unique('note_id_tenant_key').on(t.id, t.tenantId),
    unique('note_id_contact_tenant_key').on(t.id, t.contactId, t.tenantId),
    index('note_contact_date_idx').on(t.contactId, t.noteDate, t.createdAt),
    index('note_activity_idx').on(t.activityId),
    index('note_corrects_idx').on(t.correctsNoteId),
    /**
     * The chain stays linear. Two locks running at the same moment would both
     * read the same tail and both write its hash into `prev_hash`, forking the
     * chain into two branches that each verify fine on their own — the one
     * failure this mechanism must not have. The unique index turns that race
     * into an error instead. Nulls do not collide, hence the second index
     * below for the head.
     *
     * Do not drop these as "unused". Nothing reads them; they exist to make a
     * state unreachable.
     */
    uniqueIndex('note_chain_link_key')
      .on(t.contactId, t.prevHash)
      .where(sql`${t.prevHash} is not null`),
    /** …and a contact has exactly one first link, for the same reason. */
    uniqueIndex('note_chain_head_key')
      .on(t.contactId)
      .where(sql`${t.lockedAt} is not null and ${t.prevHash} is null`),
    check(
      'note_type_check',
      sql`${t.type} in ('general', 'session', 'document', 'correspondence', 'addendum', 'other')`,
    ),
    // Locked means all three set, unlocked means none of them.
    check(
      'note_lock_fields',
      sql`(${t.lockedAt} is null and ${t.lockedBy} is null and ${t.contentHash} is null)
          or (${t.lockedAt} is not null and ${t.lockedBy} is not null and ${t.contentHash} is not null)`,
    ),
    check('note_prev_hash_requires_lock', sql`${t.prevHash} is null or ${t.lockedAt} is not null`),
    check(
      'note_hash_shape',
      sql`(${t.contentHash} is null or ${t.contentHash} ~ '^[0-9a-f]{64}$')
          and (${t.prevHash} is null or ${t.prevHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'note_addendum_target',
      sql`(${t.type} = 'addendum') = (${t.correctsNoteId} is not null)`,
    ),
    check(
      'note_addendum_not_self',
      sql`${t.correctsNoteId} is null or ${t.correctsNoteId} <> ${t.id}`,
    ),
  ],
)

/**
 * An attachment. Cascading on delete is safe precisely because a locked note
 * cannot be deleted: the cascade only ever reaches notes that are still open.
 *
 * `storage_path` is relative to the data root, never absolute — otherwise
 * moving the practice to a server would be a data migration. The bytes live
 * outside the web root and are served only through an authenticated route
 * (CLAUDE.md rule 12).
 */
export const noteFile = pgTable(
  'note_file',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    noteId: uuid().notNull(),
    /** As uploaded, for display only. Never a path segment: a file name is
     *  clinical content and has no business in a directory listing. */
    fileName: text().notNull(),
    /** What the bytes actually are, not what the upload claimed. */
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    storagePath: text().notNull(),
    sha256: text().notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.noteId, t.tenantId],
      foreignColumns: [note.id, note.tenantId],
      name: 'note_file_note_tenant_fk',
    }).onDelete('cascade'),
    unique('note_file_storage_path_key').on(t.tenantId, t.storagePath),
    index('note_file_note_idx').on(t.noteId),
    check('note_file_size_positive', sql`${t.sizeBytes} > 0`),
    check('note_file_sha256_shape', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'note_file_path_relative',
      sql`${t.storagePath} !~ '^/' and ${t.storagePath} !~ '\\.\\.'`,
    ),
  ],
)
