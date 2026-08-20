import type {
  ActivityStatus,
  AppointmentStatus,
  ContactInput,
  ContactListQuery,
} from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { contact, contactRole } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, genderId, roleTypeId, salutationId } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import {
  ContactKindChangeError,
  createContact,
  getContact,
  listContacts,
  setContactArchived,
  setContactRoles,
  updateContact,
} from './contact.js'

let tenantId: string
/** The seeded role types, looked up by label: a role has no code since
 *  migration 0035, so a test that wants "the patient role" resolves its id. */
let patientRole: string
let prospectRole: string
let participantRole: string

beforeEach(async () => {
  tenantId = await createTenant(db())
  patientRole = await roleTypeId(db(), tenantId, 'Patient')
  prospectRole = await roleTypeId(db(), tenantId, 'Interessent')
  participantRole = await roleTypeId(db(), tenantId, 'Teilnehmer')
})

const query = (overrides: Partial<ContactListQuery> = {}): ContactListQuery => ({
  includeArchived: false,
  order: 'alpha',
  sort: 'name',
  dir: 'asc',
  limit: 50,
  offset: 0,
  ...overrides,
})

function person(overrides: Partial<Extract<ContactInput, { kind: 'person' }>> = {}): ContactInput {
  return {
    kind: 'person',
    salutationId: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    dateOfBirth: null,
    birthPlace: null,
    genderId: null,
    vatId: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    countryId: null,
    email: null,
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles: [],
    ...overrides,
  }
}

function organization(
  overrides: Partial<Extract<ContactInput, { kind: 'organization' }>> = {},
): ContactInput {
  return {
    kind: 'organization',
    companyName: 'Beispiel GmbH',
    contactPerson: null,
    salutationId: null,
    vatId: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    countryId: null,
    email: null,
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles: [],
    ...overrides,
  }
}

describe('createContact', () => {
  it('numbers contacts sequentially, whatever their kind or role', async () => {
    const a = await createContact(db(), tenantId, person())
    const b = await createContact(db(), tenantId, organization())
    const c = await createContact(db(), tenantId, person({ lastName: 'Beispiel' }))

    expect([a.contactNumber, b.contactNumber, c.contactNumber]).toEqual([1, 2, 3])
  })

  it('nulls the fields of the other kind', async () => {
    const created = await createContact(db(), tenantId, organization({ contactPerson: 'M. Meier' }))

    expect(created.companyName).toBe('Beispiel GmbH')
    expect(created.contactPerson).toBe('M. Meier')
    expect(created.firstName).toBeNull()
    expect(created.lastName).toBeNull()
    expect(created.dateOfBirth).toBeNull()
  })

  /** A sole trader is a person and can still have a VAT id — the check
   *  constraint must not stand in the way. */
  it('allows a VAT id on a person', async () => {
    const created = await createContact(db(), tenantId, person({ vatId: 'DE123456789' }))

    expect(created.vatId).toBe('DE123456789')
  })

  it('stores several roles at once', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({
        roles: [
          { roleTypeId: prospectRole, since: '2026-01-15' },
          { roleTypeId: participantRole, since: null },
        ],
      }),
    )

    // In catalogue order — Interessent (20) before Teilnehmer (30). Sorted by
    // the code's alphabet until 0035, which is gone.
    expect(created.roles).toEqual([
      { roleTypeId: prospectRole, since: '2026-01-15' },
      { roleTypeId: participantRole, since: null },
    ])
  })

  it('rolls the number back when the insert fails', async () => {
    await createContact(db(), tenantId, person())

    // last_name null on a person violates contact_kind_fields.
    await expect(
      createContact(db(), tenantId, person({ lastName: null as unknown as string })),
    ).rejects.toThrow()

    const next = await createContact(db(), tenantId, person())
    expect(next.contactNumber).toBe(2)
  })

  it('stores the person fields', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({
        genderId: await genderId(db(), tenantId, 'divers'),
        birthPlace: 'Musterstadt',
        street: 'Musterweg',
        houseNumber: '12a',
        phoneMobile: '0170 0000000',
        phoneLandline: '030 0000000',
      }),
    )

    expect(created.genderId).toBe(await genderId(db(), tenantId, 'divers'))
    expect(created.birthPlace).toBe('Musterstadt')
    expect(created.houseNumber).toBe('12a')
    expect(created.phoneMobile).toBe('0170 0000000')
    expect(created.phoneLandline).toBe('030 0000000')
  })

  /**
   * A catalogue entry since D-R3, so what refuses an impossible value is the
   * composite foreign key rather than the check constraint that used to hold
   * `female | male | diverse`. The id below belongs to nobody.
   */
  it('refuses a gender that is no catalogue entry of this tenant', async () => {
    await expect(
      createContact(db(), tenantId, person({ genderId: '019fde08-0000-7000-8000-0000000000aa' })),
    ).rejects.toThrow()
  })

  /**
   * The salutation is the one field of this block an organization may hold
   * (D-R3): "Firma Mustermann GmbH" is the usual first line of a German
   * address, and there it is a prefix to the name rather than a personal
   * attribute.
   */
  it('allows a salutation on an organization', async () => {
    const created = await createContact(
      db(),
      tenantId,
      organization({ salutationId: await salutationId(db(), tenantId, 'Firma') }),
    )

    expect(created.salutationId).toBe(await salutationId(db(), tenantId, 'Firma'))
  })

  /** `kind` decides which fields apply: gender and birth place belong to a
   *  person, exactly like the title and the date of birth. */
  it('refuses person fields on an organization', async () => {
    await expect(
      db()
        .insert(contact)
        .values({
          id: newId(),
          tenantId,
          contactNumber: 900,
          kind: 'organization',
          companyName: 'Beispiel GmbH',
          genderId: await genderId(db(), tenantId, 'weiblich'),
        }),
    ).rejects.toThrow()

    await expect(
      db().insert(contact).values({
        id: newId(),
        tenantId,
        contactNumber: 901,
        kind: 'organization',
        companyName: 'Beispiel GmbH',
        birthPlace: 'Musterstadt',
      }),
    ).rejects.toThrow()
  })
})

