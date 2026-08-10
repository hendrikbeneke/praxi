import type { SmtpSettings, SmtpSettingsInput } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { smtpSettings } from '../db/schema.js'
import { newId } from '../id.js'
import type { MailAddress } from '../mail/message.js'
import type { SmtpConfig } from '../mail/transport.js'
import {
  decryptSecret,
  encryptionKeyConfigured,
  encryptSecret,
  keyFingerprint,
} from '../secrets.js'

/**
 * The SMTP account, stored and read back.
 *
 * The password never leaves this module in the clear except towards the
 * transport. `getSmtpSettings` answers with `passwordSet` and no password
 * field of any shape — there is nothing to forget to strip.
 */

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super('no smtp settings are stored')
    this.name = 'SmtpNotConfiguredError'
  }
}

export async function getSmtpSettings(
  database: Database,
  tenantId: string,
): Promise<SmtpSettings | null> {
  const [row] = await database
    .select()
    .from(smtpSettings)
    .where(eq(smtpSettings.tenantId, tenantId))
    .limit(1)

  if (!row) return null

  return {
    host: row.host,
    port: row.port,
    security: row.security,
    username: row.username,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    passwordSet: row.passwordCipher !== null,
    // Named rather than left to fail at an authentication tag, exactly as the
    // Google connection does it.
    keyMismatch:
      row.keyFingerprint !== null &&
      encryptionKeyConfigured() &&
      row.keyFingerprint !== keyFingerprint(),
  }
}

/**
 * Saves the account.
 *
 * The password follows the rule the schema documents: absent or empty leaves
 * the stored one alone — a form that cannot show a password must not clear it
 * by being saved — and an explicit `null` clears it.
 */
export async function saveSmtpSettings(
  database: Database,
  tenantId: string,
  input: SmtpSettingsInput,
): Promise<SmtpSettings> {
  const secret =
    input.password === undefined
      ? undefined
      : input.password === null
        ? { passwordCipher: null, keyFingerprint: null }
        : (() => {
            const { cipher, fingerprint } = encryptSecret(input.password)
            return { passwordCipher: cipher, keyFingerprint: fingerprint }
          })()

  const base = {
    host: input.host,
    port: input.port,
    security: input.security,
    username: input.username,
    fromAddress: input.fromAddress,
    fromName: input.fromName,
  }

  await database
    .insert(smtpSettings)
    .values({
      id: newId(),
      tenantId,
      ...base,
      ...(secret ?? { passwordCipher: null, keyFingerprint: null }),
    })
    .onConflictDoUpdate({
      target: smtpSettings.tenantId,
      set: { ...base, ...(secret ?? {}) },
    })

  const saved = await getSmtpSettings(database, tenantId)
  if (!saved) throw new Error('smtp settings vanished within their own write')
  return saved
}

export async function deleteSmtpSettings(database: Database, tenantId: string): Promise<boolean> {
  const [row] = await database
    .delete(smtpSettings)
    .where(eq(smtpSettings.tenantId, tenantId))
    .returning({ id: smtpSettings.id })

  return row !== undefined
}

/**
 * What the transport needs, password decrypted. The only path the plain
 * password takes, and it ends at the SMTP connection.
 *
 * A key that no longer matches surfaces as `EncryptionKeyMismatchError` from
 * `decryptSecret`, which the route turns into a sentence.
 */
export async function loadSmtpConfig(
  database: Database,
  tenantId: string,
): Promise<{ config: SmtpConfig; from: MailAddress } | null> {
  const [row] = await database
    .select()
    .from(smtpSettings)
    .where(eq(smtpSettings.tenantId, tenantId))
    .limit(1)

  if (!row) return null

  return {
    config: {
      host: row.host,
      port: row.port,
      security: row.security,
      username: row.username,
      password:
        row.passwordCipher && row.keyFingerprint
          ? decryptSecret(row.passwordCipher, row.keyFingerprint)
          : null,
    },
    from: { address: row.fromAddress, name: row.fromName },
  }
}
