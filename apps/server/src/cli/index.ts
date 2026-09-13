import { parseArgs } from 'node:util'
import { closeDatabase } from '../db/client.js'
import { EmailTakenError } from '../domain/user.js'
import { getEnv, loadEnvFile } from '../env.js'
import { asTenant } from '../middleware/tenant-db.js'
import { type Command, commandName, parseArgsOptions } from './command.js'
import { CliError, EXIT, UsageError } from './errors.js'
import { GLOBAL_OPTIONS, printCommand, printGroup, printOverview } from './help.js'
import { createOutput } from './output.js'
import { createTenantDirectory, ownerDatabase } from './owner.js'
import { canAsk, createPrompts } from './prompt.js'
import { commandsInGroup, findCommand, groups } from './registry.js'

/**
 * One way in, for every administrative command — `praxi tenant create`,
 * `praxi user add`, and the twenty that will follow.
 *
 * What lives here rather than in a command: argument parsing, the help, the
 * refusal of a development command under production, the database handle a
 * command is allowed to have, and the translation of an error into an exit
 * code. A command file contains what that command does and nothing else.
 *
 * **Every command writes through `asTenant`** — one transaction, one tenant,
 * under the row-level-security policies, as `praxi_app`. `tenant create`
 * included: the id is generated before the first statement and the policy on
 * `tenant` (`id = app.tenant_id`, WITH CHECK) then permits that one tenant and
 * no other. The owner's connection is handed out in exactly one place
 * (`cli/owner.ts`) and to no command today.
 */

loadEnvFile()

const out = createOutput()

/**
 * `getEnv()` throws a plain `Error`, which would reach the operator as a stack
 * trace from wherever the first query happened to be. A misconfigured
 * environment is a thing to say in a sentence, once, before anything opens a
 * connection.
 */
function requireEnv(): ReturnType<typeof getEnv> {
  try {
    return getEnv()
  } catch (error) {
    throw new CliError(
      `${error instanceof Error ? error.message : String(error)}\nSee .env.example.`,
    )
  }
}

/**
 * `parseArgs` throws a `TypeError` for an unknown flag or a missing value,
 * which would print as a stack and exit 1 — the code that means "ran and
 * refused". Wrong on both counts: nothing ran, and the message it carries
 * already names the offending flag. It becomes a `UsageError`, which is exit 2.
 */
function parseCommandArgs(
  command: Command,
  argv: readonly string[],
): Record<string, string | boolean | undefined> {
  try {
    return parseArgs({
      args: [...argv],
      options: { ...parseArgsOptions(command), ...GLOBAL_OPTIONS },
      strict: true,
      allowPositionals: false,
    }).values
  } catch (error) {
    throw new UsageError(
      `${error instanceof Error ? error.message : String(error)}\n` +
        `Run \`praxi ${commandName(command)} --help\` for what this command takes.`,
    )
  }
}

function runCommand(command: Command, argv: readonly string[]): Promise<void> {
  const values = parseCommandArgs(command, argv)

  if (values.help === true) {
    printCommand(out, command)
    return Promise.resolve()
  }

  // From the validated environment rather than from `process.env` directly, so
  // an unreadable value refuses instead of reading as "not production".
  if (command.devOnly && requireEnv().NODE_ENV === 'production') {
    throw new CliError(
      `\`${commandName(command)}\` creates invented data and is for local development only.\n` +
        'NODE_ENV is "production".\n' +
        'To create a tenant here, use:  praxi tenant create',
    )
  }

  requireEnv()

  const context = {
    values,
    input: (values['no-input'] === true || !canAsk() ? 'refuse' : 'ask') as 'refuse' | 'ask',
    prompts: createPrompts(),
    out,
    tenants: createTenantDirectory(),
    asTenant,
  }

  return command.scope === 'owner'
    ? command.run({ ...context, owner: ownerDatabase() })
    : command.run(context)
}

function dispatch(argv: readonly string[]): Promise<void> {
  const wantsHelp = argv.includes('--help') || argv.includes('-h')

  if (argv.length === 0 || argv[0] === 'help' || (wantsHelp && argv.length === 1)) {
    printOverview(out)
    return Promise.resolve()
  }

  const command = findCommand(argv)
  if (command) return runCommand(command, argv.slice(2))

  const group = argv[0] ?? ''
  if (groups().includes(group)) {
    if (argv.length === 1 || wantsHelp) {
      printGroup(out, group)
      return Promise.resolve()
    }
    throw new UsageError(
      `Unknown command: ${group} ${argv[1]}\n` +
        `Known: ${commandsInGroup(group).map(commandName).join(', ')}`,
    )
  }

  throw new UsageError(`Unknown command: ${argv.join(' ')}\nRun \`praxi help\` for the list.`)
}

try {
  await dispatch(process.argv.slice(2))
} catch (error) {
  /**
   * A `CliError` prints as one sentence: it is the command reporting an answer,
   * and a stack would add nothing. Anything else prints its stack, deliberately
   * — an unexpected error is a bug in this code, and a friendly line in its
   * place would cost the only evidence there is.
   */
  if (error instanceof EmailTakenError) {
    out.problem(
      `The email address ${error.email} is already taken — by a user in this or another tenant.\n` +
        'Email addresses are unique across ALL tenants, not per tenant: the sign-in form\n' +
        'has no tenant context, so the address is what identifies the user.',
    )
    process.exitCode = EXIT.refused
  } else if (error instanceof CliError) {
    out.problem(error.message)
    process.exitCode = error.exitCode
  } else {
    out.problem(error instanceof Error ? (error.stack ?? error.message) : String(error))
    process.exitCode = EXIT.refused
  }
} finally {
  await closeDatabase()
}