describe('updateContact', () => {
  it('keeps the contact number', async () => {
    const created = await createContact(db(), tenantId, person())
    const updated = await updateContact(db(), tenantId, created.id, person({ city: 'Musterstadt' }))

    expect(updated?.contactNumber).toBe(created.contactNumber)
    expect(updated?.city).toBe('Musterstadt')
  })

  it('refuses to change the kind', async () => {
    const created = await createContact(db(), tenantId, person())

    await expect(updateContact(db(), tenantId, created.id, organization())).rejects.toBeInstanceOf(
      ContactKindChangeError,
    )
  })

  it('returns null for an unknown id', async () => {
    expect(
      await updateContact(db(), tenantId, '019fde08-0000-7000-8000-000000000000', person()),
    ).toBeNull()
  })

  it('does not reach into another tenant', async () => {
    const created = await createContact(db(), tenantId, person())
    const otherTenant = await createTenant(db())

    expect(await updateContact(db(), otherTenant, created.id, person())).toBeNull()
    expect(await getContact(db(), otherTenant, created.id)).toBeNull()
  })
})

describe('setContactRoles', () => {
  /**
   * The reason existing role rows are updated in place instead of being
   * deleted and reinserted: a save that does not touch a role must not move
   * the date it started.
   */
  it('leaves `since` of an unchanged role alone', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ roleTypeId: patientRole, since: '2024-03-01' }] }),
    )
    const [before] = await db()
      .select()
      .from(contactRole)
      .where(eq(contactRole.contactId, created.id))

    const updated = await setContactRoles(db(), tenantId, created.id, [
      { roleTypeId: patientRole, since: '2024-03-01' },
    ])

    expect(updated?.roles).toEqual([{ roleTypeId: patientRole, since: '2024-03-01' }])

    const [after] = await db()
      .select()
      .from(contactRole)
      .where(eq(contactRole.contactId, created.id))

    // Same row, not a recreated one.
    expect(after?.id).toBe(before?.id)
    expect(after?.since).toBe('2024-03-01')
  })

  it('keeps the date of an existing role when another is added later', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ roleTypeId: prospectRole, since: '2024-03-01' }] }),
    )

    const updated = await setContactRoles(db(), tenantId, created.id, [
      { roleTypeId: prospectRole, since: '2024-03-01' },
      { roleTypeId: patientRole, since: '2026-08-08' },
    ])

    expect(updated?.roles).toEqual([
      { roleTypeId: patientRole, since: '2026-08-08' },
      { roleTypeId: prospectRole, since: '2024-03-01' },
    ])
  })

  it('removes roles that are no longer submitted', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({
        roles: [
          { roleTypeId: patientRole, since: null },
          { roleTypeId: prospectRole, since: null },
        ],
      }),
    )

    const updated = await setContactRoles(db(), tenantId, created.id, [
      { roleTypeId: patientRole, since: null },
    ])

    expect(updated?.roles).toEqual([{ roleTypeId: patientRole, since: null }])
  })

  it('writes a deliberately changed date', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ roleTypeId: patientRole, since: '2024-03-01' }] }),
    )

    const updated = await setContactRoles(db(), tenantId, created.id, [
      { roleTypeId: patientRole, since: '2024-04-01' },
    ])

    expect(updated?.roles).toEqual([{ roleTypeId: patientRole, since: '2024-04-01' }])
  })
})

