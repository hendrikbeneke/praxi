/**
 * A plausible starting catalogue for an HPP practice, so the screens can be
 * used with realistic data and slice 4 has something to book.
 *
 * Idempotent, and deliberately never *updates*: an entry that is already there
 * keeps whatever price and wording it has, because by then it may have been
 * adjusted on purpose. Only what is missing gets inserted.
 *
 * `fee_code` stays empty throughout. GebüH numbers are the practitioner's to
 * enter; inventing them here would put made-up billing codes on real invoices.
 */
import { eq } from 'drizzle-orm'
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { service, serviceGroup, serviceGroupItem } from '../schema.js'

type SeedService = {
  shortCode: string | null
  description: string
  defaultPriceCents: number
  defaultDurationMin: number | null
}

/** Short codes only where they earn their keep: the entries typed every day.
 *  A talk booked twice a year is picked from a list, not typed. */
const SEED_SERVICES: readonly SeedService[] = [
  {
    shortCode: 'EG',
    description: 'Erstgespräch',
    defaultPriceCents: 13_500,
    defaultDurationMin: 90,
  },
  {
    shortCode: 'FS',
    description: 'Folgesitzung',
    defaultPriceCents: 9_000,
    defaultDurationMin: 50,
  },
  { shortCode: 'KS', description: 'Kurzsitzung', defaultPriceCents: 5_000, defaultDurationMin: 25 },
  {
    shortCode: 'TEL',
    description: 'Telefonische Beratung',
    defaultPriceCents: 3_500,
    defaultDurationMin: 20,
  },
  // No duration: nothing took place, which is the whole point of the entry.
  {
    shortCode: 'AUS',
    description: 'Ausfallhonorar',
    defaultPriceCents: 6_000,
    defaultDurationMin: null,
  },
  {
    shortCode: null,
    description: 'Prüfungsvorbereitung, Einzelstunde',
    defaultPriceCents: 15_000,
    defaultDurationMin: 120,
  },
  { shortCode: null, description: 'Vortrag', defaultPriceCents: 35_000, defaultDurationMin: 60 },
]

/** One group, with two different services and a quantity above one, so the
 *  resolution built in slice 4 has something real to resolve. */
const SEED_GROUP = {
  name: 'Prüfungsvorbereitung Kompakttag',
  items: [
    { description: 'Prüfungsvorbereitung, Einzelstunde', quantity: 4 },
    { description: 'Telefonische Beratung', quantity: 1 },
  ],
} as const

export async function seedServices(database: Database, tenantId: string): Promise<void> {
  const existing = await database
    .select({ id: service.id, description: service.description })
    .from(service)
    .where(eq(service.tenantId, tenantId))

  const idByDescription = new Map(existing.map((row) => [row.description, row.id]))

  const missing = SEED_SERVICES.filter((entry) => !idByDescription.has(entry.description))
  if (missing.length > 0) {
    const inserted = await database
      .insert(service)
      .values(missing.map((entry) => ({ id: newId(), tenantId, ...entry })))
      .returning({ id: service.id, description: service.description })

    for (const row of inserted) idByDescription.set(row.description, row.id)
  }
  console.info(`services: ${missing.length} created, ${existing.length} already present`)

  const [existingGroup] = await database
    .select({ id: serviceGroup.id })
    .from(serviceGroup)
    .where(eq(serviceGroup.name, SEED_GROUP.name))
    .limit(1)

  if (existingGroup) {
    console.info(`service group "${SEED_GROUP.name}" already exists — left unchanged`)
    return
  }

  const items = SEED_GROUP.items.map((item, index) => {
    const serviceId = idByDescription.get(item.description)
    if (!serviceId) throw new Error(`seed group references unknown service: ${item.description}`)
    return { serviceId, quantity: item.quantity, position: index }
  })

  await database.transaction(async (tx) => {
    const groupId = newId()
    await tx.insert(serviceGroup).values({ id: groupId, tenantId, name: SEED_GROUP.name })
    await tx
      .insert(serviceGroupItem)
      .values(items.map((item) => ({ id: newId(), tenantId, serviceGroupId: groupId, ...item })))
  })

  console.info(`created service group "${SEED_GROUP.name}"`)
}
