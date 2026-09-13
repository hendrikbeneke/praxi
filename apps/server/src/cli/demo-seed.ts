import { practiceSettingsInputSchema, serviceInputSchema } from '@praxi/shared'
import { z } from 'zod'
import { updatePracticeSettings } from '../domain/practice-settings.js'
import {
  createService,
  createServiceGroup,
  listServiceGroups,
  listServices,
} from '../domain/service.js'
import type { TenantRunner } from './catalogues.js'
import { CliError } from './errors.js'
import { readSeedFile } from './seed-files.js'

/**
 * The invented parts, shared by `praxi dev seed` and `praxi dev demo` — the
 * placeholder master data and the example service catalogue.
 *
 * Both read from `seeds/demo`, which is not in the container image, so this
 * whole file is unreachable on a server whatever `NODE_ENV` says. See
 * `seeds/demo/README.md`.
 */

const demoServicesSchema = z.object({
  services: z.array(serviceInputSchema),
  groups: z.array(
    z.object({
      name: z.string(),
      /** A group item names its service by `description`, which is what a
       *  service is recognised by in these files. */
      items: z.array(z.object({ description: z.string(), quantity: z.number().int().positive() })),
    }),
  ),
})

type DemoPracticeSettings = z.infer<typeof practiceSettingsInputSchema>

export async function demoPracticeSettings(): Promise<DemoPracticeSettings> {
  return readSeedFile('demo', 'practice.json', practiceSettingsInputSchema)
}

/** The placeholder address, IBAN and tax number — everything `tenant create`
 *  deliberately leaves empty. */
export async function applyDemoPractice(run: TenantRunner, tenantId: string): Promise<void> {
  const settings = await demoPracticeSettings()
  await run(async (tx) => {
    await updatePracticeSettings(tx, tenantId, settings)
  })
}

export type DemoServiceReport = { created: number; alreadyPresent: number; groupsCreated: number }

/**
 * Resumable the same way the catalogues are: services compared by description,
 * groups by name, and only what is missing is created — through
 * `createService` and `createServiceGroup`, not by writing rows.
 */
export async function applyDemoServices(
  run: TenantRunner,
  tenantId: string,
): Promise<DemoServiceReport> {
  const file = await readSeedFile('demo', 'services.json', demoServicesSchema)

  return run(async (tx) => {
    const existing = await listServices(tx, tenantId, { includeInactive: true })
    const idByDescription = new Map(existing.map((row) => [row.description, row.id]))

    const missing = file.services.filter((entry) => !idByDescription.has(entry.description))
    for (const entry of missing) {
      const created = await createService(tx, tenantId, entry)
      idByDescription.set(created.description, created.id)
    }

    const groups = await listServiceGroups(tx, tenantId, { includeInactive: true })
    const present = new Set(groups.map((group) => group.name))

    let groupsCreated = 0
    for (const group of file.groups) {
      if (present.has(group.name)) continue

      const items = group.items.map((item) => {
        const serviceId = idByDescription.get(item.description)
        if (!serviceId) {
          throw new CliError(
            `The service group "${group.name}" names a service that is not in services.json: "${item.description}"`,
          )
        }
        return { serviceId, quantity: item.quantity }
      })

      await createServiceGroup(tx, tenantId, {
        name: group.name,
        sortOrder: 0,
        active: true,
        items,
      })
      groupsCreated += 1
    }

    return {
      created: missing.length,
      alreadyPresent: file.services.length - missing.length,
      groupsCreated,
    }
  })
}
