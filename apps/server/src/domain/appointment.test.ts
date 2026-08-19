import type { ActivityInput, AppointmentStatus, ContactInput } from '@praxi/shared'
import { occupiesSlot, SLOT_RELEASING_STATUSES } from '@praxi/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createTenant } from '../test/fixtures.js'
import { createActivity, getActivity } from './activity.js'
import {
  AppointmentHasActivityError,
  createAppointment,
  deleteAppointment,
  listCalendarEntries,
  updateAppointment,
} from './appointment.js'
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
    diagnosis: null,
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

/**
 * **Overlaps are allowed** (migration 0034), and this block is what says so.
 *
 * It is the inversion of what stood here before: `appointment_no_overlap`
 * refused a second appointment in an occupied slot, and six tests asserted the
 * refusal. The constraint is gone because a double booking is a decision, and
 * a database that refuses it cannot be overruled at the moment it matters —
 * an emergency at 14:00 on a full day ended in a dead end.
 *
 * What still refuses to *propose* one is `findFreeSlots`, and that is tested
 * where it lives: `free-slots.test.ts` covers the held slot, the cancelled one
 * and the no-show. The two files together are the whole rule — nothing here
 * blocks, nothing there suggests a taken time.
 */
describe('two appointments may share a slot', () => {
  beforeEach(async () => {
    await createActivity(db(), tenantId, booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'))
  })

  it('accepts an overlapping appointment', async () => {
    await expect(
      createActivity(db(), tenantId, booking('2026-09-01T08:30:00Z', '2026-09-01T09:30:00Z')),
    ).resolves.toBeDefined()

    const day = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-01T00:00:00Z'),
      to: AT('2026-09-02T00:00:00Z'),
    })
    expect(day).toHaveLength(2)
  })

  it('accepts an identical slot for a different contact', async () => {
    const other = (await createContact(db(), tenantId, person({ lastName: 'Beispiel' }))).id

    await expect(
      createActivity(
        db(),
        tenantId,
        booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z', { contactId: other }),
      ),
    ).resolves.toBeDefined()
  })

  it('still accepts back-to-back appointments', async () => {
    await expect(
      createActivity(db(), tenantId, booking('2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z')),
    ).resolves.toBeDefined()
  })
})

describe('what the statuses mean now', () => {
  /**
   * Nothing in the database reads them any more. The helper is what the
   * calendar and the slot finder reason with — cancellation counts, the hours
   * a day holds, the strike-through, and which times may be suggested.
   */
  it('agrees with the helper in packages/shared', () => {
    expect(occupiesSlot('requested')).toBe(true)
    expect(occupiesSlot('planned')).toBe(true)
    expect(occupiesSlot('confirmed')).toBe(true)
    expect(occupiesSlot('cancelled')).toBe(false)
    expect(occupiesSlot('cancelled_late')).toBe(false)
    expect([...SLOT_RELEASING_STATUSES]).toEqual(['cancelled', 'cancelled_late'])
  })
})

describe('dragging an entry to another time', () => {
  it('moves it into a free slot', async () => {
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
    })

    expect(moved?.startsAt).toBe(AT('2026-09-02T10:00:00Z'))

    const entries = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-02T00:00:00Z'),
      to: AT('2026-09-03T00:00:00Z'),
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.startsAt).toBe(AT('2026-09-02T10:00:00Z'))
  })

  /**
   * **The test this operation exists for.**
   *
   * `activity.occurred_at` is the record of when it happened; the appointment
   * is the slot it happened in. Every other writer keeps the two in step
   * because the editor writes them from one value — a drag that touched only
   * the appointment row would be the first thing to pull them apart, and
   * silently: the calendar would say one time and the Vorgänge list another.
   *
   * So if somebody later "simplifies" this back into a plain update of the
   * appointment, this is the test that falls over. Do not relax it.
   */
  it('carries the activity along, times and duration', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')

    await updateAppointment(db(), tenantId, id, {
      startsAt: AT('2026-09-02T14:30:00Z'),
      endsAt: AT('2026-09-02T15:15:00Z'),
    })

    const reloaded = await getActivity(db(), tenantId, created.id)
    expect(reloaded?.occurredAt).toBe(AT('2026-09-02T14:30:00Z'))
    expect(reloaded?.durationMin).toBe(45)
    expect(reloaded?.appointment?.startsAt).toBe(AT('2026-09-02T14:30:00Z'))
  })

  /** The other side of migration 0034, from the drag: what used to be refused
   *  now lands, and both entries sit in the same hour. */
  it('may be dropped onto an occupied slot', async () => {
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

    const moved = await updateAppointment(db(), tenantId, id, {
      startsAt: AT('2026-09-01T10:30:00Z'),
      endsAt: AT('2026-09-01T11:30:00Z'),
    })

    expect(moved?.startsAt).toBe(AT('2026-09-01T10:30:00Z'))
    const reloaded = await getActivity(db(), tenantId, first.id)
    expect(reloaded?.occurredAt).toBe(AT('2026-09-01T10:30:00Z'))
  })

  it('returns null for an unknown id and for another tenant', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')
    const otherTenant = await createTenant(db())

    const move = { startsAt: AT('2026-09-03T08:00:00Z'), endsAt: AT('2026-09-03T09:00:00Z') }
    expect(await updateAppointment(db(), otherTenant, id, move)).toBeNull()
  })
})

