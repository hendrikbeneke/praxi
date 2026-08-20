import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ContactInput, Invoice } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { contact, emailTemplate, invoiceSend, service, smtpSettings } from '../db/schema.js'
import { newId } from '../id.js'
import type { MailMessage } from '../mail/message.js'
import type { MailTransport } from '../mail/transport.js'
import { renderInvoicePdf } from '../pdf/render.js'
import { createTenant, createUser, finalizeDocument } from '../test/fixtures.js'
import { createActivity } from './activity.js'
import { listBillableItems } from './billable.js'
import { createContact } from './contact.js'
import { addRelation } from './contact-relation.js'
import { FileStore } from './file-store.js'
import { createInvoice, getInvoice } from './invoice.js'
import {
  InvoiceNotSendableError,
  listSends,
  prepareSend,
  resolveRecipient,
  sendInvoice,
  sendTestMail,
} from './invoice-send.js'
import { upsertNumberRange } from './number-range.js'
import { getSmtpSettings, loadSmtpConfig, saveSmtpSettings } from './smtp-settings.js'

/**
 * Sending, against a real database and a fake transport.
 *
 * No test here opens a socket — not to a server, not to a mail catcher, not to
 * localhost. `nodemailer` is not even imported. The assertions run on the
 * message that was handed to the transport.
 */

const INVOICE_DATE = '2026-09-01'
const PRICE = 13_500

let tenantId: string
let userId: string
let contactId: string
let serviceId: string
let store: FileStore
let storeRoot: string

/** Collects what it was asked to send, and fails on command. */
function fakeTransport(): { sent: MailMessage[]; fail: Error | null; transport: MailTransport } {
  const box: { sent: MailMessage[]; fail: Error | null; transport: MailTransport } = {
    sent: [],
    fail: null,
    transport: {
      async send(message) {
        if (box.fail) throw box.fail
        box.sent.push(message)
      },
    },
  }
  return box
}

const FROM = { address: 'praxis@praxi.invalid', name: 'Testpraxis' }

function person(overrides: Partial<Extract<ContactInput, { kind: 'person' }>> = {}): ContactInput {
  return {
    kind: 'person',
    salutationId: null,
    title: null,
    firstName: 'Erika',
    lastName: 'Testperson',
    dateOfBirth: null,
    birthPlace: null,
    genderId: null,
    vatId: null,
    street: 'Teststraße',
    houseNumber: '1',
    postalCode: '12345',
    city: 'Teststadt',
    countryId: null,
    email: 'erika@praxi.invalid',
    phoneMobile: null,
    phoneLandline: null,
    internalNote: null,
    diagnosis: null,
    roles: [],
    ...overrides,
  }
}

beforeEach(async () => {
  tenantId = await createTenant(db())
  userId = (await createUser(db(), { tenantId })).id
  contactId = (await createContact(db(), tenantId, person())).id

  serviceId = newId()
  await db()
    .insert(service)
    .values({ id: serviceId, tenantId, description: 'Erstgespräch', defaultPriceCents: PRICE })

  await upsertNumberRange(db(), tenantId, 'invoice', {
    prefix: 'RH-2026-',
    padding: 3,
    nextValue: 7,
  })

  await db().insert(emailTemplate).values({
    id: newId(),
    tenantId,
    name: 'Standard',
    subject: 'Ihre Rechnung {{number}}',
    body: 'Guten Tag {{name}},\n\nanbei Ihre Rechnung vom {{date}} über {{total}}.',
    isDefault: true,
  })

  await db().insert(smtpSettings).values({
    id: newId(),
    tenantId,
    host: 'mail.praxi.invalid',
    port: 587,
    security: 'starttls',
    username: 'praxis',
    fromAddress: FROM.address,
    fromName: FROM.name,
  })

  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-send-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
})

const render = (entry: Invoice) => renderInvoicePdf(entry, null)

async function draft(): Promise<Invoice> {
  await createActivity(db(), tenantId, {
    contactId,
    type: 'session',
    status: 'rendered',
    occurredAt: `${INVOICE_DATE}T07:00:00.000Z`,
    durationMin: 90,
    title: null,
    internalNote: null,
    items: [{ kind: 'service', serviceId, quantity: 1, billable: true }],
    appointment: null,
  })

  const items = await listBillableItems(db(), tenantId, contactId)
  return createInvoice(db(), tenantId, {
    contactId,
    invoiceDate: INVOICE_DATE,
    activityItemIds: items.map((item) => item.id),
  })
}

