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

import type { ContactKind, ContactRole } from '@praxi/shared'
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
