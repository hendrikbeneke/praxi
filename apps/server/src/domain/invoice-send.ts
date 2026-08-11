import type { InvoiceSend, InvoiceSendDraft, InvoiceSendInput } from '@praxi/shared'
import {
  applyPlaceholders,
  formatBerlinDate,
  formatContactName,
  unknownPlaceholders,
} from '@praxi/shared'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database, DbReader } from '../db/client.js'
import {
  appUser,
  contact,
  contactRelation,
  invoice,
  invoiceSend,
  smtpSettings,
} from '../db/schema.js'
import { newId } from '../id.js'
import { buildInvoiceMail, buildTestMail, type MailAddress } from '../mail/message.js'
import type { MailTransport } from '../mail/transport.js'
import { messages } from '../messages.js'
import { defaultEmailTemplate, getEmailTemplate } from './email-template.js'
import type { FileStore } from './file-store.js'
import { getStoredPdfPath } from './invoice.js'

/**
 * Sending a finalized invoice by mail (slice 10).
 *
 * **Synchronous, with no outbox.** The Google push in slice 9 is the
 * projection of a fact that already stands locally: retrying it is free and
 * unambiguous, so a timer may decide. A mail is an *act*. An automatic retry
 * means possibly delivering twice with nobody able to tell — SMTP does not
 * reliably separate greylisting from a hard refusal — and a background attempt
 * that succeeds two hours later leaves the practitioner believing it failed.
 *
 * What replaces the retry mechanism is the log: **every attempt is recorded,
 * successful or not**, before the caller hears anything. A client that
 * disconnects mid-send therefore loses only its answer; the send runs to the
 * end and the row is there on the next look.
 *
 * On logging: nothing about a message reaches the log stream. Recipient,
 * subject, body and the SMTP error live in `invoice_send`, which is a record
 * inside the protected database — rule 12 governs the log, and there a send is
 * an invoice id and an outcome.
 */

export class InvoiceNotSendableError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'InvoiceNotSendableError'
  }
}

/** The system relation from rule 4: `from` is the contact the fact belongs to,
 *  `to` is the counterpart who gets the bill. */
const BILLING_RECIPIENT = 'billing_recipient'

const recipientContact = alias(contact, 'recipient_contact')

type Recipient = { email: string | null; name: string }

/**
 * Who the invoice goes to: the contact's billing recipient where that relation
 * exists, otherwise the contact. Only a default — the dialog lets it be
 * overwritten, which is the difference to the test send that has no recipient
 * at all.
 */
export async function resolveRecipient(
  reader: DbReader,
  tenantId: string,
  contactId: string,
): Promise<Recipient> {
  const [related] = await reader
    .select({
      email: recipientContact.email,
      kind: recipientContact.kind,
      title: recipientContact.title,
      firstName: recipientContact.firstName,
      lastName: recipientContact.lastName,
      companyName: recipientContact.companyName,
    })
    .from(contactRelation)
    .innerJoin(recipientContact, eq(recipientContact.id, contactRelation.toContactId))
    .where(
      and(
        eq(contactRelation.tenantId, tenantId),
        eq(contactRelation.fromContactId, contactId),
        eq(contactRelation.relationCode, BILLING_RECIPIENT),
      ),
    )
    .limit(1)

  if (related) return { email: related.email, name: formatContactName(related) }

  const [own] = await reader
    .select({
      email: contact.email,
      kind: contact.kind,
      title: contact.title,
      firstName: contact.firstName,
      lastName: contact.lastName,
      companyName: contact.companyName,
    })
    .from(contact)
    .where(and(eq(contact.tenantId, tenantId), eq(contact.id, contactId)))
    .limit(1)

  if (!own) return { email: null, name: '' }
  return { email: own.email, name: formatContactName(own) }
}

/**
 * The last **successful** send per invoice, in one grouped query.
 *
 * Derived and never stored, exactly like `paidCentsByInvoice` — the log
 * already knows when it went out and to whom, and a column on the invoice
 * would be a second place that eventually says something else.
 */