async function finalized(): Promise<Invoice> {
  const entry = await finalizeDocument(db(), tenantId, store, (await draft()).id, render)
  if (!entry) throw new Error('the invoice was not finalized')
  return entry
}

const send = (
  invoiceId: string,
  transport: MailTransport,
  overrides: Partial<{ recipient: string; subject: string; body: string }> = {},
) =>
  sendInvoice(
    db(),
    tenantId,
    userId,
    invoiceId,
    {
      recipient: overrides.recipient ?? 'erika@praxi.invalid',
      subject: overrides.subject ?? 'Ihre Rechnung',
      body: overrides.body ?? 'Anbei.',
    },
    { transport, from: FROM, store },
  )

describe('the message that goes out', () => {
  it('carries the stored document as its one attachment', async () => {
    const entry = await finalized()
    const box = fakeTransport()

    await send(entry.id, box.transport)

    expect(box.sent).toHaveLength(1)
    const message = box.sent[0]
    expect(message?.to).toBe('erika@praxi.invalid')
    expect(message?.from).toEqual(FROM)
    expect(message?.attachments).toHaveLength(1)
    expect(message?.attachments[0]?.filename).toBe('RH-2026-007.pdf')
    expect(message?.attachments[0]?.contentType).toBe('application/pdf')
    // The bytes from disk, not a fresh render (rule 9).
    expect([...(message?.attachments[0]?.content ?? []).slice(0, 5)]).toEqual([
      0x25, 0x50, 0x44, 0x46, 0x2d,
    ])
  })
})

describe('what may be sent', () => {
  it('refuses a draft with a sentence', async () => {
    const entry = await draft()
    const box = fakeTransport()

    await expect(send(entry.id, box.transport)).rejects.toBeInstanceOf(InvoiceNotSendableError)
    expect(box.sent).toHaveLength(0)
    expect(await listSends(db(), tenantId, entry.id)).toHaveLength(0)
  })

  it('says so in the draft rather than letting the button be pressed', async () => {
    const entry = await draft()
    const prepared = await prepareSend(db(), tenantId, entry.id)

    expect(prepared?.canSend).toBe(false)
    expect(prepared?.blockedReason).toContain('Rechnungsentwurf')
  })

  /**
   * A missing address is a **gap in the prefill**, not a block.
   *
   * It used to be one, and the consequence showed up on screen: the send
   * button stayed disabled after an address had been typed in by hand, because
   * `canSend` had been decided from loaded data and outlived the reason it was
   * decided from. `blockedReason` now covers only what typing cannot mend —
   * a draft, or no SMTP account — and the gap travels as its own flag that the
   * screen stops honouring once the field holds an address.
   */
  it('reports a missing address as a gap and not as a block', async () => {
    await db().update(contact).set({ email: null }).where(eq(contact.id, contactId))
    const entry = await finalized()

    const prepared = await prepareSend(db(), tenantId, entry.id)
    expect(prepared?.recipient).toBeNull()
    expect(prepared?.recipientAddressMissing).toBe(true)
    expect(prepared?.canSend).toBe(true)
    expect(prepared?.blockedReason).toBeNull()
  })
})