describe('listContacts', () => {
  beforeEach(async () => {
    await createContact(
      db(),
      tenantId,
      person({
        firstName: 'Erika',
        lastName: 'Musterfrau',
        roles: [{ roleTypeId: patientRole, since: null }],
      }),
    )
    await createContact(
      db(),
      tenantId,
      person({
        firstName: 'Ödön',
        lastName: 'Özdemir',
        roles: [{ roleTypeId: prospectRole, since: null }],
      }),
    )
    await createContact(db(), tenantId, person({ firstName: 'Anton', lastName: 'Zimmermann' }))
    await createContact(db(), tenantId, organization({ companyName: 'Beispiel GmbH' }))
  })

  /** Guards the ICU de-DE collation the migration asserts: under C or en_US,
   *  "Özdemir" would sort after "Zimmermann". */
  it('sorts by surname in German collation', async () => {
    const { items } = await listContacts(db(), tenantId, query())

    expect(items.map((item) => item.companyName ?? item.lastName)).toEqual([
      'Beispiel GmbH',
      'Musterfrau',
      'Özdemir',
      'Zimmermann',
    ])
  })

  it('searches surname, first name, company name and contact number', async () => {
    const bySurname = await listContacts(db(), tenantId, query({ q: 'muster' }))
    expect(bySurname.items.map((item) => item.lastName)).toEqual(['Musterfrau'])

    const byFirstName = await listContacts(db(), tenantId, query({ q: 'Anton' }))
    expect(byFirstName.items.map((item) => item.lastName)).toEqual(['Zimmermann'])

    const byCompany = await listContacts(db(), tenantId, query({ q: 'gmbh' }))
    expect(byCompany.items.map((item) => item.companyName)).toEqual(['Beispiel GmbH'])

    const byNumber = await listContacts(db(), tenantId, query({ q: '3' }))
    expect(byNumber.items.map((item) => item.contactNumber)).toEqual([3])
  })

  it('treats LIKE wildcards in the search term as literal characters', async () => {
    const { items, total } = await listContacts(db(), tenantId, query({ q: '%' }))

    expect(items).toEqual([])
    expect(total).toBe(0)
  })

  it('filters by role', async () => {
    const { items } = await listContacts(db(), tenantId, query({ roleTypeId: patientRole }))

    expect(items.map((item) => item.lastName)).toEqual(['Musterfrau'])
  })

  it('hides archived contacts unless asked', async () => {
    const { items } = await listContacts(db(), tenantId, query({ q: 'Zimmermann' }))
    const target = items[0]
    if (!target) throw new Error('fixture missing')

    await setContactArchived(db(), tenantId, target.id, true)

    expect((await listContacts(db(), tenantId, query())).total).toBe(3)
    expect((await listContacts(db(), tenantId, query({ includeArchived: true }))).total).toBe(4)
  })

  it('reports the total independently of the page size', async () => {
    const page = await listContacts(db(), tenantId, query({ limit: 2 }))

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(4)

    const second = await listContacts(db(), tenantId, query({ limit: 2, offset: 2 }))
    expect(second.items).toHaveLength(2)
    expect(second.items[0]?.lastName).toBe('Özdemir')
  })

  it('shows only its own tenant', async () => {
    const otherTenant = await createTenant(db())
    await createContact(db(), otherTenant, person({ lastName: 'Fremd' }))

    const { items, total } = await listContacts(db(), tenantId, query())

    expect(total).toBe(4)
    expect(items.map((item) => item.lastName)).not.toContain('Fremd')
  })

  /**
   * A health datum under Art. 9 GDPR must never reach the contact list
   * (CLAUDE.md rule 12). This is checked at the object level, not just the
   * type level: `listColumns` in `domain/contact.ts` never selects the column
   * in the first place, so there is nothing to leak even if the response
   * schema were loosened later.
   */
  it('never carries diagnosis on a list row, even though it is set', async () => {
    await createContact(
      db(),
      tenantId,
      person({ lastName: 'Vertraulich', diagnosis: 'Anpassungsstörung' }),
    )

    const { items } = await listContacts(db(), tenantId, query({ q: 'Vertraulich' }))
    const row = items[0]
    if (!row) throw new Error('fixture missing')

    expect('diagnosis' in row).toBe(false)

    const created = await getContact(db(), tenantId, row.id)
    expect(created?.diagnosis).toBe('Anpassungsstörung')
  })
})

