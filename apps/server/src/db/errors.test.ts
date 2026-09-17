import { contactInputSchema, noteInputSchema } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createContact } from '../domain/contact.js'
import { createNote } from '../domain/note.js'
import { newId } from '../id.js'
import { createTenant, createUser, noteTypeId } from '../test/fixtures.js'
import { db } from './client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from './errors.js'
import { noteType, service } from './schema.js'

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

/**
 * Both directions of the same fact — a row pointing at something that is not
 * there, and a row that cannot go because something still points at it.
 *
 * The second is why this exists. **Postgres 18 reports a refused RESTRICT as
 * SQLSTATE 23001**, where 17 said 23503, and the eight route files that turn a
 * constraint name into a German sentence would simply have stopped matching:
 * no crash, a generic error in place of a readable one, and only on a server
 * running 18. Asserting the constraint name against the real error is the only
 * shape of this test that would have caught it.
 */
describe('foreignKeyViolationConstraint', () => {
  it('names the constraint when a delete is refused by RESTRICT', async () => {
    const tenantId = await createTenant(db())
    const typeId = await noteTypeId(db(), tenantId, 'Sitzung')
    const user = await createUser(db(), { tenantId })

    const contact = await createContact(
      db(),
      tenantId,
      contactInputSchema.parse({ kind: 'person', lastName: 'Testperson' }),
    )
    await createNote(
      db(),
      tenantId,
      user.id,
      noteInputSchema.parse({
        contactId: contact.id,
        noteDate: '2026-01-05',
        noteTypeId: typeId,
        text: 'Eine Notiz, damit die Art in Gebrauch ist.',
      }),
    )

    const error = await db()
      .delete(noteType)
      .where(eq(noteType.id, typeId))
      .then(
        () => null,
        (caught: unknown) => caught,
      )

    expect(error).not.toBeNull()
    expect(foreignKeyViolationConstraint(error)).toBe('note_type_fk')
  })

  it('returns null for anything that is not a reference violation', async () => {
    expect(foreignKeyViolationConstraint(new Error('plain'))).toBeNull()
    expect(foreignKeyViolationConstraint(undefined)).toBeNull()
  })
})
