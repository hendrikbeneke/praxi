import { PDFDocument } from 'pdf-lib'

/**
 * Puts the rendered content on top of the practitioner's letterhead
 * (CLAUDE.md rule 11).
 *
 * - A template with one page backs every page of the document.
 * - A template with two pages: page 1 backs the first page, page 2 backs all
 *   following pages — a letterhead with a full header on sheet one and a plain
 *   continuation sheet.
 *
 * Without a template the content is returned unchanged, which is what makes
 * the application usable before one has been uploaded.
 *
 * The output is assembled into a fresh document rather than drawn into the
 * content pages. `page.drawPage` appends to the content stream and therefore
 * paints *over* what is already there — the letterhead would sit on top of the
 * amounts. Drawing the background first into a new page and the content second
 * gets the order right, and it is the only order that is safe: the template is
 * paper, never a stamp.
 */

/** Fixed on both layers so the same invoice always produces the same bytes.
 *  Without this, `/CreationDate` alone would make every render differ. */
export const PDF_PRODUCER = 'praxi'

export class InvalidTemplateError extends Error {
  readonly reason: 'empty' | 'too-many-pages' | 'not-a-pdf'

  constructor(reason: 'empty' | 'too-many-pages' | 'not-a-pdf') {
    super(`invoice template is invalid: ${reason}`)
    this.name = 'InvalidTemplateError'
    this.reason = reason
  }
}

function stamp(document: PDFDocument, timestamp: Date): void {
  document.setProducer(PDF_PRODUCER)
  document.setCreator(PDF_PRODUCER)
  document.setCreationDate(timestamp)
  document.setModificationDate(timestamp)
}

/**
 * `updateMetadata: false` is not optional.
 *
 * pdf-lib's `save()` rewrites `/Producer` and `/ModificationDate` on the way
 * out unless told not to, using the wall clock — which would undo everything
 * `stamp` just did and make every render differ. It hides well, because a PDF
 * date has second precision: two renders in the same second still match, so
 * the determinism test would pass most of the time and fail at random.
 *
 * `useObjectStreams: false` keeps the output plain, which makes a diff between
 * two renders readable when one is ever needed.
 */
const SAVE_OPTIONS = { useObjectStreams: false, updateMetadata: false } as const

/**
 * The same flag on the way in. `PDFDocument.load()` also rewrites `/Producer`
 * and `/ModificationDate` by default — on the in-memory document, so it is
 * easy to mistake for the renderer having done it. Anything that reads a PDF
 * back to inspect it has to pass this too, or it measures its own footprint.
 */
export const LOAD_OPTIONS = { updateMetadata: false } as const

export async function overlayOnTemplate(
  content: Uint8Array,
  template: Uint8Array | null,
  timestamp: Date,
): Promise<Uint8Array> {
  if (!template) {
    const plain = await PDFDocument.load(content, LOAD_OPTIONS)
    stamp(plain, timestamp)
    return plain.save(SAVE_OPTIONS)
  }

  const source = await PDFDocument.load(content, LOAD_OPTIONS)
  const letterhead = await PDFDocument.load(template, LOAD_OPTIONS)
  if (letterhead.getPageCount() === 0) throw new InvalidTemplateError('empty')

  const output = await PDFDocument.create({ updateMetadata: false })

  const contentPages = await output.embedPdf(
    source,
    source.getPageIndices().map((index) => index),
  )
  // Embedded once and reused, so a two-page letterhead adds two page objects
  // to the file rather than two per sheet.
  const [firstBackground, followingBackground] = await output.embedPdf(letterhead, [
    0,
    letterhead.getPageCount() >= 2 ? 1 : 0,
  ])

  contentPages.forEach((embedded, index) => {
    const source_ = source.getPage(index)
    const { width, height } = source_.getSize()
    const page = output.addPage([width, height])

    const background = index === 0 ? firstBackground : followingBackground
    if (background) page.drawPage(background, { x: 0, y: 0, width, height })

    page.drawPage(embedded, { x: 0, y: 0, width, height })
  })

  stamp(output, timestamp)
  return output.save(SAVE_OPTIONS)
}

/** Checked on upload so a broken template is rejected where it can still be
 *  replaced, rather than when an invoice is being finalized. */
export async function assertUsableTemplate(bytes: Uint8Array): Promise<number> {
  let document: PDFDocument
  try {
    document = await PDFDocument.load(bytes, LOAD_OPTIONS)
  } catch {
    throw new InvalidTemplateError('not-a-pdf')
  }

  const pages = document.getPageCount()
  if (pages === 0) throw new InvalidTemplateError('empty')
  if (pages > 2) throw new InvalidTemplateError('too-many-pages')
  return pages
}
