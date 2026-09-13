import { type NewUserInput, newUserSchema } from '@praxi/shared'
import { createTenant } from '../../domain/tenant.js'
import { createUser, emailTaken } from '../../domain/user.js'
import { getEnv } from '../../env.js'
import { newId } from '../../id.js'
import { applyCatalogues, type TenantRunner } from '../catalogues.js'
import type { Command } from '../command.js'
import { applyDemoPractice, applyDemoServices, demoPracticeSettings } from '../demo-seed.js'
import { CliError } from '../errors.js'
import { findPractice } from '../provision.js'

/**
 * What a fresh clone needs to be usable — **for local development only**.
 *
 * It is `praxi tenant create` with the values filled in, plus the two things
 * that command deliberately refuses to do: placeholder master data and a
 * service catalogue with invented prices. Both come out of `seeds/demo`, which
 * is not in the container image, so this cannot run on a server even with
 * `NODE_ENV` set by hand.
 *
 * The user comes from `SEED_USER_EMAIL`, `SEED_USER_NAME` and
 * `SEED_USER_PASSWORD`, so a developer signs in with credentials from their own
 * `.env`. Idempotent throughout, and it never touches the password of a user
 * that already exists.
 */

function seedUser(): NewUserInput {
  const env = getEnv()
  const result = newUserSchema.safeParse({
    email: env.SEED_USER_EMAIL ?? '',
    name: env.SEED_USER_NAME ?? '',
    password: env.SEED_USER_PASSWORD ?? '',
  })

  if (!result.success) {
    const named = result.error.issues
      .map((issue) => `SEED_USER_${String(issue.path[0]).toUpperCase()}: ${issue.message}`)
      .join('\n  ')
    throw new CliError(`The seed user is not configured. See .env.example.\n  ${named}`)
  }

  return result.data
}

export const devSeed: Command = {
  path: ['dev', 'seed'],
  scope: 'tenant',
  devOnly: true,
  summary: 'Local development: a tenant with placeholder master data and example services',
  options: {},
  notes: [
    'Reads SEED_USER_EMAIL, SEED_USER_NAME and SEED_USER_PASSWORD from .env.',
    'Every figure in the example service catalogue is invented — see',
    'seeds/demo/README.md for why they are not part of `praxi tenant create`.',
  ],

  async run({ out, tenants, asTenant }) {
    const user = seedUser()
    const { practiceName } = await demoPracticeSettings()

    const found = await findPractice(
      tenants,
      practiceName,
      'Remove one of them before seeding again.',
    )
    const tenantId = found?.id ?? newId()
    const run: TenantRunner = (work) => asTenant(tenantId, work)

    out.line()
    out.line(
      found
        ? `Practice "${practiceName}" exists — continuing.`
        : `Practice "${practiceName}" is new.`,
    )
    out.line()

    if (!found) {
      await run((tx) => createTenant(tx, tenantId, { practiceName, user }))
      out.step('structure', 'tenant, practice settings, user, 2 system relation types')
    } else if (await run((tx) => emailTaken(tx, user.email))) {
      out.step('structure', `already present — ${user.email} keeps the password it has`)
    } else {
      await run((tx) => createUser(tx, tenantId, user))
      out.step('structure', `user ${user.email} added`)
    }

    await applyCatalogues({
      tenantId,
      run,
      onStep: (step) => {
        const parts = [`${step.created} created`]
        if (step.alreadyPresent > 0) parts.push(`${step.alreadyPresent} already present`)
        out.step(step.label, parts.join(', '))
      },
    })

    await applyDemoPractice(run, tenantId)
    out.step('master data', 'placeholders written — overwrite them before going live')

    const services = await applyDemoServices(run, tenantId)
    out.step(
      'services',
      `${services.created} created` +
        (services.alreadyPresent > 0 ? `, ${services.alreadyPresent} already present` : '') +
        `, ${services.groupsCreated} group(s) — every price is invented`,
    )

    out.line()
    out.fact('tenant id', tenantId)
    out.fact('user', user.email)
    out.line()
  },
}
