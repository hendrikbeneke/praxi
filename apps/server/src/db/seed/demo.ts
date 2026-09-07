/**
 * Data to click through, and a second tenant to see tenant isolation with.
 *
 * Deliberately NOT part of `pnpm db:seed`. That seed is "everything a fresh
 * clone needs to be usable" — a tenant, a user, the catalogues. Contacts with
 * treatment histories are not that; they are a convenience for developing, and
 * they must never appear in the database of a practice that starts using this.
 * `pnpm db:seed:demo`, on purpose, and it says so when it runs.
 *
 * Everything here goes through the domain functions rather than inserting rows
 * directly. Writing the rows by hand would be shorter and would produce states
 * the application cannot reach — an activity whose items do not match its
 * type, an invoice without a snapshot — which is worse than no demo data at
 * all: it looks like the real thing while behaving differently.
 *
 * The names are obviously fake, as everywhere in this repository.
 */
import {
  activityInputSchema,
  type ContactInput,
  contactInputSchema,
  noteInputSchema,
} from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { createActivity } from '../../domain/activity.js'
import { hashPassword } from '../../domain/auth.js'
import { createContact } from '../../domain/contact.js'
import { collectBillableItems } from '../../domain/invoice.js'
import { createNote } from '../../domain/note.js'
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import {
  account,
  activityType,
  appUser,
  contact,
  contactRoleType,
  noteType,
  practiceSettings,
  service,
  tenant,
} from '../schema.js'
import { seedActivityTypes } from './activity-types.js'
import { seedContactTypes } from './contact-types.js'
import { seedNoteTypes } from './note-types.js'
import { seedServices } from './services.js'
import { seedValueLists } from './value-lists.js'

/** The second tenant's own practitioner. One password for both demo users;
 *  this database holds nothing that is not made up. */
export const DEMO_PASSWORD = 'demo-passwort-1234'

type Practice = {
  label: string
  /**
   * `existing` hangs the data off the tenant `pnpm db:seed` already made, so a
   * developer signs in with the credentials from their own `.env` and finds
   * something there. `own` creates a tenant, a practice and a user of its own —
   * that is the second practice, and its whole purpose is that tenant isolation
   * becomes something to look at rather than only to assert.
   */
  tenant: 'existing' | 'own'
  practiceName?: string
  userEmail?: string
  userName?: string
  city: string
  contacts: readonly DemoContact[]
}

type DemoContact = {
  firstName: string
  lastName: string
  city: string
  /** Sessions to write, counted back from today in weeks. */
  sessions: number
  notes: readonly string[]
}

/**
 * Two practices that have nothing to do with each other. That is the whole
 * point of the second one: with row-level security on (S-C2) the isolation is
 * something to look at in a browser rather than only an assertion in a test.
 */
const PRACTICES: readonly Practice[] = [
  {
    label: 'die geseedete Praxis',
    tenant: 'existing',
    city: 'Musterstadt',
    contacts: [
      {
        firstName: 'Alma',
        lastName: 'Ackermann',
        city: 'Bremen',
        sessions: 4,
        notes: [
          'Erstgespräch geführt. Anliegen und bisheriger Verlauf aufgenommen, Rahmen und Frequenz besprochen.',
          'Zweite Sitzung. Vereinbarte Übung wurde umgesetzt, Rückmeldung überwiegend positiv.',
        ],
      },
      {
        firstName: 'Cordula',
        lastName: 'Bergmann',
        city: 'Delmenhorst',
        sessions: 3,
        notes: ['Erstgespräch. Termin für die Folgesitzung vereinbart.'],
      },
      {
        firstName: 'Detlef',
        lastName: 'Brandt',
        city: 'Stuhr',
        sessions: 2,
        notes: ['Erstgespräch geführt, weiteres Vorgehen abgestimmt.'],
      },
      {
        firstName: 'Elke',
        lastName: 'Cordes',
        city: 'Bremen',
        sessions: 5,
        notes: [
          'Erstgespräch.',
          'Verlauf stabil, Frequenz auf zweiwöchentlich umgestellt.',
          'Zwischenbilanz besprochen.',
        ],
      },
    ],
  },
  {
    label: 'Praxis Nordlicht',
    tenant: 'own',
    practiceName: 'Praxis Nordlicht — Heilpraktiker für Psychotherapie',
    userEmail: 'zweitpraxis@praxi.invalid',
    userName: 'Zweite Behandlerin',
    city: 'Beispielhafen',
    contacts: [
      {
        firstName: 'Gustav',
        lastName: 'Nordmann',
        city: 'Beispielhafen',
        sessions: 3,
        notes: ['Erstgespräch in der zweiten Praxis. Gehört NICHT zu Praxis Musterfrau.'],
      },
      {
        firstName: 'Heike',
        lastName: 'Ostermann',
        city: 'Beispielhafen',
        sessions: 2,
        notes: ['Erstgespräch. Diese Notiz darf im ersten Mandanten nirgends auftauchen.'],
      },
    ],
  },
]

