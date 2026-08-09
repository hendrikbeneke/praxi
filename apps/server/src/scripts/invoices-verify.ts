/**
 * Checks that every finalized invoice still has its document, unchanged.
 *
 *   pnpm invoices:verify
 *
 * For each finalized invoice: does the file exist, and does its SHA-256 match
 * the `pdf_hash` stored when it was written? That catches both failure modes
 * this design can produce — the crash window in `finalizeInvoice`, where a
 * document may be missing, and a file altered or deleted on disk afterwards.
 *
 * ## There is deliberately no re-render mode
 *
 * It would be easy to add `--repair` and rebuild a missing PDF from the stored
 * data, and it would be wrong. The result would not be the same document: the
 * template may have been replaced, the fonts and this code may have changed,
 * and the recomputed hash would not match `pdf_hash` — so the repair would
 * have to overwrite the hash too, which is exactly the audit trail it claims
 * to restore. The correct response to a missing document is to cancel the
 * invoice and issue a new one, which is a bookkeeping act and belongs in front
 * of a human.
 *
 * Read-only by design. This script never writes anything.
 */

import { createHash } from 'node:crypto'
import { and, eq, isNotNull } from 'drizzle-orm'
import { closeDatabase, db } from '../db/client.js'
import { invoice } from '../db/schema.js'
import { loadEnvFile } from '../env.js'
import { fileStore } from '../storage.js'

loadEnvFile()

try {
  const store = fileStore()

  const rows = await db()
    .select({
      number: invoice.number,
      status: invoice.status,
      pdfPath: invoice.pdfPath,
      pdfHash: invoice.pdfHash,
    })
    .from(invoice)
    .where(and(eq(invoice.status, 'finalized'), isNotNull(invoice.pdfPath)))

  let missing = 0
  let altered = 0

  for (const row of rows) {
    if (!row.pdfPath) continue

    let bytes: Buffer
    try {
      bytes = await store.read(row.pdfPath)
    } catch {
      console.error(`MISSING  ${row.number}  ${row.pdfPath}`)
      missing += 1
      continue
    }

    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== row.pdfHash) {
      console.error(`ALTERED  ${row.number}  ${row.pdfPath}`)
      console.error(`         stored ${row.pdfHash}`)
      console.error(`         actual ${actual}`)
      altered += 1
    }
  }

  const broken = missing + altered
  if (broken === 0) {
    console.info(`${rows.length} finalized invoice(s) checked, all documents intact`)
  } else {
    console.error(
      `${rows.length} checked, ${missing} missing, ${altered} altered. ` +
        'A finalized invoice is never re-rendered — cancel it and issue a new one.',
    )
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabase()
}
