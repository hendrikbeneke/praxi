/**
 * Finds attachment bytes that no row points at.
 *
 *   pnpm files:orphans            list what is unreferenced
 *   pnpm files:orphans --delete   and remove it
 *
 * They arise from the one window `deleteNote` cannot close: the rows are
 * committed first and the directory removed afterwards, because a leftover
 * file is recoverable garbage while a row pointing at a missing file is data
 * loss. When that second step fails, the route logs it with ids only — and a
 * log entry nobody reads is not a cleanup strategy, so this is the other half.
 *
 * Listing is the default on purpose. Nothing under the data root is ever
 * deleted without `--delete` being typed out.
 */

import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { closeDatabase, db } from '../db/client.js'
import { noteFile } from '../db/schema.js'
import { loadEnvFile } from '../env.js'
import { fileStore } from '../storage.js'

loadEnvFile()

const shouldDelete = process.argv.includes('--delete')

async function entriesOf(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

try {
  const store = fileStore()
  const root = store.filesRoot()

  const known = new Set(
    (await db().select({ storagePath: noteFile.storagePath }).from(noteFile)).map(
      (row) => row.storagePath,
    ),
  )

  const orphans: string[] = []
  let bytes = 0

  // files/{contactId}/{noteId}/{fileId}.{ext} — walk the two levels the layout
  // defines rather than recursing blindly, so anything of an unexpected shape
  // is reported instead of silently swept up.
  for (const contactId of await entriesOf(root)) {
    const contactDir = join(root, contactId)
    for (const noteId of await entriesOf(contactDir)) {
      const noteDir = join(contactDir, noteId)
      for (const fileName of await entriesOf(noteDir)) {
        const absolute = join(noteDir, fileName)
        const relativePath = store.relativeToRoot(absolute)
        if (known.has(relativePath)) continue

        orphans.push(relativePath)
        bytes += (await stat(absolute)).size
      }
    }
  }

  if (orphans.length === 0) {
    console.info('no orphaned files')
  } else {
    for (const path of orphans) console.info(path)
    console.info(
      `${orphans.length} orphaned file(s), ${(bytes / 1024).toFixed(1)} KiB${
        shouldDelete ? '' : ' — run with --delete to remove them'
      }`,
    )

    if (shouldDelete) {
      for (const path of orphans) await rm(store.absolutePath(path), { force: true })
      // Directories left empty by the removal are swept in a second pass, so a
      // note whose files all went away does not leave a stub behind.
      for (const contactId of await entriesOf(root)) {
        const contactDir = join(root, contactId)
        for (const noteId of await entriesOf(contactDir)) {
          const noteDir = join(contactDir, noteId)
          if ((await entriesOf(noteDir)).length === 0) await rm(noteDir, { recursive: true })
        }
        if ((await entriesOf(contactDir)).length === 0) await rm(contactDir, { recursive: true })
      }
      console.info('removed')
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
