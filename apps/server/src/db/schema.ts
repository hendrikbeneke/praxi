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
  InvoiceStatus,
  InvoiceType,
  NoteType,
  RecipientSnapshot,
  TextTemplateKind,
} from '@praxi/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
    /** The letterhead the invoice content is overlaid onto (rule 11).
     *  Relative to DATA_DIR, null until one is uploaded. A letter template
     *  waits for a letter module — nothing on spec. */
    invoiceTemplatePath: text(),
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
    /** Prepended to the padded value. Also the yearly reset (rule 8): before
     *  the first invoice of a new year the practitioner sets the prefix to the
     *  new year and `next_value` back to 1. */
    prefix: text().notNull().default(''),
    padding: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique('number_range_tenant_code_key').on(t.tenantId, t.code),
    check('number_range_next_value_positive', sql`${t.nextValue} >= 1`),
    check('number_range_padding_range', sql`${t.padding} between 1 and 12`),
    // The number becomes a file name under data/invoices/{year}/.
    check('number_range_prefix_shape', sql`${t.prefix} ~ '^[A-Za-z0-9._-]*$'`),
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
    // Referenced by the composite foreign keys on `contact_role`,
    // `contact_relation`, `activity`, `note` and `invoice`.
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
 * The catalogue of roles. Configurable, because the practice does not only
 * treat patients and the set of roles it needs is not known up front
 * (CLAUDE.md rule 4).
 *
 * `is_system` marks the entries logic may depend on — currently `patient`
 * alone, which is what professional secrecy and the pseudonymization towards
 * Google key off. Such an entry cannot be deleted and its `code` cannot
 * change; the trigger `protect_system_type` in migration 0017 enforces that,
 * and `domain/contact-type.ts` refuses before it. The label stays editable.
 */
export const contactRoleType = pgTable(
  'contact_role_type',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    code: text().notNull(),
    label: text().notNull(),
    isSystem: boolean().notNull().default(false),
    /** The contact list gives this role a tab of its own; the rest stay
     *  reachable through the dropdown beside it. */
    showAsTab: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // Also the target of the composite foreign key on `contact_role`, so a
    // role type of another tenant cannot be referenced.
    unique('contact_role_type_tenant_code_key').on(t.tenantId, t.code),
    index('contact_role_type_tenant_sort_idx').on(t.tenantId, t.sortOrder, t.label),
    check('contact_role_type_code_shape', sql`${t.code} ~ '^[a-z][a-z0-9_]{0,39}$'`),
  ],
)

/**
 * The catalogue of relations between two contacts (CLAUDE.md rule 4).
 *
 * ## Direction
 *
 * `from` is the contact in whose record the fact is a property *of that
 * contact*, `to` is the counterpart. A patient is the `from` of
 * `billing_recipient`; a child is the `from` of `guardian`.
 *
 * That convention exists because `is_exclusive` is enforced per
 * `from_contact_id`: with it, exclusivity always reads as "this contact has at
 * most one X". Without it the direction would decide what the flag means, and
 * the next exclusive type would have to be thought through from scratch.
 *
 * `parent_of` is the deliberate exception — with kinship neither side owns the
 * fact, and "Elternteil von / Kind von" is the more common reading direction.
 *
 * `label_forward` is what the `from` contact's record says about the `to`
 * contact, `label_inverse` the other way round. A symmetric type has no
 * inverse label and reads the same from both sides.
 */
