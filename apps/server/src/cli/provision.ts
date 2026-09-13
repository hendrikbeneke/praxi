import type { TenantDirectoryEntry } from '../domain/tenant.js'
import { CliError } from './errors.js'
import type { TenantDirectory } from './owner.js'

/**
 * "Is there already a practice of this name?" — asked by `tenant create` before
 * it writes anything, and by `dev seed` to decide whether it is making a tenant
 * or adding to the one it made last time.
 *
 * **Two matches are refused, never resolved to the first.** A practice name has
 * no unique constraint behind it, and picking one of two would mean working in
 * a tenant nobody chose. The refusal prints the ids, which is what the operator
 * needs in order to say which one they meant.
 */
export async function findPractice(
  tenants: TenantDirectory,
  practiceName: string,
  advice: string,
): Promise<TenantDirectoryEntry | undefined> {
  const matches = await tenants.byName(practiceName)

  if (matches.length > 1) {
    throw new CliError(
      `More than one practice is called "${practiceName}":\n` +
        matches.map((entry) => `  ${entry.id}`).join('\n') +
        `\n${advice}`,
    )
  }

  return matches[0]
}
