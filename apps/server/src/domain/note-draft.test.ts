import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { raisedMessage } from '../db/errors.js'
import { contact, note, noteDraft } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser, noteTypeId, type TestUser } from '../test/fixtures.js'
import { createNote, updateNote } from './note.js'
import {
  DraftNoteLockedError,
  deleteNoteDraft,
  deleteStaleNoteDrafts,
  getNoteDraft,
  saveNoteDraft,
} from './note-draft.js'
import { lockNote } from './note-lock.js'

let tenantId: string
let user: TestUser
let contactId: string
let sessionType: string

async function makeContact(): Promise<string> {
  const id = newId()
  await db()
    .insert(contact)
    .values({
      id,
      tenantId,
      contactNumber: Math.floor(Math.random() * 1_000_000) + 1,
      kind: 'person',
      lastName: 'Testperson',
    })
  return id
}

beforeEach(async () => {
  tenantId = await createTenant(db())
  user = await createUser(db(), { tenantId })
  contactId = await makeContact()
  sessionType = await noteTypeId(db(), tenantId, 'Sitzung')
})

function draft(overrides: Record<string, unknown> = {}) {
  return {
    contactId,
    noteId: null,
    correctsNoteId: null,
    activityId: null,
    noteTypeId: sessionType,
    noteDate: '2026-08-09',
    text: 'Halber Satz, noch im Schreiben',
    ...overrides,
  }
}

function writeNote() {
  return createNote(db(), tenantId, user.id, {
    contactId,
    activityId: null,
    noteDate: '2026-08-09',
    noteTypeId: sessionType,
    text: 'Erstgespräch geführt.',
    correctsNoteId: null,
  })
}

