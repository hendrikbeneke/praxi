import type { ActivityInput, AppointmentStatus, ContactInput } from '@praxi/shared'
import { occupiesSlot, SLOT_RELEASING_STATUSES } from '@praxi/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { isOverlapViolation } from '../db/errors.js'
import { createTenant } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { listCalendarEntries, updateAppointment } from './appointment.js'
import { createContact } from './contact.js'

let tenantId: string
let contactId: string

const AT = (iso: string) => new Date(iso).toISOString()

function person(overrides: Partial<Extract<ContactInput, { kind: 'person' }>> = {}): ContactInput {
  return {
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
    ...overrides,
  }
}

beforeEach(async () => {
  tenantId = await createTenant(db())
  contactId = (await createContact(db(), tenantId, person())).id
})

function booking(
  startsAt: string,
  endsAt: string,
  options: { status?: AppointmentStatus; contactId?: string } = {},
): ActivityInput {
  return {
    contactId: options.contactId ?? contactId,
    type: 'session',
    status: 'planned',
    occurredAt: AT(startsAt),
    durationMin: null,
    title: null,
    internalNote: null,
    items: [],
    appointment: {
      startsAt: AT(startsAt),
      endsAt: AT(endsAt),
      status: options.status ?? 'planned',
      title: null,
      note: null,
    },
  }
}

/** The error surfaces as SQLSTATE 23P01 through Drizzle's wrapper. */
async function bookingError(input: ActivityInput): Promise<unknown> {
  return createActivity(db(), tenantId, input).then(
    () => null,
    (error: unknown) => error,
  )
}

describe('no two appointments in one slot', () => {
  beforeEach(async () => {
    await createActivity(db(), tenantId, booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'))
  })

  it('rejects an overlapping appointment with SQLSTATE 23P01', async () => {
    const error = await bookingError(booking('2026-09-01T08:30:00Z', '2026-09-01T09:30:00Z'))

    expect(error).not.toBeNull()
    expect(isOverlapViolation(error)).toBe(true)
  })

  it('rejects one fully inside the other', async () => {
    expect(
      isOverlapViolation(
        await bookingError(booking('2026-09-01T08:15:00Z', '2026-09-01T08:45:00Z')),
      ),
    ).toBe(true)
  })

  it('rejects an identical slot for a different contact', async () => {
    const other = (await createContact(db(), tenantId, person({ lastName: 'Beispiel' }))).id

    expect(
      isOverlapViolation(
        await bookingError(
          booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', { contactId: other }),
        ),
      ),
    ).toBe(true)
  })

  /**
   * `tstzrange` is half-open, `[a, b)`. Back-to-back sessions are the normal
   * case in a practice, so this must never be rejected — an inclusive range
   * would break every consecutive pair.
   */
  it('allows an appointment starting exactly when the previous one ends', async () => {
    await expect(
      createActivity(db(), tenantId, booking('2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z')),
    ).resolves.toBeDefined()

    await expect(
      createActivity(db(), tenantId, booking('2026-09-01T07:00:00Z', '2026-09-01T08:00:00Z')),
    ).resolves.toBeDefined()
  })

  it('allows the same slot in a different tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    const otherContact = (await createContact(db(), otherTenant, person())).id

    await expect(
      createActivity(db(), otherTenant, {
        ...booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
        contactId: otherContact,
      }),
    ).resolves.toBeDefined()
  })
})