describe('the log', () => {
  it('records a successful attempt and derives the last send from it', async () => {
    const entry = await finalized()
    const box = fakeTransport()

    const result = await send(entry.id, box.transport)
    expect(result.ok).toBe(true)
    expect(result.error).toBeNull()

    const rows = await listSends(db(), tenantId, entry.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ recipient: 'erika@praxi.invalid', ok: true, error: null })
    expect(rows[0]?.sentByName).toBe('Test Behandler')

    const reread = await getInvoice(db(), tenantId, entry.id)
    expect(reread?.lastSentTo).toBe('erika@praxi.invalid')
    expect(reread?.lastSentAt).not.toBeNull()
  })

  it('records a failed attempt too, and leaves the invoice alone', async () => {
    const entry = await finalized()
    const box = fakeTransport()
    box.fail = new Error('550 5.1.1 <erika@praxi.invalid> user unknown')

    const result = await send(entry.id, box.transport)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('550')

    const rows = await listSends(db(), tenantId, entry.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ok).toBe(false)

    // Nothing on the invoice moved: a failed send is not a send.
    const reread = await getInvoice(db(), tenantId, entry.id)
    expect(reread?.lastSentAt).toBeNull()
    expect(reread?.lastSentTo).toBeNull()
  })

  it('keeps every attempt — that is what replaces a retry mechanism', async () => {
    const entry = await finalized()
    const box = fakeTransport()

    box.fail = new Error('451 4.7.1 greylisted')
    await send(entry.id, box.transport)
    await send(entry.id, box.transport)
    box.fail = null
    await send(entry.id, box.transport, { recipient: 'zweite@beispiel.test' })

    const rows = await listSends(db(), tenantId, entry.id)
    expect(rows).toHaveLength(3)
    expect(rows.filter((row) => row.ok)).toHaveLength(1)

    // The derived value follows the last *successful* one, not the last row.
    const reread = await getInvoice(db(), tenantId, entry.id)
    expect(reread?.lastSentTo).toBe('zweite@beispiel.test')
  })

  it('writes the row before answering, so a lost response loses nothing', async () => {
    const entry = await finalized()
    const box = fakeTransport()

    // `sendInvoice` resolves only after the insert; if a client disconnects
    // mid-send the promise still runs to the end and the row is there.
    const result = await send(entry.id, box.transport)
    const [stored] = await db().select().from(invoiceSend).where(eq(invoiceSend.id, result.id))

    expect(stored?.ok).toBe(true)
  })
})

describe('the recipient', () => {
  it('is the contact when no billing recipient is on file', async () => {
    const resolved = await resolveRecipient(db(), tenantId, contactId)
    expect(resolved.email).toBe('erika@praxi.invalid')
    expect(resolved.name).toBe('Erika Testperson')
  })

  it('is the billing recipient where that relation exists', async () => {
    const payer = await createContact(
      db(),
      tenantId,
      person({ firstName: 'Kasse', lastName: 'Zahlstelle', email: 'kasse@beispiel.test' }),
    )
    await addRelation(db(), tenantId, contactId, {
      relationCode: 'billing_recipient',
      // `forward`: the fact belongs to this contact — they *have* a billing
      // recipient — which is the direction convention from rule 4.
      direction: 'forward',
      otherContactId: payer.id,
      since: null,
      replace: false,
    })

    const resolved = await resolveRecipient(db(), tenantId, contactId)
    expect(resolved.email).toBe('kasse@beispiel.test')

    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id)
    expect(prepared?.recipient).toBe('kasse@beispiel.test')
  })
})

describe('the covering note', () => {
  it('opens with the default template and says which one that is', async () => {
    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id)

    const [standard] = await db()
      .select()
      .from(emailTemplate)
      .where(eq(emailTemplate.tenantId, tenantId))

    expect(prepared?.templateId).toBe(standard?.id)
    expect(prepared?.templateMissing).toBe(false)
  })

  /**
   * Switching the template in the dialog prepares again *here*, so the
   * placeholders keep being resolved by one resolver before the text is shown
   * — never in the browser and never at send time (rule 14).
   */
  it('prepares again for another template, with the placeholders resolved', async () => {
    const otherId = newId()
    await db().insert(emailTemplate).values({
      id: otherId,
      tenantId,
      name: 'Kurz',
      subject: 'Rechnung {{number}}',
      body: 'Anbei {{number}} über {{total}}.',
      isDefault: false,
      active: true,
    })

    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id, otherId)

    expect(prepared?.templateId).toBe(otherId)
    expect(prepared?.subject).toBe('Rechnung RH-2026-007')
    // The euro sign arrives with the non-breaking space `Intl` puts there.
    expect(prepared?.body).toContain('Anbei RH-2026-007 über 135,00')
  })

  /** A template deleted in another tab must not turn the dialog into a 404. */
  it('falls back to the default when the named template is gone', async () => {
    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id, newId())

    expect(prepared?.templateId).not.toBeNull()
    expect(prepared?.subject).toBe('Ihre Rechnung RH-2026-007')
  })

  it('says so when there is no template at all', async () => {
    await db().delete(emailTemplate).where(eq(emailTemplate.tenantId, tenantId))
    const entry = await finalized()

    const prepared = await prepareSend(db(), tenantId, entry.id)
    expect(prepared?.templateMissing).toBe(true)
    expect(prepared?.templateId).toBeNull()
    // Still sendable: subject and body can be written by hand.
    expect(prepared?.canSend).toBe(true)
  })
})