export async function lastSendByInvoice(
  reader: DbReader,
  tenantId: string,
  invoiceIds: readonly string[],
): Promise<Map<string, { sentAt: Date; recipient: string }>> {
  if (invoiceIds.length === 0) return new Map()

  const rows = await reader
    .select({
      invoiceId: invoiceSend.invoiceId,
      sentAt: sql<Date>`max(${invoiceSend.sentAt})`,
      // The address belonging to that maximum. Picking it with a window
      // function would need a second pass; this reads the recipient of the row
      // whose timestamp won.
      recipient: sql<string>`(array_agg(${invoiceSend.recipient} order by ${invoiceSend.sentAt} desc))[1]`,
    })
    .from(invoiceSend)
    .where(
      and(
        eq(invoiceSend.tenantId, tenantId),
        eq(invoiceSend.ok, true),
        inArray(invoiceSend.invoiceId, [...invoiceIds]),
      ),
    )
    .groupBy(invoiceSend.invoiceId)

  return new Map(
    rows.map((row) => [row.invoiceId, { sentAt: new Date(row.sentAt), recipient: row.recipient }]),
  )
}

export async function listSends(
  database: Database,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceSend[]> {
  const rows = await database
    .select({
      id: invoiceSend.id,
      sentAt: invoiceSend.sentAt,
      recipient: invoiceSend.recipient,
      subject: invoiceSend.subject,
      ok: invoiceSend.ok,
      error: invoiceSend.error,
      sentByName: appUser.name,
    })
    .from(invoiceSend)
    .leftJoin(appUser, eq(appUser.id, invoiceSend.sentBy))
    .where(and(eq(invoiceSend.tenantId, tenantId), eq(invoiceSend.invoiceId, invoiceId)))
    .orderBy(desc(invoiceSend.sentAt))

  return rows.map((row) => ({ ...row, sentAt: row.sentAt.toISOString() }))
}

type InvoiceForSend = {
  id: string
  contactId: string
  status: string
  number: string | null
  invoiceDate: string
  totalCents: number
}

async function loadInvoiceForSend(
  reader: DbReader,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceForSend | null> {
  const [row] = await reader
    .select({
      id: invoice.id,
      contactId: invoice.contactId,
      status: invoice.status,
      number: invoice.number,
      invoiceDate: invoice.invoiceDate,
      totalCents: invoice.totalCents,
    })
    .from(invoice)
    .where(and(eq(invoice.tenantId, tenantId), eq(invoice.id, invoiceId)))
    .limit(1)

  return row ?? null
}

/**
 * What the dialog opens with, placeholders already resolved.
 *
 * Resolved **here** and not at send time: what is on screen is then exactly
 * what goes out, and there is no second resolution that could differ from the
 * text that was confirmed.
 */
export async function prepareSend(
  database: Database,
  tenantId: string,
  invoiceId: string,
  templateId?: string,
): Promise<InvoiceSendDraft | null> {
  const row = await loadInvoiceForSend(database, tenantId, invoiceId)
  if (!row) return null

  const recipient = await resolveRecipient(database, tenantId, row.contactId)
  /**
   * Switching the template in the dialog prepares again *here* rather than
   * resolving anything in the browser. Rule 14 asks that placeholders are
   * filled when the dialog is prepared and never at send time; a second
   * preparation is still a preparation, and it keeps the one resolver.
   *
   * A named template that has meanwhile been deleted falls back to the default
   * instead of failing — the answer says which one was actually used.
   */
  const template =
    (templateId ? await getEmailTemplate(database, tenantId, templateId) : null) ??
    (await defaultEmailTemplate(database, tenantId))
  const [smtp] = await database
    .select({ id: smtpSettings.id })
    .from(smtpSettings)
    .where(eq(smtpSettings.tenantId, tenantId))
    .limit(1)

  const values = {
    number: row.number ?? '',
    date: formatBerlinDate(`${row.invoiceDate}T12:00:00.000Z`),
    total: row.totalCents,
    name: recipient.name,
  }

  const subject = applyPlaceholders(template?.subject ?? '', values)
  const body = applyPlaceholders(template?.body ?? '', values)

  /**
   * Only what the dialog cannot mend. A missing address and a missing template
   * are *gaps in the prefill*, not blocks: both can be filled in by hand, and
   * treating them as blocks is what left the send button disabled after an
   * address had been typed in. They travel as flags below, and the screen
   * decides when they stop applying.
   */
  const blockedReason =
    row.status === 'draft'
      ? messages.invoiceSend.draftNotSendable
      : !smtp
        ? messages.invoiceSend.smtpMissing
        : null

  return {
    recipient: recipient.email,
    recipientName: recipient.name,
    subject,
    body,
    templateId: template?.id ?? null,
    canSend: blockedReason === null,
    blockedReason,
    recipientAddressMissing: recipient.email === null,
    templateMissing: template === null,
    // Both halves, so a stray `{{kontonummer}}` in either is visible before
    // anything goes out rather than to the recipient afterwards.
    unknownPlaceholders: [
      ...new Set([...unknownPlaceholders(subject), ...unknownPlaceholders(body)]),
    ],
  }
}

export type SendDeps = {
  transport: MailTransport
  from: MailAddress
  store: FileStore
}

/**
 * Sends, and records the attempt either way.
 *
 * The order matters: the row is written **before** this function returns or
 * throws, so a client that navigated away still finds out what happened.
 */
export async function sendInvoice(
  database: Database,
  tenantId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceSendInput,
  deps: SendDeps,
): Promise<InvoiceSend> {
  const row = await loadInvoiceForSend(database, tenantId, invoiceId)
  if (!row) throw new InvoiceNotSendableError(messages.invoice.notFound)

  // Refused here so the message is a sentence; the foreign key and
  // `invoice_draft_fields` make the state unreachable anyway.
  if (row.status === 'draft') {
    throw new InvoiceNotSendableError(messages.invoiceSend.draftNotSendable)
  }

  const path = await getStoredPdfPath(database, tenantId, invoiceId)
  if (!path) throw new InvoiceNotSendableError(messages.invoice.pdfMissing)

  let pdf: Uint8Array
  try {
    pdf = await deps.store.read(path)
  } catch {
    throw new InvoiceNotSendableError(messages.invoice.pdfMissing)
  }

  const message = buildInvoiceMail({
    from: deps.from,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    pdf,
    number: row.number ?? 'Rechnung',
  })

  let error: string | null = null
  try {
    await deps.transport.send(message)
  } catch (caught) {
    // The server's answer usually quotes the address. It belongs on the row,
    // never in the log stream.
    error = caught instanceof Error ? caught.message : 'Unbekannter Fehler.'
  }

  const [written] = await database
    .insert(invoiceSend)
    .values({
      id: newId(),
      tenantId,
      invoiceId,
      recipient: input.recipient,
      subject: input.subject,
      ok: error === null,
      error,
      sentBy: userId,
    })
    .returning({
      id: invoiceSend.id,
      sentAt: invoiceSend.sentAt,
      recipient: invoiceSend.recipient,
      subject: invoiceSend.subject,
      ok: invoiceSend.ok,
      error: invoiceSend.error,
    })

  if (!written) throw new Error('send log row vanished within its own insert')

  return { ...written, sentAt: written.sentAt.toISOString(), sentByName: null }
}

/**
 * The test send.
 *
 * It takes **no recipient** — the address is the configured sender, and there
 * is no parameter through which another one could arrive (CLAUDE.md rule 14).
 * Not recorded in the log either: it belongs to no invoice.
 */
export async function sendTestMail(deps: {
  transport: MailTransport
  from: MailAddress
}): Promise<{ ok: boolean; recipient: string; error: string | null }> {
  const message = buildTestMail(
    deps.from,
    messages.invoiceSend.testBody,
    messages.invoiceSend.testSubject,
  )

  try {
    await deps.transport.send(message)
    return { ok: true, recipient: message.to, error: null }
  } catch (caught) {
    return {
      ok: false,
      recipient: message.to,
      error: caught instanceof Error ? caught.message : 'Unbekannter Fehler.',
    }
  }
}