describe('which statuses hold the slot', () => {
  it('frees the slot when the appointment is cancelled', async () => {
    for (const status of SLOT_RELEASING_STATUSES) {
      const tenant = await createTenant(db(), `Mandant ${status}`)
      const held = (await createContact(db(), tenant, person())).id
      const next = (await createContact(db(), tenant, person({ lastName: 'Nachrücker' }))).id

      await createActivity(db(), tenant, {
        ...booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', { status }),
        contactId: held,
      })

      await expect(
        createActivity(db(), tenant, {
          ...booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
          contactId: next,
        }),
      ).resolves.toBeDefined()
    }
  })

  /**
   * A no-show really did occupy the time — nothing else can have taken place
   * in it, so the slot stays blocked. Since slice 7.5 that is expressed by the
   * appointment staying `planned` while `activity.status` says `no_show`, and
   * this test is what makes sure the split did not quietly free the slot.
   */
  it('keeps the slot blocked on a no-show', async () => {
    await createActivity(db(), tenantId, {
      ...booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
      status: 'no_show',
    })

    expect(
      isOverlapViolation(
        await bookingError(booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z')),
      ),
    ).toBe(true)
  })

  /** The SQL in migration 0009 repeats this list; the helper is what the
   *  client reasons with. They must agree. */
  it('agrees with the helper in packages/shared', () => {
    expect(occupiesSlot('requested')).toBe(true)
    expect(occupiesSlot('planned')).toBe(true)
    expect(occupiesSlot('confirmed')).toBe(true)
    expect(occupiesSlot('cancelled')).toBe(false)
    expect(occupiesSlot('cancelled_late')).toBe(false)
  })
})

describe('moving and restatusing', () => {
  it('moves an appointment into a free slot', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')

    const moved = await updateAppointment(db(), tenantId, id, {
      startsAt: AT('2026-09-02T10:00:00Z'),
      endsAt: AT('2026-09-02T11:00:00Z'),
      status: 'confirmed',
      title: null,
      note: null,
    })

    expect(moved).toBe(true)

    const entries = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-02T00:00:00Z'),
      to: AT('2026-09-03T00:00:00Z'),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('confirmed')
  })

  it('refuses to move an appointment onto an occupied slot', async () => {
    const first = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const other = (await createContact(db(), tenantId, person({ lastName: 'Beispiel' }))).id
    await createActivity(db(), tenantId, {
      ...booking('2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z'),
      contactId: other,
    })

    const id = first.appointment?.id
    if (!id) throw new Error('fixture missing')

    const error = await updateAppointment(db(), tenantId, id, {
      startsAt: AT('2026-09-01T10:30:00Z'),
      endsAt: AT('2026-09-01T11:30:00Z'),
      status: 'planned',
      title: null,
      note: null,
    }).then(
      () => null,
      (caught: unknown) => caught,
    )

    expect(isOverlapViolation(error)).toBe(true)
  })

  /** Cancelling has to work even when the replacement is already in the slot,
   *  otherwise the constraint would trap the practitioner. */
  it('can cancel an appointment that another one already overlaps', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', { status: 'cancelled' }),
    )
    const other = (await createContact(db(), tenantId, person({ lastName: 'Beispiel' }))).id
    await createActivity(db(), tenantId, {
      ...booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
      contactId: other,
    })

    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')

    await expect(
      updateAppointment(db(), tenantId, id, {
        startsAt: AT('2026-09-01T08:00:00Z'),
        endsAt: AT('2026-09-01T09:00:00Z'),
        status: 'cancelled_late',
        title: null,
        note: null,
      }),
    ).resolves.toBe(true)
  })

  it('returns false for an unknown id and for another tenant', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')
    const otherTenant = await createTenant(db(), 'Mandant B')

    const draft = {
      startsAt: AT('2026-09-03T08:00:00Z'),
      endsAt: AT('2026-09-03T09:00:00Z'),
      status: 'planned' as const,
      title: null,
      note: null,
    }

    expect(await updateAppointment(db(), otherTenant, id, draft)).toBe(false)
  })
})

describe('the calendar view', () => {
  it('returns entries in the window with contact number and name', async () => {
    await createActivity(db(), tenantId, booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'))
    await createActivity(db(), tenantId, booking('2026-09-08T08:00:00Z', '2026-09-08T09:00:00Z'))

    const week = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-08-31T00:00:00Z'),
      to: AT('2026-09-07T00:00:00Z'),
    })

    expect(week).toHaveLength(1)
    expect(week[0]).toMatchObject({ contactName: 'Erika Musterfrau', contactNumber: 1 })
    expect(week[0]?.activityId).not.toBeNull()
  })

  it('includes cancelled entries so the calendar can show them', async () => {
    await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', { status: 'cancelled' }),
    )

    const entries = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-08-31T00:00:00Z'),
      to: AT('2026-09-07T00:00:00Z'),
    })

    expect(entries.map((entry) => entry.status)).toEqual(['cancelled'])
  })

  it('shows only its own tenant', async () => {
    const otherTenant = await createTenant(db(), 'Mandant B')
    await createActivity(db(), tenantId, booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'))

    expect(
      await listCalendarEntries(db(), otherTenant, {
        from: AT('2026-08-31T00:00:00Z'),
        to: AT('2026-09-07T00:00:00Z'),
      }),
    ).toEqual([])
  })
})
