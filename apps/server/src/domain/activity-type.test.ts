import type { ActivityTypeCreate } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint } from '../db/errors.js'
import { activityTypePresetItem, service } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { createActivity, getActivity } from './activity.js'
import {
  createActivityType,
  deleteActivityType,
  listActivityTypes,
  updateActivityType,
} from './activity-type.js'
import { createContact } from './contact.js'
import { createService, UnknownServiceError } from './service.js'

let tenantId: string
let contactId: string

beforeEach(async () => {
  // The four seeded types come with the tenant, as they do in the application.
  tenantId = await createTenant(db())
  const created = await createContact(db(), tenantId, {
    kind: 'person',
    salutation: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Musterfrau',
    dateOfBirth: null,
    birthPlace: null,
    gender: null,
    vatId: null,
    street: null,
    houseNumber: null,
    postalCode: null,
    city: null,
    country: 'DE',
    email: null,
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles: [],
  })
  contactId = created.id
})

function typeInput(overrides: Partial<ActivityTypeCreate> = {}): ActivityTypeCreate {
  return {
    code: 'supervision',
    label: 'Supervision',
    color: '#334155',
    defaultDurationMin: null,
    presetItems: [],
    isDefault: false,
    sortOrder: 50,
    active: true,
    ...overrides,
  }
}

const codes = (types: { code: string }[]) => types.map((type) => type.code)

const someService = () =>
  createService(db(), tenantId, {
    shortCode: null,
    description: 'Folgesitzung',
    feeCode: null,
    defaultPriceCents: 9000,
    defaultDurationMin: 50,
    sortOrder: 0,
    active: true,
  })

describe('the catalogue', () => {
  it('lists in sort order and hides inactive entries unless asked', async () => {
    await createActivityType(db(), tenantId, typeInput({ active: false }))

    expect(codes(await listActivityTypes(db(), tenantId, false))).toEqual([
      'initial',
      'session',
      'talk',
      'consultation',
    ])
    expect(codes(await listActivityTypes(db(), tenantId, true))).toContain('supervision')
  })

  it('keeps the tenants apart', async () => {
    const other = await createTenant(db(), 'Mandant B')
    await createActivityType(db(), other, typeInput())

    expect(codes(await listActivityTypes(db(), tenantId, true))).not.toContain('supervision')
  })
})

describe('the default type', () => {
  /** `activity_type_default_key` allows one per tenant, so setting a new
   *  default has to clear the old one rather than collide with it. */
  it('moves rather than collides', async () => {
    const created = await createActivityType(db(), tenantId, typeInput({ isDefault: true }))

    const all = await listActivityTypes(db(), tenantId, true)
    expect(all.filter((type) => type.isDefault).map((type) => type.code)).toEqual(['supervision'])

    // …and back again, through an update.
    const session = all.find((type) => type.code === 'session')
    if (!session) throw new Error('fixture missing')
    await updateActivityType(db(), tenantId, session.id, { ...session, isDefault: true })

    const after = await listActivityTypes(db(), tenantId, true)
    expect(after.filter((type) => type.isDefault).map((type) => type.code)).toEqual(['session'])
    expect(after.find((type) => type.id === created.id)?.isDefault).toBe(false)
  })
})

describe('deleting', () => {
  it('removes a type nobody uses', async () => {
    const created = await createActivityType(db(), tenantId, typeInput())
    expect(await deleteActivityType(db(), tenantId, created.id)).toBe(true)
    expect(codes(await listActivityTypes(db(), tenantId, true))).not.toContain('supervision')
  })

  /**
   * A type that has been used is history: deleting it would leave activities
   * pointing at nothing, so `activity_type_fk` refuses and the route turns that
   * into "set it to inactive instead".
   */
  it('refuses a type that is in use, and deactivating is the way out', async () => {
    const created = await createActivityType(db(), tenantId, typeInput())
    await createActivity(db(), tenantId, {
      contactId,
      type: created.code,
      status: 'planned',
      occurredAt: '2026-09-01T08:00:00.000Z',
      durationMin: null,
      title: null,
      internalNote: null,
      items: [],
      appointment: null,
    })

    let constraint: string | null = null
    try {
      await deleteActivityType(db(), tenantId, created.id)
      throw new Error('expected the database to refuse, but the delete succeeded')
    } catch (error) {
      constraint = foreignKeyViolationConstraint(error)
    }
    expect(constraint).toBe('activity_type_fk')

    const deactivated = await updateActivityType(db(), tenantId, created.id, {
      ...created,
      active: false,
    })
    expect(deactivated?.active).toBe(false)
  })
})

