import type { ActivityInput, OpeningHoursInput } from '@praxi/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createTenant } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { createContact } from './contact.js'
import { type BusyLookup, findFreeSlots } from './free-slots.js'
import { replaceOpeningHours } from './opening-hour.js'

/**
 * Where a treatment would still fit.
 *
 * Every instant here is written in Berlin wall clock and converted, because
 * that is how the practitioner reads a calendar and how the opening hours are
 * stored. 2026-09-07 is a Monday, 2026-09-12 a Saturday.
 */

let tenantId: string
let contactId: string

/** Berlin local `YYYY-MM-DDTHH:MM` as an instant. September is CEST, so the
 *  offset is +02:00 — spelled out rather than computed, so a wrong conversion
 *  in the code under test cannot be matched by a wrong conversion here. */
const BERLIN = (local: string) => new Date(`${local}:00+02:00`).toISOString()

const MONDAY = '2026-09-07'
const SATURDAY = '2026-09-12'

/** The whole of Monday, which is what most of these tests search. */
const MONDAY_WINDOW = {
  from: BERLIN(`${MONDAY}T00:00`),
  to: BERLIN('2026-09-08T00:00'),
}

/** Long before any of the windows, so nothing is filtered out as past. */
const NOW = new Date(BERLIN('2026-09-01T08:00'))

const noBusy: BusyLookup = async () => []

beforeEach(async () => {
  tenantId = await createTenant(db())
  contactId = (
    await createContact(db(), tenantId, {
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
    })
  ).id
})

function hours(...windows: OpeningHoursInput['windows']) {
  return replaceOpeningHours(db(), tenantId, { windows })
}

function booking(startLocal: string, endLocal: string, options: Partial<ActivityInput> = {}) {
  return createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'planned',
    occurredAt: BERLIN(startLocal),
    durationMin: null,
    title: null,
    internalNote: null,
    items: [],
    ...options,
    appointment: {
      startsAt: BERLIN(startLocal),
      endsAt: BERLIN(endLocal),
      status: 'planned',
      title: null,
      note: null,
      ...(options.appointment ?? {}),
    },
  })
}

/** Slots as `HH:MM` in Berlin, which is what the assertions are about. */
const at = (slots: { startsAt: string }[]) =>
  slots.map((slot) =>
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(slot.startsAt)),
  )

const search = (durationMin: number, busy: BusyLookup = noBusy) =>
  findFreeSlots(db(), tenantId, { ...MONDAY_WINDOW, durationMin }, busy, NOW)

describe('the opening hours are the ground', () => {
  /** The reason this package needed a schema change: without a pattern there
   *  is nothing to search, and assuming a working day would be inventing one. */
  it('answers with nothing and says so when none are set', async () => {
    const result = await search(60)

    expect(result).toEqual({ slots: [], privateCalendarsChecked: false, openingHoursSet: false })
  })

  it('offers only what falls inside a window', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '11:00' })

    expect(at((await search(60)).slots)).toEqual(['09:00', '10:00'])
  })

  /** Two windows on one weekday is how a lunch break is expressed, and the
   *  break has to come out as a hole rather than as bookable time. */
  it('leaves the lunch break out', async () => {
    await hours(
      { weekday: 1, startsAt: '09:00', endsAt: '12:00' },
      { weekday: 1, startsAt: '14:00', endsAt: '16:00' },
    )

    expect(at((await search(60)).slots)).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00'])
  })

  /** A weekday with no rows is closed, and that is the whole encoding — there
   *  is no flag saying so. */
  it('offers nothing on a day with no window', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '17:00' })

    const saturday = await findFreeSlots(
      db(),
      tenantId,
      {
        from: BERLIN(`${SATURDAY}T00:00`),
        to: BERLIN('2026-09-13T00:00'),
        durationMin: 60,
      },
      noBusy,
      NOW,
    )

    expect(saturday.slots).toEqual([])
    // And it is not the "no opening hours" case — the pattern exists, this day
    // just has nothing in it. The screen says two different things.
    expect(saturday.openingHoursSet).toBe(true)
  })

  it('offers nothing when the window is shorter than the treatment', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '09:45' })

    expect((await search(60)).slots).toEqual([])
  })
})

