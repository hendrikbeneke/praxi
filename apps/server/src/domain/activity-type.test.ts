import type { ActivityTypeCreate } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { checkViolationConstraint, foreignKeyViolationConstraint } from '../db/errors.js'
import { activityType, service } from '../db/schema.js'
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
import { createService } from './service.js'

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
    defaultServiceId: null,
    defaultServiceGroupId: null,
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

  /**
   * One preset or the other, never both. The input schema refuses first; this
   * goes around it, because the guarantee has to hold for anything that
   * reaches the table.
   */
  it('cannot name a service and a group at once', async () => {
    const entry = await someService()

    let constraint: string | null = null
    try {
      await db().insert(activityType).values({
        id: newId(),
        tenantId,
        code: 'both',
        label: 'Beides',
        defaultServiceId: entry.id,
        defaultServiceGroupId: newId(),
      })
      throw new Error('expected the database to refuse, but the insert succeeded')
    } catch (error) {
      constraint = checkViolationConstraint(error)
    }
    expect(constraint).toBe('activity_type_single_preset')
  })

  /**
   * A service a type prefills cannot be deleted out from under it: `RESTRICT`
   * rather than `SET NULL`, because a bare `SET NULL` on a composite key nulls
   * `tenant_id` with it — the trap slice 4 hit on `activity.appointment_id`.
   */
  it('holds the service it points at', async () => {
    const entry = await someService()
    await createActivityType(db(), tenantId, typeInput({ defaultServiceId: entry.id }))

    let constraint: string | null = null
    try {
      await db().delete(service).where(eq(service.id, entry.id))
      throw new Error('expected the database to refuse, but the delete succeeded')
    } catch (error) {
      constraint = foreignKeyViolationConstraint(error)
    }
    expect(constraint).toBe('activity_type_service_tenant_fk')
  })
})