/**
 * The appointment that belongs to no activity — a blocker, documentation time,
 * a team meeting (D-K1). Until migration 0034 there was no way to enter one.
 */
describe('an appointment of its own', () => {
  it('is created without a contact and appears in the calendar', async () => {
    const created = await createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Teambesprechung',
      note: null,
    })

    expect(created.contactId).toBeNull()

    const day = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-01T00:00:00Z'),
      to: AT('2026-09-02T00:00:00Z'),
    })
    expect(day).toHaveLength(1)
    expect(day[0]).toMatchObject({
      title: 'Teambesprechung',
      contactId: null,
      contactName: null,
      contactNumber: null,
      activityId: null,
    })
  })

  /**
   * The join that carries the contact must be a left one. An inner join would
   * drop every blocker from the calendar without a word — and a time that is
   * taken would look free, which is the worst way for this to be wrong.
   */
  it('does not fall out of the calendar next to entries that have one', async () => {
    await createActivity(db(), tenantId, booking('2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z'))
    await createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Doku & Telefonzeit',
      note: null,
    })

    const day = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-01T00:00:00Z'),
      to: AT('2026-09-02T00:00:00Z'),
    })
    expect(day.map((entry) => entry.title)).toEqual(['Doku & Telefonzeit', null])
  })

  it('may carry a contact without carrying an activity', async () => {
    const created = await createAppointment(db(), tenantId, {
      contactId,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Rückruf',
      note: null,
    })

    expect(created.contactId).toBe(contactId)

    const [entry] = await listCalendarEntries(db(), tenantId, {
      from: AT('2026-09-01T00:00:00Z'),
      to: AT('2026-09-02T00:00:00Z'),
    })
    expect(entry).toMatchObject({ contactName: 'Erika Musterfrau', activityId: null })
  })
})

describe('editing an appointment', () => {
  async function blocker() {
    return createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Teambesprechung',
      note: null,
    })
  }

  /** What "Absagen" sends: the status and nothing else. */
  it('cancels without touching the times or the title', async () => {
    const created = await blocker()

    const updated = await updateAppointment(db(), tenantId, created.id, { status: 'cancelled' })

    expect(updated).toMatchObject({
      status: 'cancelled',
      title: 'Teambesprechung',
      startsAt: AT('2026-09-01T08:00:00Z'),
    })
  })

  /**
   * An absent key means "leave alone". `optionalTextPatch` exists for exactly
   * this: with `optionalText`'s default the note would be nulled out by every
   * patch that does not mention it.
   */
  it('leaves out what the patch does not mention, and clears what it sets to null', async () => {
    const created = await createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Teambesprechung',
      note: 'wöchentlich',
    })

    const renamed = await updateAppointment(db(), tenantId, created.id, { title: 'Supervision' })
    expect(renamed).toMatchObject({ title: 'Supervision', note: 'wöchentlich' })

    const cleared = await updateAppointment(db(), tenantId, created.id, { note: null })
    expect(cleared).toMatchObject({ title: 'Supervision', note: null })
  })

  it('adds and removes the contact', async () => {
    const created = await blocker()

    expect((await updateAppointment(db(), tenantId, created.id, { contactId }))?.contactId).toBe(
      contactId,
    )
    expect(
      (await updateAppointment(db(), tenantId, created.id, { contactId: null }))?.contactId,
    ).toBeNull()
  })
})

describe('deleting an appointment', () => {
  it('removes one that carries no activity', async () => {
    const created = await createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: 'Teambesprechung',
      note: null,
    })

    expect(await deleteAppointment(db(), tenantId, created.id)).toBe(true)
    expect(
      await listCalendarEntries(db(), tenantId, {
        from: AT('2026-09-01T00:00:00Z'),
        to: AT('2026-09-02T00:00:00Z'),
      }),
    ).toHaveLength(0)
  })

  /**
   * Cancelling is the right gesture where a Vorgang hangs on the appointment:
   * what happened, or did not, stays documented. Deleting the slot and keeping
   * the Vorgang is a third thing nobody has defined — a line in WORKPLAN.md,
   * not a branch in the domain.
   */
  it('refuses one that carries an activity', async () => {
    const created = await createActivity(
      db(),
      tenantId,
      booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'),
    )
    const id = created.appointment?.id
    if (!id) throw new Error('fixture missing')

    await expect(deleteAppointment(db(), tenantId, id)).rejects.toBeInstanceOf(
      AppointmentHasActivityError,
    )
    expect(await getActivity(db(), tenantId, created.id)).not.toBeNull()
  })

  it('returns false for another tenant', async () => {
    const created = await createAppointment(db(), tenantId, {
      contactId: null,
      startsAt: AT('2026-09-01T08:00:00Z'),
      endsAt: AT('2026-09-01T08:30:00Z'),
      status: 'planned',
      title: null,
      note: null,
    })
    const otherTenant = await createTenant(db())

    expect(await deleteAppointment(db(), otherTenant, created.id)).toBe(false)
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
    const otherTenant = await createTenant(db())
    await createActivity(db(), tenantId, booking('2026-09-01T08:00:00Z', '2026-09-01T09:00:00Z'))

    expect(
      await listCalendarEntries(db(), otherTenant, {
        from: AT('2026-08-31T00:00:00Z'),
        to: AT('2026-09-07T00:00:00Z'),
      }),
    ).toEqual([])
  })
})