describe('placeholders', () => {
  it('are resolved when the dialog opens, so the screen shows what goes out', async () => {
    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id)

    expect(prepared?.subject).toBe('Ihre Rechnung RH-2026-007')
    expect(prepared?.body).toContain('Guten Tag Erika Testperson')
    expect(prepared?.body).toContain('01.09.2026')
    expect(prepared?.body).toContain('135,00')
    expect(prepared?.unknownPlaceholders).toEqual([])
  })

  it('leaves an unknown one standing and names it', async () => {
    await db()
      .update(emailTemplate)
      .set({ body: 'Bitte auf {{kontonummer}} überweisen.' })
      .where(eq(emailTemplate.tenantId, tenantId))

    const entry = await finalized()
    const prepared = await prepareSend(db(), tenantId, entry.id)

    // Left in place rather than emptied — an empty gap reads as if it were
    // meant that way, and the dialog points at this before anything goes out.
    expect(prepared?.body).toContain('{{kontonummer}}')
    expect(prepared?.unknownPlaceholders).toEqual(['kontonummer'])
  })
})

describe('the test send', () => {
  it('goes to the configured sender and takes no recipient', async () => {
    const box = fakeTransport()
    const result = await sendTestMail({ transport: box.transport, from: FROM })

    expect(result.ok).toBe(true)
    expect(result.recipient).toBe(FROM.address)
    expect(box.sent[0]?.to).toBe(FROM.address)
    expect(box.sent[0]?.attachments).toHaveLength(0)
    // Nowhere to pass an address in: the signature takes a transport and a
    // sender, and that is the safeguard (CLAUDE.md rule 14).
    expect(Object.keys(box.sent[0] ?? {})).not.toContain('recipient')
  })

  it('reports a refusal as a result rather than throwing', async () => {
    const box = fakeTransport()
    box.fail = new Error('535 5.7.8 authentication failed')

    const result = await sendTestMail({ transport: box.transport, from: FROM })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('535')
    expect(result.recipient).toBe(FROM.address)
  })
})

describe('the stored password', () => {
  const base = {
    host: 'mail.praxi.invalid',
    port: 587,
    security: 'starttls' as const,
    username: 'praxis',
    fromAddress: 'praxis@praxi.invalid',
    fromName: 'Testpraxis',
  }

  it('never comes back out of the API, only whether one is stored', async () => {
    await saveSmtpSettings(db(), tenantId, { ...base, password: 'geheim-123' })

    const read = await getSmtpSettings(db(), tenantId)
    expect(read?.passwordSet).toBe(true)
    expect(JSON.stringify(read)).not.toContain('geheim-123')
    expect(Object.keys(read ?? {})).not.toContain('password')

    // The one path the plain password takes ends at the transport.
    const config = await loadSmtpConfig(db(), tenantId)
    expect(config?.config.password).toBe('geheim-123')
  })

  it('is stored encrypted, not in the clear', async () => {
    await saveSmtpSettings(db(), tenantId, { ...base, password: 'geheim-123' })

    const [row] = await db().select().from(smtpSettings).where(eq(smtpSettings.tenantId, tenantId))

    expect(row?.passwordCipher).not.toContain('geheim-123')
    expect(row?.keyFingerprint).toMatch(/^[0-9a-f]{16}$/)
  })

  it('survives a save that does not carry one, and clears on an explicit null', async () => {
    await saveSmtpSettings(db(), tenantId, { ...base, password: 'geheim-123' })

    // A form that cannot show the password must not clear it by being saved.
    await saveSmtpSettings(db(), tenantId, { ...base, port: 465, security: 'tls' })
    expect((await getSmtpSettings(db(), tenantId))?.passwordSet).toBe(true)
    expect((await loadSmtpConfig(db(), tenantId))?.config.password).toBe('geheim-123')

    await saveSmtpSettings(db(), tenantId, { ...base, password: null })
    expect((await getSmtpSettings(db(), tenantId))?.passwordSet).toBe(false)
  })
})
