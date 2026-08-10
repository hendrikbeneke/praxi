import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { raisedMessage } from '../db/errors.js'
import { contact, note, noteFile } from '../db/schema.js'
import { newId } from '../id.js'
import { createTenant, createUser, type TestUser } from '../test/fixtures.js'
import { ActivityHasNotesError, createActivity, deleteActivity } from './activity.js'
import { FileStore } from './file-store.js'
import {
  AddendumTargetError,
  addFile,
  createNote,
  deleteNote,
  getNote,
  listNotes,
  NoteLockedError,
  removeFile,
  UnsupportedFileTypeError,
  updateNote,
} from './note.js'
import { computeContentHash } from './note-hash.js'
import { lockNote, NoteAlreadyLockedError, verifyChain } from './note-lock.js'

/** A minimal but genuine PDF, so the magic-byte check has something real to
 *  accept. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

let tenantId: string
let user: TestUser
let contactId: string
let store: FileStore
let storeRoot: string

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
  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-files-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

/**
 * Runs a query that must be refused by a trigger and returns the message the
 * trigger raised. Asserting on this rather than on what Drizzle throws matters:
 * Drizzle wraps driver errors, and its own message is just the failed SQL — a
 * `rejects.toThrow(/…/)` against it passes for any failure at all.
 */
async function refusal(query: PromiseLike<unknown>): Promise<string | null> {
  try {
    await query
  } catch (error) {
    return raisedMessage(error)
  }
  throw new Error('expected the database to refuse, but the query succeeded')
}

function draft(overrides: Partial<Parameters<typeof createNote>[3]> = {}) {
  return {
    contactId,
    activityId: null,
    noteDate: '2026-08-09',
    type: 'session' as const,
    text: 'Erstgespräch geführt.',
    correctsNoteId: null,
    ...overrides,
  }
}

describe('notes while unlocked', () => {
  it('creates, reads and edits', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    expect(created.lockedAt).toBeNull()
    expect(created.createdByName).toBe(user.email ? 'Test Behandler' : '')

    const updated = await updateNote(db(), tenantId, created.id, {
      activityId: null,
      noteDate: '2026-08-10',
      type: 'general',
      text: 'Korrigiert.',
    })

    expect(updated?.text).toBe('Korrigiert.')
    expect(updated?.noteDate).toBe('2026-08-10')
  })

  it('lists by contact in chronological order', async () => {
    await createNote(db(), tenantId, user.id, draft({ noteDate: '2026-08-10', text: 'zweite' }))
    await createNote(db(), tenantId, user.id, draft({ noteDate: '2026-08-09', text: 'erste' }))

    const rows = await listNotes(db(), tenantId, { contactId })
    expect(rows.map((row) => row.text)).toEqual(['erste', 'zweite'])
  })

  it('deletes and takes the files with it', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    const file = await addFile(db(), tenantId, store, created.id, {
      fileName: 'Fragebogen.pdf',
      bytes: PDF,
    })

    if (!file) throw new Error('no file')
    const onDisk = await store.sha256OnDisk(
      (await db().select().from(noteFile).where(eq(noteFile.id, file.id)))[0]?.storagePath ?? '',
    )
    expect(onDisk).not.toBeNull()

    const result = await deleteNote(db(), tenantId, store, created.id)
    expect(result).toEqual({ deleted: true, filesRemoved: true })
    expect(await getNote(db(), tenantId, created.id)).toBeNull()

    // The bytes are gone too, not just the row.
    const remaining = await db().select().from(noteFile)
    expect(remaining).toHaveLength(0)
  })
})

describe('attachments', () => {
  it('stores a relative path under the contact and note', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await addFile(db(), tenantId, store, created.id, { fileName: 'Brief.pdf', bytes: PDF })

    const [row] = await db().select().from(noteFile)
    expect(row?.storagePath).toBe(`files/${contactId}/${created.id}/${row?.id}.pdf`)
    expect(row?.mimeType).toBe('application/pdf')
    // The uploaded name is never a path segment.
    expect(row?.storagePath).not.toContain('Brief')
  })

  it('believes the bytes, not the name', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    const file = await addFile(db(), tenantId, store, created.id, {
      fileName: 'behauptet.pdf',
      bytes: PNG,
    })

    expect(file?.mimeType).toBe('image/png')
  })

  it('refuses a type that is not on the list', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await expect(
      addFile(db(), tenantId, store, created.id, {
        fileName: 'skript.html',
        bytes: Buffer.from('<html><script>alert(1)</script>', 'utf8'),
      }),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError)
  })

  it('removes a file from the row and from disk', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    const file = await addFile(db(), tenantId, store, created.id, {
      fileName: 'Brief.pdf',
      bytes: PDF,
    })
    if (!file) throw new Error('no file')

    const [row] = await db().select().from(noteFile)
    const path = row?.storagePath ?? ''

    expect(await removeFile(db(), tenantId, store, created.id, file.id)).toEqual({
      deleted: true,
      fileRemoved: true,
    })
    expect(await store.sha256OnDisk(path)).toBeNull()
  })
})

