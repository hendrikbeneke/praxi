import {
  activityInputSchema,
  contactInputSchema,
  contactRelationInputSchema,
  noteInputSchema,
} from '@praxi/shared'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Transaction } from '../../db/client.js'
import {
  activityType,
  appUser,
  contact,
  contactRelationType,
  contactRoleType,
  noteType,
  service,
} from '../../db/schema.js'
import { createActivity } from '../../domain/activity.js'
import { createContact } from '../../domain/contact.js'
import { addRelation } from '../../domain/contact-relation.js'
import { collectBillableItems } from '../../domain/invoice.js'
import { createNote } from '../../domain/note.js'
import { updatePracticeSettings } from '../../domain/practice-settings.js'
import { createTenant } from '../../domain/tenant.js'
import { newId } from '../../id.js'
import { applyCatalogues, type TenantRunner } from '../catalogues.js'
import type { Command } from '../command.js'
import { applyDemoServices, demoPracticeSettings } from '../demo-seed.js'
import { CliError } from '../errors.js'
import type { Output } from '../output.js'
import { findPractice } from '../provision.js'
import { readSeedFile } from '../seed-files.js'

/**
 * Contacts with treatment histories, notes and draft invoices — **for local
 * development only**, and never in the database of a practice that has started
 * using this.
 *
 * Everything goes through the domain functions rather than inserting rows.
 * Writing them by hand would be shorter and would produce states the
 * application cannot reach — an activity whose items do not match its type, an
 * invoice without a snapshot — which is worse than no demo data at all: it
 * looks like the real thing while behaving differently.
 *
 * The data is in `seeds/demo/practices.json`; that README explains what each
 * field does and why the second practice exists.
 */

/** One password for both demo users; this database holds nothing that is not
 *  made up. */
const DEMO_PASSWORD = 'demo-passwort-1234'

const demoContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  city: z.string(),
  sessions: z.number().int().min(0),
  notes: z.array(z.string()),
  ageYears: z.number().int().positive().optional(),
  houseNumber: z.string().optional(),
  /** `null` is "no role at all" — the paying parent. Absent means `Patient`. */
  role: z.string().nullable().optional(),
  guardedBy: z.string().optional(),
})

const demoPracticeSchema = z.object({
  label: z.string(),
  tenant: z.enum(['existing', 'own']),
  practiceName: z.string().optional(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
  city: z.string(),
  contacts: z.array(demoContactSchema),
})

type DemoPractice = z.infer<typeof demoPracticeSchema>

/** Midnight-anchored, so a run is not sensitive to the hour it happens at. */
function weeksAgo(weeks: number, hour: number): Date {
  const day = new Date()
  day.setHours(hour, 0, 0, 0)
  day.setDate(day.getDate() - weeks * 7)
  return day
}

/** Today minus a whole number of years. Derived on every run rather than
 *  written down, so a demo minor does not come of age on a fixed date. */
function bornYearsAgo(years: number): string {
  const day = new Date()
  day.setFullYear(day.getFullYear() - years)
  return day.toISOString().slice(0, 10)
}

/**
 * `Sönke` → `soenke`. The demo addresses are built from the names, and the
 * email schema does not accept an umlaut in the local part — so a contact
 * called Müller or Sönke would fail here rather than in a form. Transliterate
 * where the address is made up, instead of loosening a schema that is about
 * real addresses.
 */
function localPart(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

async function idByLabel(
  tx: Transaction,
  tenantId: string,
  table: typeof activityType | typeof noteType | typeof contactRoleType,
  label: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.label, label)))
    .limit(1)
  if (!row) throw new CliError(`no entry labelled "${label}" — was the catalogue applied?`)
  return row.id
}

/**
 * A system relation type, by the code it keeps for exactly this: the uuid is
 * different in every installation, and the label is the practitioner's to
 * change. The same lookup `domain/invoice.ts` makes for `billing_recipient`.
 */
async function relationTypeIdByCode(
  tx: Transaction,
  tenantId: string,
  code: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: contactRelationType.id })
    .from(contactRelationType)
    .where(and(eq(contactRelationType.tenantId, tenantId), eq(contactRelationType.code, code)))
    .limit(1)
  if (!row) throw new CliError(`no relation type with code "${code}"`)
  return row.id
}

async function serviceIdByCode(
  tx: Transaction,
  tenantId: string,
  shortCode: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: service.id })
    .from(service)
    .where(and(eq(service.tenantId, tenantId), eq(service.shortCode, shortCode)))
    .limit(1)
  if (!row) throw new CliError(`no service with short code "${shortCode}"`)
  return row.id
}

