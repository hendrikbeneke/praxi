/**
 * Assembling the message that goes out.
 *
 * Pure, and deliberately so: this is where the tests look. What a fake
 * transport returns proves nothing about what would have been sent, so the
 * assertions run on the object this function builds — recipient, sender,
 * subject, body, and the one attachment with its bytes and its name.
 *
 * Nothing here reaches the network, reads a file or touches the database.
 */

export type MailAddress = {
  address: string
  /** Optional display name. Encoding it for the header is the transport's
   *  job — "Praxis Müller" needs RFC 2047, and getting that wrong is exactly
   *  the class of mistake nodemailer exists to avoid. */
  name: string | null
}

export type MailAttachment = {
  filename: string
  content: Uint8Array
  contentType: string
}

export type MailMessage = {
  from: MailAddress
  to: string
  subject: string
  /** Plain text only. An invoice mail is a covering note; HTML would add a
   *  second body to keep in step with the first for no gain. */
  text: string
  attachments: MailAttachment[]
}

export type InvoiceMailInput = {
  from: MailAddress
  recipient: string
  subject: string
  body: string
  /** The stored document, read from disk — never re-rendered (rule 9). */
  pdf: Uint8Array
  /** The invoice number. It becomes the file name the recipient sees. */
  number: string
}

/** Everything but the alphanumerics, dash, underscore and dot folded to `-`,
 *  so a number stays a safe file name whatever prefix the range carries. */
function attachmentName(number: string): string {
  return `${number.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`
}

export function buildInvoiceMail(input: InvoiceMailInput): MailMessage {
  return {
    from: input.from,
    to: input.recipient,
    subject: input.subject,
    text: input.body,
    attachments: [
      {
        filename: attachmentName(input.number),
        content: input.pdf,
        contentType: 'application/pdf',
      },
    ],
  }
}

/**
 * The message the test send produces.
 *
 * It takes **no recipient**: the address is the configured sender and nothing
 * else can be passed in. That is the safeguard from CLAUDE.md rule 14 written
 * as a signature rather than as a rule someone has to remember — a button that
 * exists to check the configuration must not become a way to send something to
 * a mistyped address.
 */
export function buildTestMail(from: MailAddress, text: string, subject: string): MailMessage {
  return {
    from,
    to: from.address,
    subject,
    text,
    attachments: [],
  }
}