export const contactRelationType = pgTable(
  'contact_relation_type',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    code: text().notNull(),
    labelForward: text().notNull(),
    labelInverse: text(),
    isSymmetric: boolean().notNull().default(false),
    isExclusive: boolean().notNull().default(false),
    isSystem: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('contact_relation_type_tenant_code_key').on(t.tenantId, t.code),
    index('contact_relation_type_tenant_sort_idx').on(t.tenantId, t.sortOrder, t.labelForward),
    check('contact_relation_type_code_shape', sql`${t.code} ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check(
      'contact_relation_type_inverse_label',
      sql`(${t.labelInverse} is not null) = (not ${t.isSymmetric})`,
    ),
  ],
)

/**
 * Roles live here rather than in a column on `contact`, because a contact
 * holds several at once and they come and go over time (CLAUDE.md rule 4).
 *
 * `role_code` points at `contact_role_type` through a composite foreign key
 * carrying `tenant_id`, so a role type of another tenant cannot be assigned.
 * `ON UPDATE RESTRICT` needs nothing to cascade: a code is set when the type
 * is created and never changes.
 */
export const contactRole = pgTable(
  'contact_role',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    roleCode: text().notNull(),
    since: date({ mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'contact_role_contact_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.roleCode, t.tenantId],
      foreignColumns: [contactRoleType.code, contactRoleType.tenantId],
      name: 'contact_role_type_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    // Also serves lookups by contact — contact_id is the leading column.
    unique('contact_role_contact_role_key').on(t.contactId, t.roleCode),
    index('contact_role_tenant_role_idx').on(t.tenantId, t.roleCode),
  ],
)

/**
 * One relation, stored once. Both records show it: the `from` contact through
 * the forward label, the `to` contact through the inverse one. Storing it
 * twice would let the two copies drift apart.
 *
 * A directed relation may additionally exist in the opposite direction. That
 * is nonsense in content, but a constraint against it costs more than the case
 * is worth. For a **symmetric** type it would be the same fact twice, so
 * `domain/contact-relation.ts` normalizes the direction and the reverse
 * duplicate then collides with `contact_relation_pair_key`.
 */
export const contactRelation = pgTable(
  'contact_relation',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    fromContactId: uuid().notNull(),
    toContactId: uuid().notNull(),
    relationCode: text().notNull(),
    since: date({ mode: 'string' }),
    /**
     * A mirror of `contact_relation_type.is_exclusive`, written **only** by
     * the trigger `contact_relation_set_exclusive` (migration 0017). It exists
     * because the partial unique index below cannot read a second table.
     * Never set from application code, and never part of an API payload — the
     * type is the single source of truth.
     */
    exclusive: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.fromContactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'contact_relation_from_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.toContactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'contact_relation_to_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.relationCode, t.tenantId],
      foreignColumns: [contactRelationType.code, contactRelationType.tenantId],
      name: 'contact_relation_type_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('contact_relation_pair_key').on(t.fromContactId, t.toContactId, t.relationCode),
    /**
     * At most one relation of an exclusive type per `from` contact.
     *
     * If relations ever gain an end date, this index has to be narrowed to the
     * ones still running (`where exclusive and until is null`) — otherwise a
     * relation that ended years ago blocks the new one forever.
     */
    uniqueIndex('contact_relation_exclusive_key')
      .on(t.fromContactId, t.relationCode)
      .where(sql`${t.exclusive}`),
    // The other end: both records show the relation.
    index('contact_relation_to_idx').on(t.toContactId),
    check('contact_relation_not_self', sql`${t.fromContactId} <> ${t.toContactId}`),
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

export const textTemplateKind = pgEnum('text_template_kind', ['intro', 'outro'])

/**
 * Intro and outro blocks for invoices. Picking one fills the draft's text;
 * no invoice ever references a template, so editing one here changes nothing
 * that already exists.
 */
export const textTemplate = pgTable(
  'text_template',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    kind: textTemplateKind().notNull().$type<TextTemplateKind>(),
    name: text().notNull(),
    body: text().notNull(),
    isDefault: boolean().notNull().default(false),
    /** The outro for an invoice settled on the spot. The action that uses it
     *  arrives in slice 8 together with the `payment` table. */
    isPaidVariant: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('text_template_tenant_kind_name_key').on(t.tenantId, t.kind, t.name),
    // An invoice has a top and a bottom; there is no paid variant of an intro.
    check('text_template_paid_is_outro', sql`not ${t.isPaidVariant} or ${t.kind} = 'outro'`),
    uniqueIndex('text_template_default_key').on(t.tenantId, t.kind).where(sql`${t.isDefault}`),
    uniqueIndex('text_template_paid_key').on(t.tenantId).where(sql`${t.isPaidVariant}`),
  ],
)

export const invoiceType = pgEnum('invoice_type', ['invoice', 'cancellation_invoice'])
export const invoiceStatus = pgEnum('invoice_status', ['draft', 'finalized', 'cancelled'])

/**
 * Everything here is a snapshot, because everything it was built from stays
 * editable: services, texts, the contact's address. A finalized invoice has to
 * render identically for the whole retention period, which is why the PDF is
 * served from disk and never re-rendered on request (CLAUDE.md rule 9).
 *
 * After finalization the row is immutable except for `status`, enforced by the
 * `protect_finalized_invoice` trigger in migration 0014. Payments live in
 * their own table from slice 8 and never touch this row.
 *
 * `cancels_invoice_id` and `cancelled_by_invoice_id` arrive in slice 7 with
 * the code that fills them; the trigger is replaced there to let the second
 * one through.
 */
export const invoice = pgTable(
  'invoice',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    contactId: uuid().notNull(),
    type: invoiceType().notNull().default('invoice').$type<InvoiceType>(),
    status: invoiceStatus().notNull().default('draft').$type<InvoiceStatus>(),
    /**
     * The document number, formatted and frozen at finalization. Stored as
     * text rather than derived from prefix and padding on read: changing the
     * padding later must never rewrite a number that has already been issued.
     */
    number: text(),
    /**
     * The prefix and the raw counter value the number was built from, frozen
     * alongside it.
     *
     * The prefix is part of the unique key because rule 8 resets the range
     * every year — new prefix, `next_value` back to 1 — so value 1 exists once
     * per year and `unique (tenant_id, number_value)` would reject the first
     * invoice of every new year. Uniqueness of the document is carried by
     * `number` anyway; what these two columns are really for is gap detection:
     * "is a number missing in RH-2026 between 1 and 47" stays a query instead
     * of becoming string surgery.
     */
    numberPrefix: text(),
    numberValue: integer(),
    invoiceDate: date({ mode: 'string' }).notNull(),
    paymentTermDays: integer().notNull(),
    recipientSnapshot: jsonb().$type<RecipientSnapshot>(),
    introText: text(),
    outroText: text(),
    totalCents: integer().notNull().default(0),
    /** Relative to DATA_DIR, like every stored path. */
    pdfPath: text(),
    pdfHash: text(),
    finalizedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.contactId, t.tenantId],
      foreignColumns: [contact.id, contact.tenantId],
      name: 'invoice_contact_tenant_fk',
    }),
    unique('invoice_id_tenant_key').on(t.id, t.tenantId),
    unique('invoice_number_key').on(t.tenantId, t.number),
    unique('invoice_number_value_key').on(t.tenantId, t.numberPrefix, t.numberValue),
    index('invoice_contact_idx').on(t.contactId, t.invoiceDate),
    index('invoice_tenant_status_idx').on(t.tenantId, t.status, t.invoiceDate),
    // A draft has no number and no document; anything else has both.
    check(
      'invoice_draft_fields',
      sql`(${t.status} = 'draft'
             and ${t.number} is null and ${t.numberValue} is null
             and ${t.numberPrefix} is null and ${t.pdfPath} is null
             and ${t.pdfHash} is null and ${t.finalizedAt} is null)
          or (${t.status} <> 'draft'
             and ${t.number} is not null and ${t.numberValue} is not null
             and ${t.numberPrefix} is not null and ${t.pdfPath} is not null
             and ${t.pdfHash} is not null and ${t.finalizedAt} is not null
             and ${t.recipientSnapshot} is not null)`,
    ),
    check('invoice_pdf_hash_shape', sql`${t.pdfHash} is null or ${t.pdfHash} ~ '^[0-9a-f]{64}$'`),
    check('invoice_number_value_positive', sql`${t.numberValue} is null or ${t.numberValue} >= 1`),
    check('invoice_payment_term_range', sql`${t.paymentTermDays} between 0 and 365`),
  ],
)

/**
 * One line of an invoice, snapshotted from the activity item it came from.
 *
 * `activity_item_id` is kept as the record of origin and holds the item with
 * `ON DELETE RESTRICT`: an item that appears on an invoice must not be able to
 * disappear, or the invoice loses what it was raised for (CLAUDE.md rule 6).
 * `syncItems` in `domain/activity.ts` checks for that before deleting and
 * refuses with something readable.
 */
export const invoiceLine = pgTable(
  'invoice_line',
  {
    id: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenant.id),
    invoiceId: uuid().notNull(),
    position: integer().notNull(),
    /** Null for a free line typed by hand. */
    activityItemId: uuid(),
    description: text().notNull(),
    feeCode: text(),
    dateOfService: date({ mode: 'string' }),
    quantity: integer().notNull().default(1),
    unitPriceCents: integer().notNull(),
    /** Generated, so the line sum cannot drift from its own factors. Declared
     *  NOT NULL because it never can be — both factors are. */
    amountCents: integer().generatedAlwaysAs(sql`"quantity" * "unit_price_cents"`).notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.invoiceId, t.tenantId],
      foreignColumns: [invoice.id, invoice.tenantId],
      name: 'invoice_line_invoice_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.activityItemId, t.tenantId],
      foreignColumns: [activityItem.id, activityItem.tenantId],
      name: 'invoice_line_activity_item_tenant_fk',
    }).onDelete('restrict'),
    // At most once per invoice. Across invoices the billable query rules.
    unique('invoice_line_item_once_key').on(t.invoiceId, t.activityItemId),
    index('invoice_line_invoice_idx').on(t.invoiceId, t.position),
    index('invoice_line_activity_item_idx')
      .on(t.activityItemId)
      .where(sql`${t.activityItemId} is not null`),
    check('invoice_line_quantity_positive', sql`${t.quantity} > 0`),
  ],
)