async function fillPractice(
  tx: Transaction,
  tenantId: string,
  practice: DemoPractice,
  out: Output,
): Promise<void> {
  const [user] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.tenantId, tenantId))
    .limit(1)
  if (!user) throw new CliError('the practice has no user')

  const patientRole = await idByLabel(tx, tenantId, contactRoleType, 'Patient')
  const firstTalk = await idByLabel(tx, tenantId, activityType, 'Erstgespräch')
  const session = await idByLabel(tx, tenantId, activityType, 'Folgesitzung')
  const sessionNote = await idByLabel(tx, tenantId, noteType, 'Sitzung')
  const firstTalkService = await serviceIdByCode(tx, tenantId, 'EG')
  const sessionService = await serviceIdByCode(tx, tenantId, 'FS')

  const billableItemIds: string[] = []
  /** By `"Vorname Nachname"`, which is what `guardedBy` names. */
  const contactIds = new Map<string, string>()

  for (const person of practice.contacts) {
    const role = person.role === undefined ? 'Patient' : person.role
    const created = await createContact(
      tx,
      tenantId,
      contactInputSchema.parse({
        kind: 'person',
        firstName: person.firstName,
        lastName: person.lastName,
        dateOfBirth: person.ageYears === undefined ? null : bornYearsAgo(person.ageYears),
        street: 'Musterstraße',
        houseNumber: person.houseNumber ?? String(7 + person.sessions),
        postalCode: '28199',
        city: person.city,
        email: `${localPart(person.firstName)}.${localPart(person.lastName)}@praxi.invalid`,
        roles: role === null ? [] : [{ roleTypeId: patientRole }],
      }),
    )
    contactIds.set(`${person.firstName} ${person.lastName}`, created.id)

    const activityIds: string[] = []
    for (let index = 0; index < person.sessions; index++) {
      // Oldest first, one a week, so the list has a past to page through and
      // the newest sits nearest to today.
      const isFirst = index === 0
      const weeks = person.sessions - index
      const activity = await createActivity(
        tx,
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
        tx,
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

  /**
   * The family, and it is written **before** the drafts below on purpose: a new
   * draft starts on the contact's `billing_recipient` where there is one (L8),
   * so this is the difference between a demo that merely has a relation
   * somewhere and one where an invoice for a child is actually addressed to the
   * parent — which is the case the practice bills that way.
   *
   * Both relations hang from the **child**, per the direction convention in
   * rule 4: `from` is the contact the fact is a property of.
   */
  const guardianType = await relationTypeIdByCode(tx, tenantId, 'guardian')
  const billingType = await relationTypeIdByCode(tx, tenantId, 'billing_recipient')

  let relations = 0
  for (const person of practice.contacts) {
    if (!person.guardedBy) continue

    const childId = contactIds.get(`${person.firstName} ${person.lastName}`)
    const guardianId = contactIds.get(person.guardedBy)
    if (!childId || !guardianId) {
      throw new CliError(`guardedBy names nobody in this practice: "${person.guardedBy}"`)
    }

    for (const relationTypeId of [guardianType, billingType]) {
      await addRelation(
        tx,
        tenantId,
        childId,
        contactRelationInputSchema.parse({
          relationTypeId,
          direction: 'forward',
          otherContactId: guardianId,
        }),
      )
      relations += 1
    }
  }

  // Drafts for some of the work and not all of it, so both states are on
  // screen: invoices to look at, and open items under "Abrechenbar" and in the
  // "Offene Vorgänge" tile. Deliberately left AS drafts — finalizing writes a
  // PDF to disk and burns a number from the range, and neither belongs here.
  const toBill = billableItemIds.slice(0, Math.ceil(billableItemIds.length * 0.6))
  let drafts = 0
  if (toBill.length > 0) {
    const collected = await collectBillableItems(tx, tenantId, {
      activityItemIds: toBill,
      invoiceDate: new Date().toISOString().slice(0, 10),
    })
    drafts = collected.length
  }

  out.step(
    'filled',
    `${practice.contacts.length} contacts, ${relations} relations, ${drafts} draft invoice(s)`,
  )
}

export const devDemo: Command = {
  path: ['dev', 'demo'],
  scope: 'tenant',
  devOnly: true,
  summary: 'Local development: contacts, sessions, notes and draft invoices in two practices',
  options: {},
  notes: [
    'The second practice exists so tenant isolation is something to look at in a',
    "browser: sign in as one and none of the other's records may be anywhere.",
    'A practice that already has contacts is left alone.',
  ],

  async run({ out, tenants, asTenant }) {
    const practices = await readSeedFile('demo', 'practices.json', z.array(demoPracticeSchema))
    const seeded = await demoPracticeSettings()

    for (const practice of practices) {
      const practiceName =
        practice.tenant === 'existing' ? seeded.practiceName : practice.practiceName
      if (!practiceName) {
        throw new CliError(`the practice "${practice.label}" has no practiceName`)
      }

      out.line()
      out.line(practiceName)

      const found = await findPractice(tenants, practiceName, 'Remove one of them first.')

      if (practice.tenant === 'existing') {
        if (!found) throw new CliError('No seeded practice yet. Run `praxi dev seed` first.')

        const hasContacts = await asTenant(found.id, async (tx) => {
          const [row] = await tx
            .select({ id: contact.id })
            .from(contact)
            .where(eq(contact.tenantId, found.id))
            .limit(1)
          return row !== undefined
        })
        if (hasContacts) {
          out.step('skipped', 'already has contacts — left untouched')
          continue
        }

        await asTenant(found.id, (tx) => fillPractice(tx, found.id, practice, out))
        continue
      }

      if (found) {
        out.step('skipped', `${found.id} already exists — left untouched`)
        continue
      }

      if (!practice.userEmail || !practice.userName) {
        throw new CliError(`the practice "${practice.label}" needs a userEmail and a userName`)
      }

      const tenantId = newId()
      const run: TenantRunner = (work) => asTenant(tenantId, work)

      await run((tx) =>
        createTenant(tx, tenantId, {
          practiceName,
          user: {
            email: practice.userEmail ?? '',
            name: practice.userName ?? '',
            password: DEMO_PASSWORD,
          },
        }),
      )
      out.step('structure', 'tenant, practice settings, user, 2 system relation types')

      await applyCatalogues({ tenantId, run })
      await run(async (tx) => {
        await updatePracticeSettings(tx, tenantId, {
          street: 'Beispielweg 1',
          postalCode: '12345',
          city: practice.city,
          country: 'DE',
          defaultPaymentTermDays: 14,
        })
      })
      await applyDemoServices(run, tenantId)
      out.step('catalogues', 'applied, with the example services')

      await run((tx) => fillPractice(tx, tenantId, practice, out))
    }

    out.line()
    out.line(`Both demo users share the password: ${DEMO_PASSWORD}`)
    out.line()
  },
}