/**
 * The everyday order (`current`): who was here in the last two weeks or is
 * coming in the next, nearest to now first.
 *
 * `now` is handed in rather than read from the clock, so the window has fixed
 * edges and the test does not drift with the day it runs on.
 */
describe('listContacts, ordered by what is current', () => {
  const NOW = new Date('2026-08-24T08:00:00.000Z')

  const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

  async function book(
    contactId: string,
    startsAt: string,
    options: { status?: AppointmentStatus; activityStatus?: ActivityStatus } = {},
  ) {
    await createActivity(db(), tenantId, {
      contactId,
      type: 'session',
      status: options.activityStatus ?? 'planned',
      occurredAt: startsAt,
      durationMin: null,
      title: null,
      internalNote: null,
      items: [],
      appointment: {
        startsAt,
        endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
        status: options.status ?? 'planned',
        title: null,
        note: null,
      },
    })
  }

  const current = (overrides: Partial<ContactListQuery> = {}) =>
    listContacts(db(), tenantId, query({ order: 'current', ...overrides }), NOW)

  it('sorts by distance from now, in both directions', async () => {
    const soon = await createContact(db(), tenantId, person({ lastName: 'Baldda' }))
    const earlier = await createContact(db(), tenantId, person({ lastName: 'Warda' }))
    const later = await createContact(db(), tenantId, person({ lastName: 'Spaeter' }))

    await book(soon.id, hoursFromNow(1))
    await book(earlier.id, hoursFromNow(-2))
    await book(later.id, hoursFromNow(30))

    const { items } = await current()
    expect(items.map((item) => item.lastName)).toEqual(['Baldda', 'Warda', 'Spaeter'])
  })

  it('leaves out everyone without an appointment in the window', async () => {
    const inside = await createContact(db(), tenantId, person({ lastName: 'Drinnen' }))
    const outside = await createContact(db(), tenantId, person({ lastName: 'Draussen' }))

    await book(inside.id, hoursFromNow(24))
    await book(outside.id, hoursFromNow(24 * 15))

    const { items, total } = await current()
    expect(items.map((item) => item.lastName)).toEqual(['Drinnen'])
    expect(total).toBe(1)
  })

  it('shows a contact once, with the appointment nearest to now', async () => {
    const created = await createContact(db(), tenantId, person({ lastName: 'Mehrfach' }))

    await book(created.id, hoursFromNow(-48))
    await book(created.id, hoursFromNow(3))
    await book(created.id, hoursFromNow(72))

    const { items } = await current()
    expect(items).toHaveLength(1)
    expect(items[0]?.appointmentAt).toBe(hoursFromNow(3))
  })

  /**
   * A cancellation is the answer "not this one"; a no-show still happened and
   * is a reason to open the record. Same distinction the overlap constraint
   * makes — and since slice 7.5 it is also the difference between the two
   * status columns: the cancellation is on the appointment, the no-show on the
   * activity, and the "Aktuell" order reads only the appointment.
   */
  it('ignores cancelled appointments but keeps a no-show', async () => {
    const cancelled = await createContact(db(), tenantId, person({ lastName: 'Abgesagt' }))
    const noShow = await createContact(db(), tenantId, person({ lastName: 'Nichtda' }))

    await book(cancelled.id, hoursFromNow(2), { status: 'cancelled' })
    await book(noShow.id, hoursFromNow(4), { activityStatus: 'no_show' })

    const { items } = await current()
    expect(items.map((item) => item.lastName)).toEqual(['Nichtda'])
  })

  it('still applies the role filter and the archive rule', async () => {
    const patient = await createContact(
      db(),
      tenantId,
      person({ lastName: 'Patientin', roles: [{ roleTypeId: patientRole, since: null }] }),
    )
    const other = await createContact(db(), tenantId, person({ lastName: 'Ohnerolle' }))

    await book(patient.id, hoursFromNow(1))
    await book(other.id, hoursFromNow(2))

    expect((await current({ roleTypeId: patientRole })).items.map((item) => item.lastName)).toEqual(
      ['Patientin'],
    )

    await setContactArchived(db(), tenantId, patient.id, true)
    expect((await current()).items.map((item) => item.lastName)).toEqual(['Ohnerolle'])
  })

  it('leaves the appointment out of the alphabetical order', async () => {
    const created = await createContact(db(), tenantId, person({ lastName: 'Egal' }))
    await book(created.id, hoursFromNow(1))

    const { items } = await listContacts(db(), tenantId, query(), NOW)
    expect(items[0]?.appointmentAt).toBeNull()
  })
})

