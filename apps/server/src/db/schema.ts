/**
 * Drizzle schema.
 *
 * Every domain table carries `tenant_id uuid not null` (CLAUDE.md rule 1),
 * `id uuid primary key` filled with a UUIDv7 from the application (see
 * `src/id.ts`), and `created_at` / `updated_at` as `timestamptz`.
 *
 * `updated_at` is maintained by Drizzle's `$onUpdate` rather than by a trigger,
 * so the value is visible in the returning clause of the same statement.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
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