/** Midnight-anchored, so a run is not sensitive to the hour it happens at. */
function weeksAgo(weeks: number, hour: number): Date {
  const day = new Date()
  day.setHours(hour, 0, 0, 0)
  day.setDate(day.getDate() - weeks * 7)
  return day
}

async function ensurePractice(database: Database, practice: Practice): Promise<string | null> {
  if (practice.tenant === 'existing') {
    const [row] = await database.select({ id: tenant.id }).from(tenant).limit(1)
    if (!row) throw new Error('no tenant yet — run `pnpm db:seed` first')

    const [already] = await database
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.tenantId, row.id))
      .limit(1)
    if (already) {
      console.info('  hat schon Kontakte — unangetastet gelassen')
      return null
    }
    return row.id
  }

  const email = practice.userEmail
  if (!email || !practice.userName || !practice.practiceName) {
    throw new Error('a practice with its own tenant needs a name, a user and an address')
  }

  const [existingUser] = await database
    .select({ tenantId: appUser.tenantId })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1)

  if (existingUser) {
    console.info(`  ${email} gibt es schon — unangetastet gelassen`)
    return null
  }

  const tenantId = newId()
  await database.insert(tenant).values({ id: tenantId })
  await database.insert(practiceSettings).values({
    id: newId(),
    tenantId,
    practiceName: practice.practiceName ?? practice.label,
    street: 'Beispielweg 1',
    postalCode: '12345',
    city: practice.city,
    country: 'DE',
    defaultPaymentTermDays: 14,
  })

  // The catalogues, from the same functions the real seed uses. A tenant
  // without them is not a state the application can reach.
  await seedContactTypes(database, tenantId)
  await seedValueLists(database, tenantId)
  await seedNoteTypes(database, tenantId)
  await seedActivityTypes(database, tenantId)
  await seedServices(database, tenantId)

  const userId = newId()
  await database.insert(appUser).values({
    id: userId,
    tenantId,
    email: email,
    name: practice.userName,
  })
  await database.insert(account).values({
    id: newId(),
    userId,
    issuer: 'local:credential',
    accountId: userId,
    providerId: 'credential',
    password: await hashPassword(DEMO_PASSWORD),
  })

  return tenantId
}

async function idByLabel(
  database: Database,
  tenantId: string,
  table: typeof activityType | typeof noteType | typeof contactRoleType,
  label: string,
): Promise<string> {
  const [row] = await database
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.label, label)))
    .limit(1)
  if (!row) throw new Error(`no entry labelled "${label}" — was the catalogue seeded?`)
  return row.id
}

async function serviceIdByCode(
  database: Database,
  tenantId: string,
  shortCode: string,
): Promise<string> {
  const [row] = await database
    .select({ id: service.id })
    .from(service)
    .where(and(eq(service.tenantId, tenantId), eq(service.shortCode, shortCode)))
    .limit(1)
  if (!row) throw new Error(`no service with short code "${shortCode}"`)
  return row.id
}

