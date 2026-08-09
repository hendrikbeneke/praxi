/**
 * What may be attached to a note, decided by looking at the bytes.
 *
 * The declared content type of an upload is a claim, not a fact, and the
 * stored `mime_type` is what the download route later sends back. Sniffing
 * costs twenty lines and removes a whole class of "it said it was a PDF"
 * problems; the download route additionally sends `nosniff` and only ever
 * offers `inline` for the types below.
 *
 * The list is short on purpose: what a practice actually receives is scans,
 * photographs of documents, and letters.
 */

export type FileType = { mimeType: string; extension: string }

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** The types that may be shown in the browser instead of downloaded. All of
 *  them are rendered by the browser's own viewer, none of them can script the
 *  page that embeds them. */
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/tiff',
])

export function mayRenderInline(mimeType: string): boolean {
  return INLINE_TYPES.has(mimeType)
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length))
    .map((byte) => String.fromCharCode(byte))
    .join('')
}

/** ISO base media brands that mean HEIF still images. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1'])

export function detectFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mimeType: 'application/pdf', extension: '.pdf' }
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: '.jpg' }
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: '.png' }
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { mimeType: 'image/webp', extension: '.webp' }
  }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { mimeType: 'image/tiff', extension: '.tif' }
  }
  if (ascii(bytes, 4, 4) === 'ftyp' && HEIF_BRANDS.has(ascii(bytes, 8, 4))) {
    return { mimeType: 'image/heic', extension: '.heic' }
  }
  return null
}
