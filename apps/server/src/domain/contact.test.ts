import type { ContactInput, ContactListQuery } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { contact, contactRole } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, genderId, roleTypeId, salutationId } from '../test/fixtures.js'
import {
  ContactKindChangeError,
  createContact,
  getContact,
  listContacts,
  setContactArchived,
  setContactRoles,
  updateContact,
} from './contact.js'
import { InvalidCursorError } from './keyset.js'

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
  sort: 'name',
  dir: 'asc',
  limit: 50,
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

  it('reports the total independently of the page size, and only once', async () => {
    const page = await listContacts(db(), tenantId, query({ limit: 2 }))

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(4)
    expect(page.nextCursor).not.toBeNull()

    // Counting it again on every page would pay for an answer already given.
    const second = await listContacts(
      db(),
      tenantId,
      query({ limit: 2, cursor: page.nextCursor ?? '' }),
    )
    expect(second.total).toBeUndefined()
    expect(second.items[0]?.lastName).toBe('Özdemir')
    expect(second.nextCursor).toBeNull()
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

describe('sorting and paging', () => {
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

  /** Nulls last in both directions: a contact without a city has no place on
   *  a scale of cities, and jumping to the top when the arrow is clicked would
   *  be worse than useless. */
  it('sorts by a column that may be empty, and keeps the empties last', async () => {
    await createContact(db(), tenantId, person({ lastName: 'Ohnestadt', city: null }))
    await createContact(db(), tenantId, person({ lastName: 'Aachener', city: 'Aachen' }))

    for (const dir of ['asc', 'desc'] as const) {
      const { items } = await listContacts(db(), tenantId, query({ sort: 'city', dir }))
      expect(items.at(-1)?.city).toBeNull()
    }
  })

  /**
   * The reason the id is the second sort key. Without it these two have no
   * order of their own, and the page after the first would repeat one of them
   * and drop the other — the failure that arrives with the first scroll and
   * with nothing before it.
   */
  it('pages through rows that share a sort value without losing one', async () => {
    for (let index = 0; index < 5; index += 1) {
      await createContact(db(), tenantId, person({ lastName: 'Gleich', city: null }))
    }

    const seen: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page += 1) {
      const result = await listContacts(
        db(),
        tenantId,
        query({ limit: 2, ...(cursor ? { cursor } : {}) }),
      )
      seen.push(...result.items.map((item) => item.id))
      if (!result.nextCursor) break
      cursor = result.nextCursor
    }

    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toHaveLength(7)
  })

  /** Every column the list offers can be sorted, except the two where sorting
   *  would mean inventing a rule (L4) — the mechanism is one map entry per
   *  field, and these are the shapes it has to carry: a plain text column, an
   *  enum, and a timestamp that is usually null. */
  it('sorts by the other columns the list offers', async () => {
    const archived = await createContact(db(), tenantId, person({ lastName: 'Weggeräumt' }))
    await setContactArchived(db(), tenantId, archived.id, true)
    await createContact(db(), tenantId, organization({ companyName: 'Zeta GmbH' }))

    /* Ascending puts the organizations first — sorted as text, which is what
       the German labels do too ("Organisation" before "Person"). Left as the
       enum it is, Postgres would sort by the order the values were declared
       and put the persons there instead. */
    const byKind = await listContacts(
      db(),
      tenantId,
      query({ sort: 'kind', dir: 'asc', includeArchived: true }),
    )
    expect(byKind.items[0]?.kind).toBe('organization')

    const byArchived = await listContacts(
      db(),
      tenantId,
      query({ sort: 'archived', dir: 'asc', includeArchived: true }),
    )
    // Nulls last in both directions: "never archived" has no place on a scale
    // of dates.
    expect(byArchived.items[0]?.id).toBe(archived.id)
    expect(byArchived.items.at(-1)?.archivedAt).toBeNull()
  })

  /** Free text about a patient that no column shows and every row carried.
   *  The diagnosis was never in this payload for the same reason (rule 12). */
  it('leaves the internal note out of the list', async () => {
    await createContact(db(), tenantId, person({ lastName: 'Vermerkt', internalNote: 'privat' }))

    const { items } = await listContacts(db(), tenantId, query({ q: 'Vermerkt' }))
    const row = items[0]
    if (!row) throw new Error('fixture missing')
    expect('internalNote' in row).toBe(false)

    const loaded = await getContact(db(), tenantId, row.id)
    expect(loaded?.internalNote).toBe('privat')
  })

  it('refuses a cursor it did not write', async () => {
    await expect(
      listContacts(db(), tenantId, query({ cursor: 'nonsense' })),
    ).rejects.toBeInstanceOf(InvalidCursorError)
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