async function fillPractice(
  database: Database,
  tenantId: string,
  practice: Practice,
): Promise<void> {
  const [user] = await database
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.tenantId, tenantId))
    .limit(1)
  if (!user) throw new Error('the practice has no user')

  const patientRole = await idByLabel(database, tenantId, contactRoleType, 'Patient')
  const firstTalk = await idByLabel(database, tenantId, activityType, 'Erstgespräch')
  const session = await idByLabel(database, tenantId, activityType, 'Folgesitzung')
  const sessionNote = await idByLabel(database, tenantId, noteType, 'Sitzung')
  const firstTalkService = await serviceIdByCode(database, tenantId, 'EG')
  const sessionService = await serviceIdByCode(database, tenantId, 'FS')

  const billableItemIds: string[] = []

  for (const person of practice.contacts) {
    const input: ContactInput = contactInputSchema.parse({
      kind: 'person',
      firstName: person.firstName,
      lastName: person.lastName,
      street: 'Musterstraße',
      houseNumber: String(7 + person.sessions),
      postalCode: '28199',
      city: person.city,
      email: `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase()}@praxi.invalid`,
      roles: [{ roleTypeId: patientRole }],
    } satisfies Record<string, unknown>)

    const created = await createContact(database, tenantId, input)

    const activityIds: string[] = []
    for (let index = 0; index < person.sessions; index++) {
      // Oldest first, one a week, so the list has a past to page through and
      // the newest sits nearest to today.
      const isFirst = index === 0
      const weeks = person.sessions - index
      const activity = await createActivity(
        database,
        tenantId,
        activityInputSchema.parse({
          contactId: created.id,
          activityTypeId: isFirst ? firstTalk : session,
          status: 'rendered',
          occurredAt: weeksAgo(weeks, 10 + (index % 6)).toISOString(),
          durationMin: isFirst ? 90 : 50,
          items: [{ kind: 'service', serviceId: isFirst ? firstTalkService : sessionService }],
          appointment: null,
        }),
      )
      activityIds.push(activity.id)
      for (const item of activity.items) {
        if (item.billable) billableItemIds.push(item.id)
      }
    }

    for (const [index, text] of person.notes.entries()) {
      await createNote(
        database,
        tenantId,
        user.id,
        noteInputSchema.parse({
          contactId: created.id,
          activityId: activityIds[index] ?? null,
          noteDate: weeksAgo(person.sessions - index, 12)
            .toISOString()
            .slice(0, 10),
          noteTypeId: sessionNote,
          text,
        }),
      )
    }
  }

  // Drafts for some of the work and not all of it, so both states are on
  // screen: invoices to look at, and open items under "Abrechenbar" and in the
  // "Offene Vorgänge" tile. Collecting everything would leave those empty and
  // the screens would look finished rather than in use.
  //
  // The same call the "Abrechnen" button makes, so the drafts look like the
  // ones a practitioner would produce. Deliberately left AS drafts: finalizing
  // writes a PDF to disk and burns a number from the range, and neither belongs
  // in a seed.
  const toBill = billableItemIds.slice(0, Math.ceil(billableItemIds.length * 0.6))
  if (toBill.length > 0) {
    const collected = await collectBillableItems(database, tenantId, {
      activityItemIds: toBill,
      invoiceDate: new Date().toISOString().slice(0, 10),
    })
    console.info(`  ${collected.length} Rechnungsentwürfe`)
  }
}

export async function seedDemo(database: Database): Promise<void> {
  for (const practice of PRACTICES) {
    console.info(practice.practiceName ?? practice.label)
    const tenantId = await ensurePractice(database, practice)
    if (!tenantId) continue
    await fillPractice(database, tenantId, practice)
    console.info(`  ${practice.contacts.length} Kontakte mit Vorgängen und Notizen`)
  }
}
