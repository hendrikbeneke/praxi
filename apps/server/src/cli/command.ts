import type { Database, Transaction } from '../db/client.js'
import type { Output } from './output.js'
import type { TenantDirectory } from './owner.js'
import type { Prompts } from './prompt.js'
import type { InputMode } from './resolve.js'

/**
 * What a command is, and what it is allowed to reach.
 *
 * The three properties that carry a rule rather than a convenience:
 *
 * - **`scope`.** `'tenant'` is a command that writes inside one tenant and gets
 *   nothing but `asTenant`. `'owner'` needs an `ownerReason` — a *field*, not a
 *   comment, because the help prints it and a test reads it, the same shape as
 *   the `reason` on `PUBLIC_API_ROUTES`. No command declares it today.
 * - **`devOnly`.** Refused by the runner when `NODE_ENV` is `production`,
 *   before `run` is called — so no command file checks it for itself and none
 *   can forget to. It stops the accident and not somebody determined; what is
 *   not bypassable is that `seeds/demo` is absent from the image.
 * - **`options`.** The `parseArgs` specification and the help text are one
 *   structure, so the help cannot describe a flag that is not accepted, nor
 *   miss one that is.
 */

export type OptionSpec = {
  type: 'string' | 'boolean'
  /** One line in the help. */
  describe: string
  /** `--email <address>`; omitted for a boolean. */
  placeholder?: string
}

export type CommandContext = {
  /** What `parseArgs` returned for this command's own options. */
  values: Record<string, string | boolean | undefined>
  input: InputMode
  prompts: Prompts
  out: Output
  tenants: TenantDirectory
  /** The one way a command writes: one transaction, one tenant, under the
   *  policies. */
  asTenant: <T>(tenantId: string, work: (tx: Transaction) => Promise<T>) => Promise<T>
}

export type OwnerCommandContext = CommandContext & {
  /** Bypasses every policy. Only a command that declared why gets this. */
  owner: Database
}

type CommandBase = {
  /** `['tenant', 'create']` — two words, always. One list, one lookup. */
  path: readonly [string, string]
  summary: string
  options: Record<string, OptionSpec>
  /** Extra lines under the usage block: what the command does, and what it
   *  costs to do it the unattended way. */
  notes?: readonly string[]
  /** Local development only; the runner refuses it under production. */
  devOnly?: true
}

export type Command = CommandBase &
  (
    | { scope: 'tenant'; run: (context: CommandContext) => Promise<void> }
    | {
        scope: 'owner'
        /** Why this one legitimately looks past the tenant policies. */
        ownerReason: string
        run: (context: OwnerCommandContext) => Promise<void>
      }
  )

export function commandName(command: Command): string {
  return command.path.join(' ')
}

/** The `parseArgs` `options` object, derived from the one declaration. */
export function parseArgsOptions(command: Command): Record<string, { type: 'string' | 'boolean' }> {
  return Object.fromEntries(
    Object.entries(command.options).map(([name, spec]) => [name, { type: spec.type }]),
  )
}

/** `--email <address>` / `--no-input`, for the usage block. */
export function flagUsage(name: string, spec: OptionSpec): string {
  return spec.placeholder ? `--${name} <${spec.placeholder}>` : `--${name}`
}

/** Reads a string flag. `parseArgs` gives booleans for boolean options, so the
 *  narrowing has to happen somewhere; it happens here, once. */
export function stringOption(
  values: Record<string, string | boolean | undefined>,
  name: string,
): string | undefined {
  const value = values[name]
  return typeof value === 'string' ? value : undefined
}

export function booleanOption(
  values: Record<string, string | boolean | undefined>,
  name: string,
): boolean {
  return values[name] === true
}