describe('listContacts, ordered alphabetically', () => {
  beforeEach(async () => {
    await createContact(db(), tenantId, person({ lastName: 'Musterfrau' }))
    await createContact(db(), tenantId, person({ lastName: 'Zimmermann' }))
  })

  it('turns the direction around', async () => {
    const { items } = await listContacts(db(), tenantId, query({ dir: 'desc' }))
    expect(items.map((item) => item.lastName)).toEqual(['Zimmermann', 'Musterfrau'])
  })

  it('sorts by contact number when asked', async () => {
    const { items } = await listContacts(db(), tenantId, query({ sort: 'number', dir: 'desc' }))
    expect(items.map((item) => item.contactNumber)).toEqual([2, 1])
  })
})

describe('roles have their own path', () => {
  /** The reason they do: the header saves a role the moment it is ticked,
   *  while the master data form saves on a button. If roles travelled in the
   *  form's payload, an open form would write back the roles it was opened
   *  with. See the note on `contactUpdateSchema`. */
  it('survive a master data save untouched', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ roleTypeId: patientRole, since: '2024-03-01' }] }),
    )

    const updated = await updateContact(db(), tenantId, created.id, {
      kind: 'person',
      salutationId: null,
      title: null,
      firstName: 'Erika',
      lastName: 'Musterfrau',
      dateOfBirth: null,
      birthPlace: null,
      genderId: null,
      vatId: null,
      street: null,
      houseNumber: null,
      postalCode: null,
      city: 'Musterstadt',
      countryId: null,
      email: null,
      phoneMobile: null,
      phoneLandline: null,
      internalNote: null,
      diagnosis: null,
    })

    expect(updated?.city).toBe('Musterstadt')
    expect(updated?.roles).toEqual([{ roleTypeId: patientRole, since: '2024-03-01' }])
  })

  it('report an unknown contact rather than inventing one', async () => {
    expect(
      await setContactRoles(db(), tenantId, '019fde08-0000-7000-8000-0000000000ff', []),
    ).toBeNull()
  })
})

describe('archiving', () => {
  it('archives and restores without touching anything else', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ roleTypeId: patientRole, since: '2024-03-01' }] }),
    )

    const archived = await setContactArchived(db(), tenantId, created.id, true)
    expect(archived?.archivedAt).not.toBeNull()
    expect(archived?.roles).toEqual([{ roleTypeId: patientRole, since: '2024-03-01' }])

    const restored = await setContactArchived(db(), tenantId, created.id, false)
    expect(restored?.archivedAt).toBeNull()
    expect(restored?.contactNumber).toBe(created.contactNumber)
  })

  it('returns null for an unknown id', async () => {
    expect(
      await setContactArchived(db(), tenantId, '019fde08-0000-7000-8000-000000000000', true),
    ).toBeNull()
  })
})

describe('database guarantees', () => {
  /** `updated_at` is maintained by the trigger, not by the application, so it
   *  also moves for a write that did not come through Drizzle. */
  it('advances updated_at on every write', async () => {
    const created = await createContact(db(), tenantId, person())
    const read = async () => {
      const [row] = await db()
        .select({ updatedAt: contact.updatedAt })
        .from(contact)
        .where(eq(contact.id, created.id))
      return row?.updatedAt.getTime() ?? 0
    }

    const before = await read()
    await db().update(contact).set({ city: 'Musterstadt' }).where(eq(contact.id, created.id))

    expect(await read()).toBeGreaterThan(before)
  })

  it('rejects a role that is not a role type of this tenant', async () => {
    const created = await createContact(db(), tenantId, person())

    await expect(
      db().insert(contactRole).values({
        id: '019fde08-0000-7000-8000-000000000001',
        tenantId,
        contactId: created.id,
        roleTypeId: '019fde08-0000-7000-8000-00000000ffff',
        since: null,
      }),
    ).rejects.toThrow()
  })

  it('refuses a role row whose tenant differs from its contact', async () => {
    const created = await createContact(db(), tenantId, person())
    const otherTenant = await createTenant(db())

    await expect(
      db().insert(contactRole).values({
        id: '019fde08-0000-7000-8000-000000000002',
        tenantId: otherTenant,
        contactId: created.id,
        roleTypeId: patientRole,
        since: null,
      }),
    ).rejects.toThrow()
  })
})