describe('what blocks a slot', () => {
  beforeEach(async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '13:00' })
  })

  it('an appointment that holds its slot', async () => {
    await booking(`${MONDAY}T10:00`, `${MONDAY}T11:00`)

    expect(at((await search(60)).slots)).toEqual(['09:00', '11:00', '12:00'])
  })

  /** A cancelled entry releases the time — the same rule the exclusion
   *  constraint enforces, so the calendar and the finder cannot disagree about
   *  what "occupied" means. */
  it('but not a cancelled one', async () => {
    await booking(`${MONDAY}T10:00`, `${MONDAY}T11:00`, {
      appointment: {
        startsAt: BERLIN(`${MONDAY}T10:00`),
        endsAt: BERLIN(`${MONDAY}T11:00`),
        status: 'cancelled',
        title: null,
        note: null,
      },
    })

    expect(at((await search(60)).slots)).toEqual(['09:00', '10:00', '11:00', '12:00'])
  })

  /** A no-show did not happen, but the time was occupied all the same
   *  (rule 6), so it is not on offer. */
  it('and a no-show does block', async () => {
    await booking(`${MONDAY}T10:00`, `${MONDAY}T11:00`, { status: 'no_show' })

    expect(at((await search(60)).slots)).toEqual(['09:00', '11:00', '12:00'])
  })

  /** The point of asking Google at all: without this the finder offers the
   *  hour the practitioner is at the dentist. */
  it('a busy interval from a private calendar', async () => {
    const busy: BusyLookup = async () => [
      { startsAt: BERLIN(`${MONDAY}T11:00`), endsAt: BERLIN(`${MONDAY}T12:00`) },
    ]

    expect(at((await search(60, busy)).slots)).toEqual(['09:00', '10:00', '12:00'])
  })

  it('an all-day blocker takes the whole day', async () => {
    const busy: BusyLookup = async () => [
      { startsAt: BERLIN(`${MONDAY}T00:00`), endsAt: BERLIN('2026-09-08T00:00') },
    ]

    expect((await search(60, busy)).slots).toEqual([])
  })

  /** The gap starts where the blocker ends, and 09:30 is already on a quarter
   *  hour, so the tiling starts there rather than at the next full hour. */
  it('an entry reaching in from the day before', async () => {
    await booking('2026-09-06T23:00', `${MONDAY}T09:30`)

    expect(at((await search(60)).slots)).toEqual(['09:30', '10:30', '11:30'])
  })
})

describe('how the gaps are cut up', () => {
  /** A slot at 09:07 is free and nobody books it. */
  it('starts suggestions on a quarter hour', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '12:00' })
    await booking(`${MONDAY}T09:00`, `${MONDAY}T09:50`)

    expect(at((await search(60)).slots)).toEqual(['10:00', '11:00'])
  })

  /** Stepping by the duration rather than by the quarter hour: the
   *  suggestions tile the gap instead of flooding it with fifteen-minute
   *  variations of the same free afternoon. */
  it('tiles a gap rather than offering every quarter of an hour', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '12:00' })

    expect(at((await search(45)).slots)).toEqual(['09:00', '09:45', '10:30', '11:15'])
  })

  it('does not offer a slot that has already begun', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '12:00' })

    const result = await findFreeSlots(
      db(),
      tenantId,
      { ...MONDAY_WINDOW, durationMin: 60 },
      noBusy,
      new Date(BERLIN(`${MONDAY}T10:30`)),
    )

    expect(at(result.slots)).toEqual(['11:00'])
  })
})

describe('when Google cannot be reached', () => {
  beforeEach(async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '11:00' })
  })

  /**
   * The search still works — it just knows less, and says so. The flag is what
   * the screen colours the suggestions by, so that somebody who does not read
   * the note beside them still sees that the answer is weaker.
   */
  it('still answers, and admits it did not check', async () => {
    const failing: BusyLookup = async () => {
      throw new Error('no line')
    }

    const result = await search(60, failing)

    expect(at(result.slots)).toEqual(['09:00', '10:00'])
    expect(result.privateCalendarsChecked).toBe(false)
    expect(result.openingHoursSet).toBe(true)
  })

  it('reports a successful check as such', async () => {
    expect((await search(60)).privateCalendarsChecked).toBe(true)
  })
})

describe('tenants', () => {
  it('sees neither the opening hours nor the appointments of another', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '17:00' })
    const otherTenant = await createTenant(db())

    const result = await findFreeSlots(
      db(),
      otherTenant,
      { ...MONDAY_WINDOW, durationMin: 60 },
      noBusy,
      NOW,
    )

    expect(result).toEqual({ slots: [], privateCalendarsChecked: false, openingHoursSet: false })
  })
})

describe('the weekly pattern itself', () => {
  it('refuses two windows that overlap on one day', async () => {
    await expect(
      hours(
        { weekday: 1, startsAt: '09:00', endsAt: '13:00' },
        { weekday: 1, startsAt: '12:00', endsAt: '16:00' },
      ),
    ).rejects.toThrow()
  })

  it('allows the same times on different days', async () => {
    const saved = await hours(
      { weekday: 1, startsAt: '09:00', endsAt: '13:00' },
      { weekday: 2, startsAt: '09:00', endsAt: '13:00' },
    )

    expect(saved).toHaveLength(2)
  })

  /** Back-to-back windows do not overlap — 12:00 is the end of one and the
   *  start of the next, the same half-open reading the calendar uses. */
  it('allows two windows that touch', async () => {
    const saved = await hours(
      { weekday: 1, startsAt: '09:00', endsAt: '12:00' },
      { weekday: 1, startsAt: '12:00', endsAt: '16:00' },
    )

    expect(saved).toHaveLength(2)
  })

  it('replaces the week rather than adding to it', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '13:00' })
    const saved = await hours({ weekday: 3, startsAt: '08:00', endsAt: '12:00' })

    expect(saved).toEqual([
      expect.objectContaining({ weekday: 3, startsAt: '08:00', endsAt: '12:00' }),
    ])
  })

  it('accepts an empty week, which is what "closed" looks like', async () => {
    await hours({ weekday: 1, startsAt: '09:00', endsAt: '13:00' })

    expect(await replaceOpeningHours(db(), tenantId, { windows: [] })).toEqual([])
  })
})
