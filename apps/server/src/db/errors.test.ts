import { describe, expect, it } from 'vitest'
import { newId } from '../id.js'
import { createTenant } from '../test/fixtures.js'
import { db } from './client.js'
import { uniqueViolationConstraint } from './errors.js'
import { service } from './schema.js'

/**
 * Against a real Drizzle error, not a hand-built object.
 *
 * The first version of `uniqueViolationConstraint` read `code` off the thrown
 * error directly and therefore never matched: Drizzle wraps driver errors in a
 * `DrizzleQueryError`, and the SQLSTATE sits on `cause`. Nothing failed
 * loudly — duplicate short codes just came back as a generic 500. Only a test
 * that produces the genuine error shape catches that.
 */
describe('uniqueViolationConstraint', () => {
  it('finds the constraint name through the Drizzle wrapper', async () => {
    const tenantId = await createTenant(db())
    const row = {
      tenantId,
      shortCode: 'FS',
      description: 'Folgesitzung',
      defaultPriceCents: 9000,
    }

    await db()
      .insert(service)
      .values({ id: newId(), ...row })

    const error = await db()
      .insert(service)
      .values({ id: newId(), ...row, description: 'Andere' })
      .then(
        () => null,
        (caught: unknown) => caught,
      )

    expect(error).not.toBeNull()
    expect(uniqueViolationConstraint(error)).toBe('service_tenant_short_code_key')
  })

  it('returns null for anything that is not a unique violation', async () => {
    const tenantId = await createTenant(db())

    const error = await db()
      .insert(service)
      .values({
        id: newId(),
        tenantId,
        description: 'Negativ',
        defaultPriceCents: -1, // violates a check constraint, not a unique one
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      )

    expect(error).not.toBeNull()
    expect(uniqueViolationConstraint(error)).toBeNull()
    expect(uniqueViolationConstraint(new Error('plain'))).toBeNull()
    expect(uniqueViolationConstraint(undefined)).toBeNull()
  })
})
