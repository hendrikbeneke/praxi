import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getEnv } from '../env.js'

/**
 * The refresh token at rest.
 *
 * A refresh token is a long-lived credential for an account that also holds
 * private calendars, so it does not go into the database in the clear.
 * AES-256-GCM with a key from the environment: authenticated, so a tampered
 * ciphertext fails loudly instead of decrypting to garbage.
 *
 * The access token is never stored anywhere — it lives in memory for the hour
 * it is valid and is fetched again after a restart.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/** A key is 32 bytes as 64 hex characters. `env.ts` checks the shape. */
function readKey(): Buffer | null {
  const hex = getEnv().GOOGLE_TOKEN_KEY
  return hex ? Buffer.from(hex, 'hex') : null
}

/** Whether a key is configured at all. Without one the Google area says "not
 *  set up" — connecting is refused, and nothing else in the software cares. */
export function tokenKeyConfigured(): boolean {
  return readKey() !== null
}

export class MissingTokenKeyError extends Error {
  constructor() {
    super('GOOGLE_TOKEN_KEY is not configured')
    this.name = 'MissingTokenKeyError'
  }
}

/**
 * The stored token was encrypted with a different key than the one configured
 * now. Its own error because the answer is a sentence — "the configured key
 * does not match the stored token, please reconnect" — and not a decryption
 * failure nobody can act on. Nothing is deleted automatically: a key set
 * wrongly by accident must not throw a working connection away.
 */
export class TokenKeyMismatchError extends Error {
  constructor() {
    super('the stored refresh token was encrypted with a different key')
    this.name = 'TokenKeyMismatchError'
  }
}

/** First 16 hex of the SHA-256 of the key. Enough to tell two keys apart,
 *  far too little to reconstruct one. */
export function keyFingerprint(): string {
  const key = readKey()
  if (!key) throw new MissingTokenKeyError()
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/** `base64(iv | tag | ciphertext)`. */
export function encryptToken(plain: string): { cipher: string; fingerprint: string } {
  const key = readKey()
  if (!key) throw new MissingTokenKeyError()

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])

  return {
    cipher: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'),
    fingerprint: keyFingerprint(),
  }
}

export function decryptToken(stored: string, fingerprint: string): string {
  const key = readKey()
  if (!key) throw new MissingTokenKeyError()
  // Checked before decrypting, so the common cause is named rather than
  // guessed at from an authentication tag failure.
  if (fingerprint !== keyFingerprint()) throw new TokenKeyMismatchError()

  const raw = Buffer.from(stored, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))

  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8')
}
