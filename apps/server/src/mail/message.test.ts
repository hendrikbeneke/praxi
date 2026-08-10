import { describe, expect, it } from 'vitest'
import { buildInvoiceMail, buildTestMail } from './message.js'

/**
 * The assembled message, checked as an object. No transport, no socket, no
 * mail catcher — what a fake returns would prove nothing about what would have
 * gone out (CLAUDE.md rule 14).
 */

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // "%PDF-"

const from = { address: 'praxis@praxi.invalid', name: 'Praxis Müller' }

describe('buildInvoiceMail', () => {
  const message = buildInvoiceMail({
    from,
    recipient: 'kontakt@beispiel.test',
    subject: 'Ihre Rechnung RH-2026-0007',
    body: 'Guten Tag,\n\nanbei Ihre Rechnung.',
    pdf: PDF,
    number: 'RH-2026-0007',
  })

  it('carries sender, recipient, subject and body unchanged', () => {
    expect(message.from).toEqual(from)
    expect(message.to).toBe('kontakt@beispiel.test')
    expect(message.subject).toBe('Ihre Rechnung RH-2026-0007')
    expect(message.text).toBe('Guten Tag,\n\nanbei Ihre Rechnung.')
  })

  it('attaches exactly one PDF, named after the invoice', () => {
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments[0]).toEqual({
      filename: 'RH-2026-0007.pdf',
      content: PDF,
      contentType: 'application/pdf',
    })
  })

  it('keeps the attachment name a safe file name whatever the prefix is', () => {
    const odd = buildInvoiceMail({
      from,
      recipient: 'kontakt@beispiel.test',
      subject: 's',
      body: 'b',
      pdf: PDF,
      number: 'RH/2026 #7',
    })
    expect(odd.attachments[0]?.filename).toBe('RH-2026--7.pdf')
  })

  it('is plain text — no second body to keep in step with the first', () => {
    expect(Object.keys(message).sort()).toEqual(['attachments', 'from', 'subject', 'text', 'to'])
  })
})

describe('buildTestMail', () => {
  /**
   * The safeguard from rule 14, expressed as a signature: there is no
   * recipient parameter, so no address from outside can reach it.
   */
  it('goes to the configured sender and takes no recipient at all', () => {
    const message = buildTestMail(from, 'Test', 'Betreff')

    expect(message.to).toBe(from.address)
    expect(message.from).toEqual(from)
    expect(message.attachments).toHaveLength(0)
    // Two parameters after the sender — text and subject. Nowhere to pass an
    // address; if that ever changes, this fails.
    expect(buildTestMail.length).toBe(3)
  })
})
