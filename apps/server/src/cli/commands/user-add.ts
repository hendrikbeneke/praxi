import { newUserSchema } from '@praxi/shared'
import type { TenantDirectoryEntry } from '../../domain/tenant.js'
import { createUser } from '../../domain/user.js'
import { booleanOption, type Command, type CommandContext, stringOption } from '../command.js'
import { CliError, UsageError } from '../errors.js'
import { readStdin, resolveSecret, resolveValue, zodParser } from '../resolve.js'

/**
 * A further user in a tenant that already exists.
 *
 * The tenant can be named three ways and none of them is a guess: `--tenant`
 * takes an id **or** a practice name — a practice name is never a uuid, so the
 * two cannot be confused — and with neither given, a numbered list is offered.
 * A name matching nothing, or more than one practice, is refused with what was
 * found rather than resolved to the first hit.
 */

async function resolveTenant(context: CommandContext): Promise<TenantDirectoryEntry> {
  const { values, input, prompts, tenants } = context
  const given = stringOption(values, 'tenant')

  if (given !== undefined) {
    const matches = await tenants.byIdOrName(given)
    const only = matches[0]
    if (!only) throw new CliError(`No practice found for "${given}".`)
    if (matches.length > 1) {
      throw new CliError(
        `More than one practice is called "${given}":\n` +
          matches.map((entry) => `  ${entry.id}`).join('\n') +
          '\nName the tenant by its id instead.',
      )
    }
    return only
  }

  if (input === 'refuse') {
    throw new UsageError('--tenant is required (omit --no-input to pick one from a list)')
  }

  const all = await tenants.all()
  if (all.length === 0) throw new CliError('There is no tenant yet. Use `praxi tenant create`.')

  return prompts.choose(
    'Which practice?',
    all,
    (entry) =>
      `${entry.practiceName || '(no practice name)'}  ${entry.id}  ${entry.userCount} user(s)`,
  )
}

export const userAdd: Command = {
  path: ['user', 'add'],
  scope: 'tenant',
  summary: 'Add a user to an existing tenant',
  options: {
    tenant: { type: 'string', describe: 'Tenant id or practice name', placeholder: 'id|name' },
    email: { type: 'string', describe: "The user's email", placeholder: 'address' },
    name: { type: 'string', describe: "The user's name", placeholder: 'text' },
    password: {
      type: 'string',
      describe: 'Lands in the shell history and the process table — prefer being asked',
      placeholder: 'text',
    },
    'password-stdin': { type: 'boolean', describe: 'Read the password from stdin instead' },
  },
  notes: [
    'An email address is unique across ALL tenants, not per tenant: the sign-in',
    'form has no tenant context, so the address is what identifies the user.',
  ],

  async run(context) {
    const { values, input, prompts, out, asTenant } = context

    const tenant = await resolveTenant(context)

    const email = await resolveValue({
      flag: '--email',
      question: 'Email:',
      given: stringOption(values, 'email'),
      input,
      prompts,
      parse: zodParser(newUserSchema.shape.email),
    })

    const name = await resolveValue({
      flag: '--name',
      question: 'Name:',
      given: stringOption(values, 'name'),
      input,
      prompts,
      parse: zodParser(newUserSchema.shape.name),
    })

    const password = await resolveSecret({
      flag: '--password',
      question: 'Password:',
      repeatQuestion: 'Repeat password:',
      given: stringOption(values, 'password'),
      fromStdin: booleanOption(values, 'password-stdin') ? await readStdin() : undefined,
      input,
      prompts,
      parse: zodParser(newUserSchema.shape.password),
    })

    const created = await asTenant(tenant.id, (tx) =>
      createUser(tx, tenant.id, { email, name, password }),
    )

    out.line()
    out.line('User created.')
    out.line()
    out.fact('practice', tenant.practiceName || '(no practice name)')
    out.fact('tenant id', tenant.id)
    out.fact('user', created.email)
    out.line()
  },
}
