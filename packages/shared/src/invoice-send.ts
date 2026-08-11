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
  /** Which template the subject and body above came from, so the picker can
   *  show what is in force. Null when there is no active template at all. */
  templateId: z.uuid().nullable(),
  /**
   * False with a reason — and **only for what the dialog cannot mend**: the
   * invoice is still a draft, or no SMTP account is configured. Nothing the
   * practitioner types can change either.
   *
   * What the *prefill* could not supply is a different matter and lives in the
   * two flags below. Mixing the two is what made the send button stay disabled
   * after an address was typed in by hand: a blocked state derived from loaded
   * data outlived the reason it was derived from.
   */
  canSend: z.boolean(),
  blockedReason: z.string().nullable(),
  /**
   * The contact had no address, which is why the recipient field opened empty.
   * It explains a gap and stops meaning anything the moment the field holds a
   * valid address — so the screen, not the server, decides when to stop
   * showing it.
   */
  recipientAddressMissing: z.boolean(),
  /** No active mail template exists, which is why subject and body opened
   *  empty. Same reasoning. */
  templateMissing: z.boolean(),
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
