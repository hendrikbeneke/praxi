import { noteInputSchema, noteListQuerySchema, noteUpdateSchema } from '@praxi/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../context.js'
import { db } from '../db/client.js'
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from '../db/errors.js'
import { MAX_UPLOAD_BYTES, mayRenderInline } from '../domain/file-type.js'
import {
  AddendumTargetError,
  addFile,
  createNote,
  deleteNote,
  FileTooLargeError,
  getFileForDownload,
  listNotes,
  NoteLockedError,
  removeFile,
  UnsupportedFileTypeError,
  updateNote,
} from '../domain/note.js'
import { lockNote, NoteAlreadyLockedError, verifyChain } from '../domain/note-lock.js'
import { logger } from '../logger.js'
import { messages } from '../messages.js'
import { requireAuth, userId } from '../middleware/auth.js'
import { tenantId, withTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { fileStore } from '../storage.js'

const noteParam = z.object({ noteId: z.uuid() })
const fileParam = z.object({ noteId: z.uuid(), fileId: z.uuid() })
const chainQuery = z.object({ contactId: z.uuid() })

function notFound(): never {
  throw new HTTPException(404, { message: messages.note.notFound })
}

/** The rules live in `domain/`; this only decides how they reach the client. */
function translate(error: unknown): never {
  if (error instanceof NoteLockedError) {
    throw new HTTPException(409, { message: messages.note.locked })
  }
  if (error instanceof NoteAlreadyLockedError) {
    throw new HTTPException(409, { message: messages.note.alreadyLocked })
  }
  if (error instanceof AddendumTargetError) {
    throw new HTTPException(409, {
      message:
        error.reason === 'missing'
          ? messages.note.addendumTargetMissing
          : messages.note.addendumTargetUnlocked,
    })
  }
  if (error instanceof FileTooLargeError) {
    throw new HTTPException(413, { message: messages.note.fileTooLarge })
  }
  if (error instanceof UnsupportedFileTypeError) {
    throw new HTTPException(415, { message: messages.note.fileTypeNotAccepted })
  }
  // A type that was deleted between loading the form and saving it, or one
  // belonging to another tenant — the composite foreign key catches both.
  if (foreignKeyViolationConstraint(error) === 'note_type_fk') {
    throw new HTTPException(409, { message: messages.note.unknownType })
  }
  // Two locks at the same instant; see `note_chain_link_key`.
  const constraint = uniqueViolationConstraint(error)
  if (constraint === 'note_chain_link_key' || constraint === 'note_chain_head_key') {
    throw new HTTPException(409, { message: messages.note.chainForked })
  }
  throw error
}

export const notesRoute = new Hono<AppEnv>()
  .use('*', requireAuth, withTenant)

  .get('/', validate('query', noteListQuerySchema), async (c) => {
    return c.json(await listNotes(db(), tenantId(c), c.req.valid('query')))
  })

  /** Registered before `/:noteId` — and `noteId` is validated as a uuid, so
   *  the two cannot be confused either way. */
  .get('/chain', validate('query', chainQuery), async (c) => {
    const report = await verifyChain(db(), tenantId(c), fileStore(), c.req.valid('query').contactId)
    return c.json(report)
  })

  .post('/', validate('json', noteInputSchema), async (c) => {
    const created = await createNote(db(), tenantId(c), userId(c), c.req.valid('json')).catch(
      translate,
    )
    return c.json(created, 201)
  })

  .put('/:noteId', validate('param', noteParam), validate('json', noteUpdateSchema), async (c) => {
    const updated = await updateNote(
      db(),
      tenantId(c),
      c.req.valid('param').noteId,
      c.req.valid('json'),
    ).catch(translate)

    return updated ? c.json(updated) : notFound()
  })

  .delete('/:noteId', validate('param', noteParam), async (c) => {
    const noteId = c.req.valid('param').noteId
    const result = await deleteNote(db(), tenantId(c), fileStore(), noteId).catch(translate)
    if (!result.deleted) return notFound()

    if (!result.filesRemoved) {
      // Ids only — a file name is clinical content (CLAUDE.md rule 12).
      // The rows are gone, so the note really is deleted; what is left behind
      // is unreferenced bytes, which `pnpm files:orphans` clears out.
      logger().warn({ noteId }, 'note deleted but its files could not be removed from disk')
    }
    return c.body(null, 204)
  })

  .post('/:noteId/lock', validate('param', noteParam), async (c) => {
    const locked = await lockNote(db(), tenantId(c), userId(c), c.req.valid('param').noteId).catch(
      translate,
    )

    return locked ? c.json(locked) : notFound()
  })

  .post('/:noteId/files', validate('param', noteParam), async (c) => {
    // Checked before the body is read: `parseBody` would otherwise buffer the
    // whole upload just to reject it.
    const declaredLength = Number(c.req.header('content-length') ?? '0')
    if (declaredLength > MAX_UPLOAD_BYTES) {
      throw new HTTPException(413, { message: messages.note.fileTooLarge })
    }

    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: messages.note.fileMissing })
    }

    const created = await addFile(db(), tenantId(c), fileStore(), c.req.valid('param').noteId, {
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }).catch(translate)

    return created ? c.json(created, 201) : notFound()
  })

  .get('/:noteId/files/:fileId', validate('param', fileParam), async (c) => {
    const { noteId, fileId } = c.req.valid('param')
    const found = await getFileForDownload(db(), tenantId(c), noteId, fileId)
    if (!found) throw new HTTPException(404, { message: messages.note.fileNotFound })

    let bytes: Buffer
    try {
      bytes = await fileStore().read(found.storagePath)
    } catch {
      logger().error({ noteId, fileId }, 'attachment missing on disk')
      throw new HTTPException(410, { message: messages.note.fileGone })
    }

    /**
     * Never served statically (CLAUDE.md rule 12), and never with a type the
     * browser might reinterpret: `nosniff` plus a stored mime type that was
     * determined from the bytes, not from the upload. Only the handful of
     * formats the viewer renders in its own sandbox may be shown inline; the
     * rest downloads.
     */
    const inline = c.req.query('disposition') === 'inline' && mayRenderInline(found.mimeType)

    return new Response(bytes, {
      headers: {
        'Content-Type': found.mimeType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
      },
    })
  })

  .delete('/:noteId/files/:fileId', validate('param', fileParam), async (c) => {
    const { noteId, fileId } = c.req.valid('param')
    const result = await removeFile(db(), tenantId(c), fileStore(), noteId, fileId).catch(translate)
    if (!result.deleted) throw new HTTPException(404, { message: messages.note.fileNotFound })

    if (!result.fileRemoved) {
      logger().warn({ noteId, fileId }, 'attachment row deleted but the file remains on disk')
    }
    return c.body(null, 204)
  })
