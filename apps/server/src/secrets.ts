import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getEnv } from './env.js'

/**
 * Secrets at rest — the one mechanism, used by everything that has to store a
 * credential.
 *
 * Two of them so far: the Google refresh token (slice 9) and the SMTP password
 * (slice 10). Both are long-lived credentials for accounts that reach further
 * than this software, so neither goes into the database in the clear.
 * AES-256-GCM with a key from the environment: authenticated, so a tampered
 * ciphertext fails loudly instead of decrypting to garbage.
 *
 * This lived in `google/crypto.ts` until slice 10. It moved because it is not
 * Google's — a second copy for mail would have been the beginning of two
 * mechanisms that drift.
 *
 * Short-lived credentials are never stored at all: the Google access token
 * lives in memory for the hour it is valid.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/** A key is 32 bytes as 64 hex characters. `env.ts` checks the shape. */
function readKey(): Buffer | null {
  const hex = getEnv().SECRET_KEY
  return hex ? Buffer.from(hex, 'hex') : null
}

/** Whether a key is configured at all. Without one the areas that need a
 *  secret say "not set up" and refuse to store one; nothing else in the
 *  software cares. */
export function secretKeyConfigured(): boolean {
  return readKey() !== null
}

export class MissingSecretKeyError extends Error {
  constructor() {
    super('SECRET_KEY is not configured')
    this.name = 'MissingSecretKeyError'
  }
}

/**
 * The stored token was encrypted with a different key than the one configured
 * now. Its own error because the answer is a sentence — "the configured key
 * does not match the stored token, please reconnect" — and not a decryption
 * failure nobody can act on. Nothing is deleted automatically: a key set
 * wrongly by accident must not throw a working connection away.
 */
export class SecretKeyMismatchError extends Error {
  constructor() {
    super('the stored refresh token was encrypted with a different key')
    this.name = 'SecretKeyMismatchError'
  }
}

/** First 16 hex of the SHA-256 of the key. Enough to tell two keys apart,
 *  far too little to reconstruct one. */
export function keyFingerprint(): string {
  const key = readKey()
  if (!key) throw new MissingSecretKeyError()
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/** `base64(iv | tag | ciphertext)`. */
export function encryptSecret(plain: string): { cipher: string; fingerprint: string } {
  const key = readKey()
  if (!key) throw new MissingSecretKeyError()

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])

  return {
    cipher: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'),
    fingerprint: keyFingerprint(),
  }
}

export function decryptSecret(stored: string, fingerprint: string): string {
  const key = readKey()
  if (!key) throw new MissingSecretKeyError()
  // Checked before decrypting, so the common cause is named rather than
  // guessed at from an authentication tag failure.
  if (fingerprint !== keyFingerprint()) throw new SecretKeyMismatchError()

  const raw = Buffer.from(stored, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))

  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8')
}