describe('a draft for a note that does not exist yet', () => {
  it('is written, read back and replaced in place', async () => {
    const saved = await saveNoteDraft(db(), tenantId, user.id, draft())
    const again = await saveNoteDraft(db(), tenantId, user.id, draft({ text: 'inzwischen länger' }))

    expect(again.id).toBe(saved.id)
    expect(again.text).toBe('inzwischen länger')

    const read = await getNoteDraft(db(), tenantId, user.id, { contactId })
    expect(read?.text).toBe('inzwischen länger')

    const rows = await db().select().from(noteDraft).where(eq(noteDraft.tenantId, tenantId))
    expect(rows).toHaveLength(1)
  })

  /** One form is open at a time, so a second new note at the same contact
   *  takes the place of the first — that is what the partial index says. */
  it('is one per contact, whatever else changes', async () => {
    await saveNoteDraft(db(), tenantId, user.id, draft({ text: 'erste' }))
    await saveNoteDraft(db(), tenantId, user.id, draft({ text: 'zweite', noteDate: '2026-08-10' }))

    const rows = await db().select().from(noteDraft).where(eq(noteDraft.contactId, contactId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toBe('zweite')
  })

  it('keeps one per contact apart from the next contact’s', async () => {
    const second = await makeContact()
    await saveNoteDraft(db(), tenantId, user.id, draft())
    await saveNoteDraft(db(), tenantId, user.id, draft({ contactId: second, text: 'andere Akte' }))

    expect((await getNoteDraft(db(), tenantId, user.id, { contactId }))?.text).toBe(
      'Halber Satz, noch im Schreiben',
    )
    expect((await getNoteDraft(db(), tenantId, user.id, { contactId: second }))?.text).toBe(
      'andere Akte',
    )
  })

  /**
   * The reason `corrects_note_id` is a column: an addendum is a *new* note and
   * shares the one draft per contact, so without it, taking the draft back
   * would silently produce an ordinary note.
   */
  it('remembers that it is an addendum', async () => {
    const original = await writeNote()
    await lockNote(db(), tenantId, user.id, original.id)

    await saveNoteDraft(db(), tenantId, user.id, draft({ correctsNoteId: original.id }))

    const read = await getNoteDraft(db(), tenantId, user.id, { contactId })
    expect(read?.correctsNoteId).toBe(original.id)
    expect(read?.noteId).toBeNull()
  })

  it('is gone once it is discarded', async () => {
    const saved = await saveNoteDraft(db(), tenantId, user.id, draft())

    expect(await deleteNoteDraft(db(), tenantId, user.id, saved.id)).toBe(true)
    expect(await deleteNoteDraft(db(), tenantId, user.id, saved.id)).toBe(false)
    expect(await getNoteDraft(db(), tenantId, user.id, { contactId })).toBeNull()
  })

  /** One practitioner's unfinished documentation is not reachable through
   *  another's id, whatever the request says. */
  it('belongs to its own user', async () => {
    const other = await createUser(db(), { tenantId, email: 'zweite@praxi.invalid' })
    const saved = await saveNoteDraft(db(), tenantId, user.id, draft())

    expect(await getNoteDraft(db(), tenantId, other.id, { contactId })).toBeNull()
    expect(await deleteNoteDraft(db(), tenantId, other.id, saved.id)).toBe(false)
  })
})

describe('a draft for an existing note', () => {
  it('is kept apart from the one for a new note at the same contact', async () => {
    const existing = await writeNote()

    await saveNoteDraft(db(), tenantId, user.id, draft({ text: 'neue Notiz' }))
    await saveNoteDraft(
      db(),
      tenantId,
      user.id,
      draft({ noteId: existing.id, text: 'Umformulierung' }),
    )

    expect((await getNoteDraft(db(), tenantId, user.id, { contactId }))?.text).toBe('neue Notiz')
    expect(
      (await getNoteDraft(db(), tenantId, user.id, { contactId, noteId: existing.id }))?.text,
    ).toBe('Umformulierung')
  })

  it('goes with the note when the note is deleted', async () => {
    const existing = await writeNote()
    await saveNoteDraft(db(), tenantId, user.id, draft({ noteId: existing.id }))

    await db().delete(note).where(eq(note.id, existing.id))

    const rows = await db().select().from(noteDraft).where(eq(noteDraft.tenantId, tenantId))
    expect(rows).toHaveLength(0)
  })

  /**
   * A draft older than its note is superseded — the note was saved after it
   * was written. That is at the same time the net under deleting the draft
   * after saving: a client that loses that call leaves nothing that surfaces.
   */
  it('is not handed out once the note is newer', async () => {
    const existing = await writeNote()
    await saveNoteDraft(db(), tenantId, user.id, draft({ noteId: existing.id }))

    await updateNote(db(), tenantId, existing.id, {
      activityId: null,
      noteDate: '2026-08-10',
      noteTypeId: sessionType,
      text: 'anders gespeichert',
    })

    expect(
      await getNoteDraft(db(), tenantId, user.id, { contactId, noteId: existing.id }),
    ).toBeNull()
  })
})

describe('a locked note has no draft', () => {
  it('is refused by the domain, with a message', async () => {
    const existing = await writeNote()
    await lockNote(db(), tenantId, user.id, existing.id)

    await expect(
      saveNoteDraft(db(), tenantId, user.id, draft({ noteId: existing.id })),
    ).rejects.toBeInstanceOf(DraftNoteLockedError)
  })

  /** And by the database, for anything going around the domain. */
  it('is refused by the trigger too', async () => {
    const existing = await writeNote()
    await lockNote(db(), tenantId, user.id, existing.id)

    let message: string | null = null
    try {
      await db().insert(noteDraft).values({
        id: newId(),
        tenantId,
        userId: user.id,
        contactId,
        noteId: existing.id,
        text: 'am Trigger vorbei',
      })
    } catch (error) {
      message = raisedMessage(error)
    }

    expect(message).toBe('a locked note has no draft')
  })

  /**
   * Locking removes what is there, in the same transaction — a draft left
   * standing for a note that is now locked is one the trigger makes
   * unremovable through its own upsert path. Every user's, not just the
   * locking one's: the note is immutable for everyone from here.
   */
  it('is cleared when the note is locked', async () => {
    const existing = await writeNote()
    const other = await createUser(db(), { tenantId, email: 'zweite@praxi.invalid' })
    await saveNoteDraft(db(), tenantId, user.id, draft({ noteId: existing.id }))
    await saveNoteDraft(db(), tenantId, other.id, draft({ noteId: existing.id, text: 'fremd' }))

    await lockNote(db(), tenantId, user.id, existing.id)

    const rows = await db().select().from(noteDraft).where(eq(noteDraft.noteId, existing.id))
    expect(rows).toHaveLength(0)
  })

  /** An addendum names a locked note on purpose, and that must stay possible:
   *  it is `note_id` the rule is about, never `corrects_note_id`. */
  it('does not stop an addendum from being drafted', async () => {
    const existing = await writeNote()
    await lockNote(db(), tenantId, user.id, existing.id)

    const saved = await saveNoteDraft(
      db(),
      tenantId,
      user.id,
      draft({ correctsNoteId: existing.id }),
    )
    expect(saved.correctsNoteId).toBe(existing.id)
  })
})

describe('the sweep at login', () => {
  it('takes what nobody touched for thirty days and leaves the rest', async () => {
    const fresh = await saveNoteDraft(db(), tenantId, user.id, draft())
    const second = await makeContact()

    /* Inserted rather than saved and then aged: `set_updated_at` fires on
       UPDATE and would put the row back to now(), which is exactly what that
       trigger is for. An INSERT may name the column. */
    await db()
      .insert(noteDraft)
      .values({
        id: newId(),
        tenantId,
        userId: user.id,
        contactId: second,
        text: 'vor zehn Wochen angefangen',
        updatedAt: new Date('2026-06-01T10:00:00Z'),
      })

    expect(await deleteStaleNoteDrafts(db(), new Date('2026-08-09T10:00:00Z'))).toBe(1)

    const rows = await db().select({ id: noteDraft.id }).from(noteDraft)
    expect(rows.map((row) => row.id)).toEqual([fresh.id])
  })

  it('takes a draft its note has overtaken, whatever its age', async () => {
    const existing = await writeNote()
    await saveNoteDraft(db(), tenantId, user.id, draft({ noteId: existing.id }))

    await updateNote(db(), tenantId, existing.id, {
      activityId: null,
      noteDate: '2026-08-10',
      noteTypeId: sessionType,
      text: 'anders gespeichert',
    })

    expect(await deleteStaleNoteDrafts(db(), new Date('2026-08-09T10:00:00Z'))).toBe(1)
    const rows = await db()
      .select()
      .from(noteDraft)
      .where(and(eq(noteDraft.tenantId, tenantId), eq(noteDraft.noteId, existing.id)))
    expect(rows).toHaveLength(0)
  })
})

describe('the database refuses on its own', () => {
  it('rejects a draft with nothing in it', async () => {
    let message: string | null = null
    try {
      await db()
        .insert(noteDraft)
        .values({ id: newId(), tenantId, userId: user.id, contactId, text: '   ' })
    } catch (error) {
      message = raisedMessage(error) ?? 'refused'
    }
    expect(message).not.toBeNull()
  })
})
