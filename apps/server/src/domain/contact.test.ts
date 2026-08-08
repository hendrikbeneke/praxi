import type { ContactInput, ContactListQuery } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { contact, contactRole } from '../db/schema.js'
import { createTenant } from '../test/fixtures.js'
import {
  ContactKindChangeError,
  createContact,
  getContact,
  listContacts,
  setContactArchived,
  updateContact,
} from './contact.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
})

const query = (overrides: Partial<ContactListQuery> = {}): ContactListQuery => ({
  includeArchived: false,
  limit: 50,
  offset: 0,
  ...overrides,
})

function person(overrides: Partial<Extract<ContactInput, { kind: 'person' }>> = {}): ContactInput {
  return {
    kind: 'person',
    salutation: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    dateOfBirth: null,
    vatId: null,
    street: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phone: null,
    internalNote: null,
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
    vatId: null,
    street: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phone: null,
    internalNote: null,
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
          { role: 'guardian', since: '2026-01-15' },
          { role: 'billing_recipient', since: null },
        ],
      }),
    )

    expect(created.roles).toEqual([
      { role: 'billing_recipient', since: null },
      { role: 'guardian', since: '2026-01-15' },
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
    const otherTenant = await createTenant(db(), 'Mandant B')

    expect(await updateContact(db(), otherTenant, created.id, person())).toBeNull()
    expect(await getContact(db(), otherTenant, created.id)).toBeNull()
  })
})

describe('roles on update', () => {
  /**
   * The reason existing role rows are updated in place instead of being
   * deleted and reinserted: a save that does not touch a role must not move
   * the date it started.
   */
  it('leaves `since` of an unchanged role alone', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ role: 'patient', since: '2024-03-01' }] }),
    )
    const [before] = await db()
      .select()
      .from(contactRole)
      .where(eq(contactRole.contactId, created.id))

    const updated = await updateContact(
      db(),
      tenantId,
      created.id,
      person({ city: 'Musterstadt', roles: [{ role: 'patient', since: '2024-03-01' }] }),
    )

    expect(updated?.roles).toEqual([{ role: 'patient', since: '2024-03-01' }])

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
      person({ roles: [{ role: 'prospect', since: '2024-03-01' }] }),
    )

    const updated = await updateContact(
      db(),
      tenantId,
      created.id,
      person({
        roles: [
          { role: 'prospect', since: '2024-03-01' },
          { role: 'patient', since: '2026-08-08' },
        ],
      }),
    )

    expect(updated?.roles).toEqual([
      { role: 'patient', since: '2026-08-08' },
      { role: 'prospect', since: '2024-03-01' },
    ])
  })

  it('removes roles that are no longer submitted', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({
        roles: [
          { role: 'patient', since: null },
          { role: 'guardian', since: null },
        ],
      }),
    )

    const updated = await updateContact(
      db(),
      tenantId,
      created.id,
      person({ roles: [{ role: 'patient', since: null }] }),
    )

    expect(updated?.roles).toEqual([{ role: 'patient', since: null }])
  })

  it('writes a deliberately changed date', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ role: 'patient', since: '2024-03-01' }] }),
    )

    const updated = await updateContact(
      db(),
      tenantId,
      created.id,
      person({ roles: [{ role: 'patient', since: '2024-04-01' }] }),
    )

    expect(updated?.roles).toEqual([{ role: 'patient', since: '2024-04-01' }])
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
        roles: [{ role: 'patient', since: null }],
      }),
    )
    await createContact(
      db(),
      tenantId,
      person({
        firstName: 'Ödön',
        lastName: 'Özdemir',
        roles: [{ role: 'prospect', since: null }],
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
    const { items } = await listContacts(db(), tenantId, query({ role: 'patient' }))

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
    const otherTenant = await createTenant(db(), 'Mandant B')
    await createContact(db(), otherTenant, person({ lastName: 'Fremd' }))

    const { items, total } = await listContacts(db(), tenantId, query())

    expect(total).toBe(4)
    expect(items.map((item) => item.lastName)).not.toContain('Fremd')
  })
})

describe('archiving', () => {
  it('archives and restores without touching anything else', async () => {
    const created = await createContact(
      db(),
      tenantId,
      person({ roles: [{ role: 'patient', since: '2024-03-01' }] }),
    )

    const archived = await setContactArchived(db(), tenantId, created.id, true)
    expect(archived?.archivedAt).not.toBeNull()
    expect(archived?.roles).toEqual([{ role: 'patient', since: '2024-03-01' }])

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

  it('rejects a role outside the allowed set', async () => {
    const created = await createContact(db(), tenantId, person())

    await expect(
      db()
        .insert(contactRole)
        .values({
          id: '019fde08-0000-7000-8000-000000000001',
          tenantId,
          contactId: created.id,
          role: 'nonsense' as never,
          since: null,
        }),
    ).rejects.toThrow()
  })

  it('refuses a role row whose tenant differs from its contact', async () => {
    const created = await createContact(db(), tenantId, person())
    const otherTenant = await createTenant(db(), 'Mandant B')

    await expect(
      db().insert(contactRole).values({
        id: '019fde08-0000-7000-8000-000000000002',
        tenantId: otherTenant,
        contactId: created.id,
        role: 'patient',
        since: null,
      }),
    ).rejects.toThrow()
  })
})
