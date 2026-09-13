import { type NewUserInput, newUserSchema } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { account, appUser } from '../db/schema.js'
import { newId } from '../id.js'
import { hashPassword } from './auth.js'

/**
 * Bringing a user into being — the one place it happens.
 *
 * There were three before this file: `db/seed/base.ts`, the demo seed and
 * `test/fixtures.ts`, each with the same two inserts written out again. They
 * had already drifted in what they wrote around them, which is the reason this
 * exists rather than a wish for tidiness.
 */

/**
 * The email is unique across ALL tenants, not per tenant, and that is a
 * decision from slice 1 rather than an oversight: the sign-in form has no
 * tenant context, so the address is what identifies the user. The message says
 * so, because the surprise is real — a practice may well try to use the same
 * address in a second tenant.
 *
 * The global unique index refuses it too and stays the backstop; this exists so
 * that what reaches a caller is a sentence and not a constraint name.
 */
export class EmailTakenError extends Error {
  constructor(readonly email: string) {
    super(`email already taken: ${email}`)
    this.name = 'EmailTakenError'
  }
}

export type CreatedUser = {
  id: string
  email: string
  name: string
}

/**
 * The user and its credential, in **one** transaction.
 *
 * Since S-B the password does not live on `app_user` but in `account` with
 * `provider_id = 'credential'`, which is where Better Auth keeps every
 * authentication method. A user without that row exists and cannot sign in —
 * a state worth making unreachable rather than merely avoiding, so the two
 * inserts are never apart.
 *
 * `issuer` and `account_id` are what the library itself writes for a password
 * account (`createLocalAccountIssuer('credential')`, and the user's own id);
 * the unique index is on those two.
 */
export async function createUser(
  database: Database,
  tenantId: string,
  input: NewUserInput,
): Promise<CreatedUser> {
  const { email, name, password } = newUserSchema.parse(input)

  const [taken] = await database
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1)
  if (taken) throw new EmailTakenError(email)

  const id = newId()
  const passwordHash = await hashPassword(password)

  return database.transaction(async (tx) => {
    await tx.insert(appUser).values({ id, tenantId, email, name })
    await tx.insert(account).values({
      id: newId(),
      userId: id,
      issuer: 'local:credential',
      accountId: id,
      providerId: 'credential',
      password: passwordHash,
    })
    return { id, email, name }
  })
}

/**
 * Whether the address is already spoken for, anywhere.
 *
 * The same query `createUser` makes before it writes, exposed because a caller
 * sometimes needs the answer *before* it has anything else to offer — the CLI
 * asks for an email while resuming into an existing tenant and must not go on
 * to ask for a password it is about to throw away.
 */
export async function emailTaken(database: Database, email: string): Promise<boolean> {
  const [row] = await database
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email.trim().toLowerCase()))
    .limit(1)
  return row !== undefined
}