describe('the presets', () => {
  /**
   * Rule 5, one level up from the service catalogue: the defaults of a type
   * prefill a *new* activity and are read once. Changing them afterwards
   * reaches nothing that already exists — the same guarantee the service
   * catalogue gives, and the reason there is no re-apply function anywhere.
   */
  it('never reach an activity that already exists', async () => {
    const created = await createActivityType(db(), tenantId, typeInput({ defaultDurationMin: 50 }))

    const activity = await createActivity(db(), tenantId, {
      contactId,
      type: created.code,
      status: 'planned',
      occurredAt: '2026-09-01T08:00:00.000Z',
      durationMin: 50,
      title: null,
      internalNote: null,
      items: [],
      appointment: null,
    })

    await updateActivityType(db(), tenantId, created.id, {
      ...created,
      defaultDurationMin: 90,
    })

    expect((await getActivity(db(), tenantId, activity.id))?.durationMin).toBe(50)
  })

  /** References only — `service_id`, `quantity`, `position` — never a copy of
   *  price or description, and never a group id (CLAUDE.md rule 5). */
  it('keeps the order the preset items were given in', async () => {
    const first = await someService()
    const second = await createService(db(), tenantId, {
      shortCode: null,
      description: 'Erstgespräch',
      feeCode: null,
      defaultPriceCents: 13500,
      defaultDurationMin: 80,
      sortOrder: 0,
      active: true,
    })

    const created = await createActivityType(
      db(),
      tenantId,
      typeInput({
        presetItems: [
          { serviceId: second.id, quantity: 1 },
          { serviceId: first.id, quantity: 2 },
        ],
      }),
    )

    expect(created.presetItems.map((item) => item.serviceId)).toEqual([second.id, first.id])
    expect(created.presetItems.map((item) => item.quantity)).toEqual([1, 2])
    expect(created.presetItems.map((item) => item.description)).toEqual([
      'Erstgespräch',
      'Folgesitzung',
    ])
  })

  it('refuses the same service twice in one preset', async () => {
    const entry = await someService()

    await expect(
      createActivityType(
        db(),
        tenantId,
        typeInput({
          presetItems: [
            { serviceId: entry.id, quantity: 1 },
            { serviceId: entry.id, quantity: 2 },
          ],
        }),
      ),
    ).rejects.toThrow()
  })

  it('refuses a service id that does not exist', async () => {
    await expect(
      createActivityType(
        db(),
        tenantId,
        typeInput({ presetItems: [{ serviceId: newId(), quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  it('refuses a service from another tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    const foreign = await createService(db(), otherTenant, {
      shortCode: null,
      description: 'Folgesitzung',
      feeCode: null,
      defaultPriceCents: 9000,
      defaultDurationMin: 50,
      sortOrder: 0,
      active: true,
    })

    await expect(
      createActivityType(
        db(),
        tenantId,
        typeInput({ presetItems: [{ serviceId: foreign.id, quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(UnknownServiceError)
  })

  /**
   * A service a type prefills cannot be deleted out from under it: `RESTRICT`
   * rather than `SET NULL`, because a bare `SET NULL` on a composite key nulls
   * `tenant_id` with it — the trap slice 4 hit on `activity.appointment_id`.
   * Mirrors the equivalent guarantee for `service_group_item`.
   */
  it('holds the services it points at', async () => {
    const entry = await someService()
    await createActivityType(
      db(),
      tenantId,
      typeInput({ presetItems: [{ serviceId: entry.id, quantity: 1 }] }),
    )

    let constraint: string | null = null
    try {
      await db().delete(service).where(eq(service.id, entry.id))
      throw new Error('expected the database to refuse, but the delete succeeded')
    } catch (error) {
      constraint = foreignKeyViolationConstraint(error)
    }
    expect(constraint).toBe('activity_type_preset_item_service_tenant_fk')
  })

  /** Replacing the items is delete-and-insert, like `service_group_item` — a
   *  type that had a preset and is edited to have none must end up with none. */
  it('replaces the preset items wholesale on update', async () => {
    const entry = await someService()
    const created = await createActivityType(
      db(),
      tenantId,
      typeInput({ presetItems: [{ serviceId: entry.id, quantity: 1 }] }),
    )

    const updated = await updateActivityType(db(), tenantId, created.id, {
      ...created,
      presetItems: [],
    })

    expect(updated?.presetItems).toEqual([])
    expect(
      await db()
        .select()
        .from(activityTypePresetItem)
        .where(eq(activityTypePresetItem.activityTypeId, created.id)),
    ).toEqual([])
  })
})
