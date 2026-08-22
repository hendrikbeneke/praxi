import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint } from '../db/errors.js'
import { contact, note, noteType } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser, noteTypeId, type TestUser } from '../test/fixtures.js'
import { createNote } from './note.js'
import { lockNote } from './note-lock.js'
import {
  createNoteType,
  deleteNoteType,
  listNoteTypes,
  moveNoteType,
  NoteTypeInUseError,
  updateNoteType,
} from './note-type.js'

let tenantId: string
let user: TestUser
let contactId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
  user = await createUser(db(), { tenantId })
  contactId = newId()
  await db()
    .insert(contact)
    .values({
      id: contactId,
      tenantId,
      contactNumber: Math.floor(Math.random() * 1_000_000) + 1,
      kind: 'person',
      lastName: 'Testperson',
    })
})

async function writeNote(typeId: string) {
  return createNote(db(), tenantId, user.id, {
    contactId,
    activityId: null,
    noteDate: '2026-08-09',
    noteTypeId: typeId,
    text: 'Erstgespräch geführt.',
    correctsNoteId: null,
  })
}

describe('the catalogue', () => {
  it('starts with the seeded entries, in order', async () => {
    const rows = await listNoteTypes(db(), tenantId)
    expect(rows.map((row) => row.label)).toEqual([
      'Sitzung',
      'Allgemein',
      'Dokument',
      'Korrespondenz',
      'Sonstiges',
    ])
    expect(rows.every((row) => row.showAsTab)).toBe(true)
  })

  it('creates, renames and reorders', async () => {
    const created = await createNoteType(db(), tenantId, {
      label: 'Telefonat',
      showAsTab: false,
      sortOrder: 60,
    })

    const renamed = await updateNoteType(db(), tenantId, created.id, {
      label: 'Telefonnotiz',
      showAsTab: true,
      sortOrder: 60,
    })
    expect(renamed?.label).toBe('Telefonnotiz')

    await moveNoteType(db(), tenantId, created.id, -1)
    const rows = await listNoteTypes(db(), tenantId)
    expect(rows.at(-2)?.label).toBe('Telefonnotiz')
  })

  /** The label is what an entry is recognised by, there being no code — two
   *  reading the same would put two indistinguishable chips over the list. */
  it('refuses a second entry with the same label', async () => {
    await expect(
      createNoteType(db(), tenantId, { label: 'Sitzung', showAsTab: false, sortOrder: 99 }),
    ).rejects.toThrow()
  })

  /** Renaming reaches every note at once, which is the whole point of the
   *  reference running over the id — and of the label being nowhere else. */
  it('renaming moves no note and breaks no hash', async () => {
    const sessionType = await noteTypeId(db(), tenantId, 'Sitzung')
    const written = await writeNote(sessionType)
    await lockNote(db(), tenantId, user.id, written.id)

    const [before] = await db().select().from(note).where(eq(note.id, written.id))

    await updateNoteType(db(), tenantId, sessionType, {
      label: 'Sitzungsdokumentation',
      showAsTab: true,
      sortOrder: 10,
    })

    const [after] = await db().select().from(note).where(eq(note.id, written.id))
    expect(after?.noteTypeId).toBe(sessionType)
    expect(after?.contentHash).toBe(before?.contentHash)
  })
})

describe('deleting', () => {
  it('works while nothing carries the type', async () => {
    const created = await createNoteType(db(), tenantId, {
      label: 'Telefonat',
      showAsTab: false,
      sortOrder: 60,
    })

    expect(await deleteNoteType(db(), tenantId, created.id)).toBe(true)
    expect(await deleteNoteType(db(), tenantId, created.id)).toBe(false)
  })

  it('refuses a type notes carry, and says how many', async () => {
    const sessionType = await noteTypeId(db(), tenantId, 'Sitzung')
    await writeNote(sessionType)
    await writeNote(sessionType)

    const error = await deleteNoteType(db(), tenantId, sessionType).catch((thrown) => thrown)
    expect(error).toBeInstanceOf(NoteTypeInUseError)
    expect((error as NoteTypeInUseError).count).toBe(2)
  })

  /** The foreign key is the backstop behind the count above. The domain
   *  refuses first so the answer is a sentence with a number in it. */
  it('is refused by the database too', async () => {
    const sessionType = await noteTypeId(db(), tenantId, 'Sitzung')
    await writeNote(sessionType)

    const thrown = await db()
      .delete(noteType)
      .where(eq(noteType.id, sessionType))
      .catch((error) => error)

    expect(foreignKeyViolationConstraint(thrown)).toBe('note_type_fk')
  })

  /** Emptying the catalogue is allowed and says nothing: without a type no
   *  note can be written, the screen says so, and whoever deleted all of them
   *  has done it. There is no undeletable entry — that mechanism exists for
   *  rows logic depends on, and no logic depends on a note type. */
  it('allows the last entry to go', async () => {
    for (const row of await listNoteTypes(db(), tenantId)) {
      expect(await deleteNoteType(db(), tenantId, row.id)).toBe(true)
    }
    expect(await listNoteTypes(db(), tenantId)).toEqual([])
  })
})