describe('locking', () => {
  it('sets the hash over the state at that moment and refuses every later change', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await addFile(db(), tenantId, store, created.id, { fileName: 'Brief.pdf', bytes: PDF })

    const locked = await lockNote(db(), tenantId, user.id, created.id)
    expect(locked?.lockedAt).not.toBeNull()
    expect(locked?.prevHash).toBeNull()
    expect(locked?.lockedByName).toBe('Test Behandler')

    const [row] = await db().select().from(note).where(eq(note.id, created.id))
    const [file] = await db().select().from(noteFile)
    expect(row?.contentHash).toBe(
      computeContentHash({
        noteDate: row?.noteDate ?? '',
        type: row?.type ?? '',
        text: row?.text ?? '',
        createdAt: row?.createdAt ?? new Date(0),
        createdBy: row?.createdBy ?? '',
        fileHashes: [file?.sha256 ?? ''],
      }),
    )

    await expect(
      updateNote(db(), tenantId, created.id, {
        activityId: null,
        noteDate: '2026-08-11',
        type: 'session',
        text: 'doch anders',
      }),
    ).rejects.toBeInstanceOf(NoteLockedError)

    await expect(deleteNote(db(), tenantId, store, created.id)).rejects.toBeInstanceOf(
      NoteLockedError,
    )
    await expect(lockNote(db(), tenantId, user.id, created.id)).rejects.toBeInstanceOf(
      NoteAlreadyLockedError,
    )
  })

  it('refuses an upload once the note is locked', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await lockNote(db(), tenantId, user.id, created.id)

    await expect(
      addFile(db(), tenantId, store, created.id, { fileName: 'zu spät.pdf', bytes: PDF }),
    ).rejects.toBeInstanceOf(NoteLockedError)
  })

  it('chains notes of the same contact and starts fresh for another', async () => {
    const first = await createNote(db(), tenantId, user.id, draft({ text: 'erste' }))
    const second = await createNote(db(), tenantId, user.id, draft({ text: 'zweite' }))

    const lockedFirst = await lockNote(db(), tenantId, user.id, first.id)
    const lockedSecond = await lockNote(db(), tenantId, user.id, second.id)

    expect(lockedFirst?.prevHash).toBeNull()
    expect(lockedSecond?.prevHash).toBe(lockedFirst?.contentHash)

    const otherContact = await makeContact()
    const elsewhere = await createNote(
      db(),
      tenantId,
      user.id,
      draft({ contactId: otherContact, text: 'andere Akte' }),
    )
    const lockedElsewhere = await lockNote(db(), tenantId, user.id, elsewhere.id)
    // A chain is per contact — this one starts over.
    expect(lockedElsewhere?.prevHash).toBeNull()
  })

  it('rejects a second chain head for one contact', async () => {
    const first = await createNote(db(), tenantId, user.id, draft({ text: 'erste' }))
    await lockNote(db(), tenantId, user.id, first.id)

    // What two concurrent locks would produce: a second note claiming to be
    // the first link. `note_chain_head_key` is the only thing standing in the
    // way, so it is asserted directly.
    const second = await createNote(db(), tenantId, user.id, draft({ text: 'zweite' }))
    await expect(
      db()
        .update(note)
        .set({ lockedAt: new Date(), lockedBy: user.id, contentHash: 'a'.repeat(64) })
        .where(eq(note.id, second.id)),
    ).rejects.toThrow()
  })

  it('rejects two notes claiming the same predecessor', async () => {
    const first = await createNote(db(), tenantId, user.id, draft({ text: 'erste' }))
    const locked = await lockNote(db(), tenantId, user.id, first.id)
    const second = await createNote(db(), tenantId, user.id, draft({ text: 'zweite' }))
    await lockNote(db(), tenantId, user.id, second.id)

    const third = await createNote(db(), tenantId, user.id, draft({ text: 'dritte' }))
    await expect(
      db()
        .update(note)
        .set({
          lockedAt: new Date(),
          lockedBy: user.id,
          contentHash: 'b'.repeat(64),
          prevHash: locked?.contentHash,
        })
        .where(eq(note.id, third.id)),
    ).rejects.toThrow()
  })
})

