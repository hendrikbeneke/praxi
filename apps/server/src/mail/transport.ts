import type { SmtpSecurity } from '@praxi/shared'
import nodemailer from 'nodemailer'
import type { MailMessage } from './message.js'

/**
 * The SMTP transport, and the only place in this software that opens a mail
 * connection.
 *
 * `nodemailer` rather than hand-written SMTP, unlike the Google client in
 * slice 9. The line is drawn where the risk changes: seven JSON calls over
 * HTTPS are worth writing yourself, a stateful line protocol with EHLO
 * negotiation, a STARTTLS upgrade on a live socket, SASL, dot-stuffing, MIME
 * boundaries and RFC 2047 header encoding for the umlauts in a practice name
 * is not. MIME assembled wrongly means a PDF some clients cannot open, and
 * that is discovered at the recipient.
 *
 * It sits behind `MailTransport` so `domain/` never sees it — which is also
 * what lets every test in this slice run without a socket.
 */

/** What the domain sends through. One method, so a fake is three lines. */
export interface MailTransport {
  send(message: MailMessage): Promise<void>
}

export type SmtpConfig = {
  host: string
  port: number
  security: SmtpSecurity
  username: string | null
  password: string | null
}

/** A whole send, connection included, has this long. Long enough for a slow
 *  server and a few megabytes of attachment, short enough that a dead host
 *  does not hold the request open indefinitely. */
export const SEND_TIMEOUT_MS = 30_000
const CONNECTION_TIMEOUT_MS = 20_000

export function createSmtpTransport(config: SmtpConfig): MailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Implicit TLS from the first byte (465) versus a plain connection that is
    // upgraded before anything is sent (587).
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ...(config.username ? { auth: { user: config.username, pass: config.password ?? '' } } : {}),
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
    /**
     * Explicitly off, not left to the default.
     *
     * With logging on, nodemailer writes the SMTP dialogue to stdout — which
     * includes `RCPT TO:<…>`, and that address identifies a patient. Nothing
     * about a mail may reach the log stream (CLAUDE.md rule 12): our own log
     * line for a send carries the invoice id and the outcome, and no more.
     */
    logger: false,
    debug: false,
  })

  return {
    async send(message) {
      await transporter.sendMail({
        from: message.from.name
          ? { name: message.from.name, address: message.from.address }
          : message.from.address,
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.content),
          contentType: attachment.contentType,
        })),
      })
    },
  }
}
