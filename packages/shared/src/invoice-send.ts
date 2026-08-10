import { z } from 'zod'
import { requiredText } from './field.js'
import { formatEuro } from './money.js'

/**
 * Sending a finalized invoice by mail (slice 10).
 *
 * Never automatic and never part of finalization — always a deliberate action,
 * and a draft cannot be sent at all: it is not a document yet.
 */

/**
 * The placeholders a template may use. A closed set on purpose: an open one
 * turns the template into a small language, and every addition then has to be
 * documented somewhere the practitioner will not read.
 *
 * `{{name}}` is the recipient's name — it goes to the recipient themselves, so
 * it is not a disclosure. Nothing clinical is available here, and nothing
 * clinical will be added.
 */
export const emailPlaceholders = ['number', 'date', 'total', 'name'] as const
export type EmailPlaceholder = (typeof emailPlaceholders)[number]

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export type PlaceholderValues = {
  number: string
  date: string
  total: number
  name: string
}

/**
 * Fills the known placeholders and **leaves the unknown ones standing**.
 *
 * Emptying them would be worse: `{{kontonummer}}` silently becoming nothing
 * produces a sentence with a hole in it that reads as if it were meant that
 * way. Left in place it is visible — and the send dialog points at it before
 * anything goes out, so it is noticed here rather than by the recipient.
 */
export function applyPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    switch (name) {
      case 'number':
        return values.number
      case 'date':
        return values.date
      case 'total':
        return formatEuro(values.total)
      case 'name':
        return values.name
      default:
        return match
    }
  })
}

/** Every `{{…}}` left in the text that is not one of the known ones. Used by
 *  the server for the draft and by the dialog on every keystroke, because the
 *  text stays editable and one can be typed in by hand. */
export function unknownPlaceholders(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]
    if (name && !emailPlaceholders.includes(name as EmailPlaceholder)) found.add(name)
  }
  return [...found]
}

/**
 * What the send dialog opens with.
 *
 * Assembled on the server, with the placeholders already resolved, so what is
 * on screen is exactly what goes out. Resolving again at send time would allow
 * the two to differ.
 */
export const invoiceSendDraftSchema = z.object({
  /** The contact's billing recipient if that relation exists, otherwise the
   *  contact. Null when neither has an address. */
  recipient: z.string().nullable(),
  recipientName: z.string(),
  subject: z.string(),
  body: z.string(),
  /** False with a reason: a draft, a missing address, no SMTP configuration. */
  canSend: z.boolean(),
  blockedReason: z.string().nullable(),
  unknownPlaceholders: z.array(z.string()),
})

export type InvoiceSendDraft = z.infer<typeof invoiceSendDraftSchema>

/** What is actually sent — exactly what was confirmed on screen. */
export const invoiceSendInputSchema = z.object({
  recipient: z.email().max(255),
  subject: requiredText(200),
  body: requiredText(8000),
})

export type InvoiceSendInput = z.infer<typeof invoiceSendInputSchema>

/**
 * One attempt, successful or not. Failed attempts stay in the list — that is
 * what makes "I tried three times" answerable, and it is what a synchronous
 * send has instead of a retry mechanism.
 */
export const invoiceSendSchema = z.object({
  id: z.uuid(),
  sentAt: z.iso.datetime(),
  recipient: z.string(),
  subject: z.string(),
  ok: z.boolean(),
  error: z.string().nullable(),
  sentByName: z.string().nullable(),
})

export type InvoiceSend = z.infer<typeof invoiceSendSchema>