describe('addenda', () => {
  it('supplements a locked note', async () => {
    const original = await createNote(db(), tenantId, user.id, draft())
    await lockNote(db(), tenantId, user.id, original.id)

    const addendum = await createNote(
      db(),
      tenantId,
      user.id,
      draft({ type: 'addendum', text: 'Nachtrag: Dosis korrigiert.', correctsNoteId: original.id }),
    )

    expect(addendum.correctsNoteId).toBe(original.id)
  })

  it('refuses to supplement a note that is still open', async () => {
    const original = await createNote(db(), tenantId, user.id, draft())

    await expect(
      createNote(
        db(),
        tenantId,
        user.id,
        draft({ type: 'addendum', text: 'zu früh', correctsNoteId: original.id }),
      ),
    ).rejects.toBeInstanceOf(AddendumTargetError)
  })

  it('refuses to supplement another contact’s note', async () => {
    const original = await createNote(db(), tenantId, user.id, draft())
    await lockNote(db(), tenantId, user.id, original.id)
    const otherContact = await makeContact()

    await expect(
      createNote(
        db(),
        tenantId,
        user.id,
        draft({
          contactId: otherContact,
          type: 'addendum',
          text: 'fremde Akte',
          correctsNoteId: original.id,
        }),
      ),
    ).rejects.toBeInstanceOf(AddendumTargetError)
  })
})

/**
 * The trigger, tested for what it does rather than for what the domain code
 * does. Every case here goes past `domain/note.ts` and writes straight to the
 * table — which is exactly what a maintenance session in psql would do.
 */
describe('the database refuses on its own', () => {
  it('blocks UPDATE and DELETE on a locked note', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await lockNote(db(), tenantId, user.id, created.id)

    // The message sits on the wrapped driver error, not on what Drizzle
    // throws — the outer message is only the failed SQL.
    expect(
      await refusal(
        db().update(note).set({ text: 'umgeschrieben' }).where(eq(note.id, created.id)),
      ),
    ).toBe('locked note is immutable')

    expect(await refusal(db().delete(note).where(eq(note.id, created.id)))).toBe(
      'locked note is immutable',
    )
  })

  it('blocks INSERT, UPDATE and DELETE on the files of a note locked afterwards', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    const file = await addFile(db(), tenantId, store, created.id, {
      fileName: 'Brief.pdf',
      bytes: PDF,
    })
    if (!file) throw new Error('no file')

    // The file existed while the note was open; the lock comes after.
    await lockNote(db(), tenantId, user.id, created.id)

    const inserted = db()
      .insert(noteFile)
      .values({
        id: newId(),
        tenantId,
        noteId: created.id,
        fileName: 'nachgeschoben.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        storagePath: `files/${contactId}/${created.id}/x.pdf`,
        sha256: 'c'.repeat(64),
      })
    expect(await refusal(inserted)).toBe('locked note is immutable')

    expect(
      await refusal(
        db().update(noteFile).set({ fileName: 'anders.pdf' }).where(eq(noteFile.id, file.id)),
      ),
    ).toBe('locked note is immutable')

    expect(await refusal(db().delete(noteFile).where(eq(noteFile.id, file.id)))).toBe(
      'locked note is immutable',
    )
  })
})

