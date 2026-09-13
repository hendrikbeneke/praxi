import { newTenantSchema, newUserSchema } from '@praxi/shared'
import { createTenant } from '../../domain/tenant.js'
import { createUser, emailTaken } from '../../domain/user.js'
import { newId } from '../../id.js'
import { applyCatalogues } from '../catalogues.js'
import { booleanOption, type Command, stringOption } from '../command.js'
import { CliError } from '../errors.js'
import { findPractice } from '../provision.js'
import { readStdin, resolveConfirm, resolveSecret, resolveValue, zodParser } from '../resolve.js'

/**
 * A tenant with its first user — the command a practice is set up with.
 *
 * **No invented data.** The practice name is asked for; address, tax number,
 * bank details and the service catalogue stay empty, because a placeholder in a
 * real practice's settings is read as a record that exists rather than as a gap
 * to fill. What is created besides the structure is the catalogues from
 * `seeds/default`, through the same domain functions the settings screens call.
 *
 * **It resumes.** Nothing is written down about what it did; each step reads
 * what is there and creates what is missing, so a run that broke off halfway is
 * continued by running it again. The one thing it asks before touching anything
 * is whether an existing practice of the same name is the one meant — nobody
 * should end up working in a tenant they did not know was there.
 */

/** What is left to do in the application afterwards. One list, one place;
 *  DEPLOY.md points here rather than keeping a second copy. */
const BY_HAND: readonly string[] = [
  '"Praxis-Stammdaten": address, phone, email, website, tax number, bank details',
  '"Öffnungszeiten" — empty means "not configured", not "closed all week"',
  '"Briefbogen (PDF-Vorlage)" — the letterhead invoices are printed onto',
  '"Rechnungs-Nummernkreis" — does NOT create itself; without it, finalizing fails',
  '"Textbausteine" — at least one intro and one outro, one of each as default',
  '"Leistungen" — the service catalogue starts empty, on purpose',
  '"Mailkonto" and "Mailvorlagen" — nothing is seeded there either',
  '"Google-Kalender" — connect, pick the calendar, check the event-title template',
]

export const tenantCreate: Command = {
  path: ['tenant', 'create'],
  scope: 'tenant',
  summary: 'Create a tenant with its first user and the starting catalogues',
  options: {
    'practice-name': { type: 'string', describe: 'The practice name', placeholder: 'text' },
    email: { type: 'string', describe: "The first user's email", placeholder: 'address' },
    name: { type: 'string', describe: "The first user's name", placeholder: 'text' },
    password: {
      type: 'string',
      describe: 'Lands in the shell history and the process table — prefer being asked',
      placeholder: 'text',
    },
    'password-stdin': { type: 'boolean', describe: 'Read the password from stdin instead' },
    'no-catalogues': { type: 'boolean', describe: 'Create the tenant without the catalogues' },
    resume: {
      type: 'boolean',
      describe: 'Add to an existing practice of that name without asking',
    },
  },
  notes: [
    'Run it again to continue where it stopped: every step reads what is there.',
    'The service catalogue stays empty — a copied price cannot be corrected later.',
  ],

  async run({ values, input, prompts, out, tenants, asTenant }) {
    const practiceName = await resolveValue({
      flag: '--practice-name',
      question: 'Practice name:',
      given: stringOption(values, 'practice-name'),
      input,
      prompts,
      parse: zodParser(newTenantSchema.shape.practiceName),
    })

    // Before anything is written: is this practice already here? Under the
    // policies a command cannot see that for itself, so it is asked of the
    // directory (`cli/owner.ts`), which is the one thing looking across tenants.
    const found = await findPractice(
      tenants,
      practiceName,
      'Use `praxi user add --tenant <id>` for a user, and rename one of them.',
    )
    if (found) {
      const proceed = await resolveConfirm({
        flag: '--resume',
        question: `Practice "${practiceName}" already exists (tenant ${found.id}, ${found.userCount} user(s)). Add to it?`,
        given: booleanOption(values, 'resume'),
        input,
        prompts,
        refusal: `Practice "${practiceName}" already exists (tenant ${found.id})`,
      })
      if (!proceed) throw new CliError('Nothing done.')
    }

    const tenantId = found?.id ?? newId()
    out.line()
    out.line(
      found
        ? `Practice "${practiceName}" exists — continuing.`
        : `Practice "${practiceName}" is new.`,
    )
    out.line()

    const email = await resolveValue({
      flag: '--email',
      question: 'Email of the first user:',
      given: stringOption(values, 'email'),
      input,
      prompts,
      parse: zodParser(newUserSchema.shape.email),
    })

    // Asked before the name and the password, so that resuming into a tenant
    // whose user is already there does not extract a password to throw away.
    const userExists =
      found !== undefined && (await asTenant(tenantId, (tx) => emailTaken(tx, email)))

    if (userExists) {
      out.step('structure', `already present — ${email} can sign in`)
    } else {
      const userName = await resolveValue({
        flag: '--name',
        question: 'Name of the first user:',
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

      if (found) {
        await asTenant(tenantId, (tx) =>
          createUser(tx, tenantId, { email, name: userName, password }),
        )
        out.step('structure', 'user added to the existing practice')
      } else {
        // `app.tenant_id` is set to the id this is about to create, and the
        // policy on `tenant` (`id = app.tenant_id`, WITH CHECK) then permits
        // this one tenant and no other. Nothing here runs as the owner.
        await asTenant(tenantId, (tx) =>
          createTenant(tx, tenantId, {
            practiceName,
            user: { email, name: userName, password },
          }),
        )
        out.step('structure', 'tenant, practice settings, user, 2 system relation types')
      }
    }

    if (booleanOption(values, 'no-catalogues')) {
      out.step('catalogues', 'skipped (--no-catalogues)')
    } else {
      await applyCatalogues({
        tenantId,
        run: (work) => asTenant(tenantId, work),
        onStep: (step) => {
          const parts = [`${step.created} created`]
          if (step.alreadyPresent > 0) parts.push(`${step.alreadyPresent} already present`)
          out.step(step.label, parts.join(', '))
        },
      })
    }

    out.step('services', 'none — enter your own under "Leistungen"')

    out.line()
    out.fact('tenant id', tenantId)
    out.fact('practice', practiceName)
    out.fact('user', email)

    out.line()
    out.line('Still to enter by hand, in the application:')
    for (const item of BY_HAND) out.line(`  · ${item}`)
    out.line()
  },
}