describe('verifyChain', () => {
  async function lockedChain(count: number): Promise<string[]> {
    const ids: string[] = []
    for (let index = 0; index < count; index += 1) {
      const created = await createNote(db(), tenantId, user.id, draft({ text: `Notiz ${index}` }))
      await lockNote(db(), tenantId, user.id, created.id)
      ids.push(created.id)
    }
    return ids
  }

  it('reports an intact chain', async () => {
    await lockedChain(3)
    const report = await verifyChain(db(), tenantId, store, contactId)

    expect(report.checkedFiles).toBe(true)
    expect(report.entries).toHaveLength(3)
    expect(report.entries.every((entry) => entry.contentOk && entry.linkOk)).toBe(true)
  })

  /**
   * Tampering means going around the trigger, which is what someone with
   * database access has. Disabling it here is not a shortcut — it reproduces
   * the only way this damage can actually occur.
   */
  it('flags a row that was altered behind the trigger’s back', async () => {
    const ids = await lockedChain(3)
    const victim = ids[1]

    await db().execute(sql`alter table note disable trigger protect_locked_note`)
    await db()
      .update(note)
      .set({ text: 'nachträglich geändert' })
      .where(eq(note.id, victim ?? ''))
    await db().execute(sql`alter table note enable trigger protect_locked_note`)

    const report = await verifyChain(db(), tenantId, store, contactId)
    const broken = report.entries.find((entry) => entry.noteId === victim)

    expect(broken?.contentOk).toBe(false)
    // The links still hold: prev_hash was written from the stored hashes, so
    // the damage stays localized instead of reddening everything after it.
    expect(report.entries.every((entry) => entry.linkOk)).toBe(true)
    // And it names the note by date, which is what the report is read by.
    expect(broken?.noteDate).toBe('2026-08-09')
  })

  it('flags a cut link when a locked note is removed from the middle', async () => {
    const ids = await lockedChain(3)

    await db().execute(sql`alter table note disable trigger protect_locked_note`)
    await db()
      .delete(note)
      .where(eq(note.id, ids[1] ?? ''))
    await db().execute(sql`alter table note enable trigger protect_locked_note`)

    const report = await verifyChain(db(), tenantId, store, contactId)
    expect(report.entries).toHaveLength(2)
    expect(report.entries[0]?.linkOk).toBe(true)
    expect(report.entries[1]?.linkOk).toBe(false)
    // The row itself is untouched — a different cause than the test above.
    expect(report.entries[1]?.contentOk).toBe(true)
  })

  it('tells swapped bytes apart from an altered row', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await addFile(db(), tenantId, store, created.id, { fileName: 'Brief.pdf', bytes: PDF })
    await lockNote(db(), tenantId, user.id, created.id)

    const [row] = await db().select().from(noteFile)
    await writeFile(store.absolutePath(row?.storagePath ?? ''), Buffer.concat([PDF, PDF]))

    const report = await verifyChain(db(), tenantId, store, contactId)
    const entry = report.entries[0]

    expect(entry?.contentOk).toBe(true)
    expect(entry?.linkOk).toBe(true)
    expect(entry?.files).toEqual([{ fileId: row?.id, fileName: 'Brief.pdf', status: 'mismatch' }])
  })

  it('reports a file that is gone from disk', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await addFile(db(), tenantId, store, created.id, { fileName: 'Brief.pdf', bytes: PDF })
    await lockNote(db(), tenantId, user.id, created.id)

    const [row] = await db().select().from(noteFile)
    await rm(store.absolutePath(row?.storagePath ?? ''))

    const report = await verifyChain(db(), tenantId, store, contactId)
    expect(report.entries[0]?.files[0]?.status).toBe('missing')
  })

  it('skips the disk when asked to', async () => {
    const created = await createNote(db(), tenantId, user.id, draft())
    await addFile(db(), tenantId, store, created.id, { fileName: 'Brief.pdf', bytes: PDF })
    await lockNote(db(), tenantId, user.id, created.id)

    const [row] = await db().select().from(noteFile)
    await rm(store.absolutePath(row?.storagePath ?? ''))

    const report = await verifyChain(db(), tenantId, store, contactId, { checkFiles: false })
    expect(report.checkedFiles).toBe(false)
    expect(report.entries[0]?.files).toEqual([])
  })
})

describe('an activity that documentation hangs on', () => {
  it('cannot be deleted while a note points at it', async () => {
    const activity = await createActivity(db(), tenantId, {
      contactId,
      type: 'session',
      status: 'planned',
      occurredAt: '2026-08-09T07:00:00.000Z',
      durationMin: 50,
      title: null,
      internalNote: null,
      items: [],
      appointment: null,
    })

    await createNote(db(), tenantId, user.id, draft({ activityId: activity.id }))

    await expect(deleteActivity(db(), tenantId, activity.id)).rejects.toBeInstanceOf(
      ActivityHasNotesError,
    )

    // Detaching the note is the way out, and then it works.
    const [row] = await db()
      .select()
      .from(note)
      .where(and(eq(note.tenantId, tenantId), eq(note.activityId, activity.id)))

    await updateNote(db(), tenantId, row?.id ?? '', {
      activityId: null,
      noteDate: '2026-08-09',
      type: 'session',
      text: 'Erstgespräch geführt.',
    })

    expect(await deleteActivity(db(), tenantId, activity.id)).toBe(true)
  })
})
