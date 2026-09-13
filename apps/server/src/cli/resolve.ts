import type { z } from 'zod'
import { UsageError } from './errors.js'
import type { Prompts } from './prompt.js'

/**
 * Argument → otherwise ask → otherwise refuse.
 *
 * One rule, and the whole of what makes these commands usable by hand and by a
 * script at once. `'refuse'` is what `--no-input` produces, and also what the
 * absence of a terminal produces on its own: a command in a pipe cannot be
 * asked anything, so it says which flag is missing instead of waiting for an
 * answer that will never come.
 *
 * **The same schema validates both paths; only the reaction differs.** An
 * answer typed at a prompt that does not parse is asked again. An argument that
 * does not parse aborts — a script cannot be asked a second time, and carrying
 * on with a value nobody checked is the one thing that must not happen.
 */

export type InputMode = 'ask' | 'refuse'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

/** The bridge from a shared Zod schema to the resolver, so a field is checked
 *  here exactly as the API checks it. */
export function zodParser<T>(schema: z.ZodType<T>): (raw: string) => ParseResult<T> {
  return (raw) => {
    const result = schema.safeParse(raw)
    if (result.success) return { ok: true, value: result.data }
    return { ok: false, message: result.error.issues[0]?.message ?? 'invalid value' }
  }
}

type ResolveOptions<T> = {
  /** As it is typed, `--practice-name`, so the refusal names something real. */
  flag: string
  question: string
  given: string | undefined
  input: InputMode
  prompts: Prompts
  parse: (raw: string) => ParseResult<T>
}

function missing(flag: string): UsageError {
  return new UsageError(`${flag} is required (omit --no-input to be asked for it)`)
}

export async function resolveValue<T>(options: ResolveOptions<T>): Promise<T> {
  const { flag, question, given, input, prompts, parse } = options

  if (given !== undefined) {
    const result = parse(given)
    if (result.ok) return result.value
    throw new UsageError(`${flag}: ${result.message}`)
  }

  if (input === 'refuse') throw missing(flag)

  for (;;) {
    const result = parse(await prompts.text(question))
    if (result.ok) return result.value
    prompts.note(result.message)
  }
}

type ResolveSecretOptions = {
  flag: string
  question: string
  /** Asked a second time, because a typo in the only password of a fresh tenant
   *  locks you out of a tenant nobody else can reach. */
  repeatQuestion: string
  given: string | undefined
  /** Already read from stdin by the caller, if `--password-stdin` was given. */
  fromStdin: string | undefined
  input: InputMode
  prompts: Prompts
  parse: (raw: string) => ParseResult<string>
}

export async function resolveSecret(options: ResolveSecretOptions): Promise<string> {
  const { flag, question, repeatQuestion, given, fromStdin, input, prompts, parse } = options

  const supplied = fromStdin ?? given
  if (supplied !== undefined) {
    const result = parse(supplied)
    if (result.ok) return result.value
    throw new UsageError(
      `${fromStdin === undefined ? flag : '--password-stdin'}: ${result.message}`,
    )
  }

  if (input === 'refuse') {
    throw new UsageError(
      `${flag} is required (or --password-stdin, or omit --no-input to be asked for it)`,
    )
  }

  for (;;) {
    const result = parse(await prompts.secret(question))
    if (!result.ok) {
      prompts.note(result.message)
      continue
    }
    if ((await prompts.secret(repeatQuestion)) !== result.value) {
      prompts.note('The two entries do not match.')
      continue
    }
    return result.value
  }
}

type ResolveConfirmOptions = {
  /** The flag that says yes without being asked — `--resume`, later `--yes`. */
  flag: string
  question: string
  given: boolean
  input: InputMode
  prompts: Prompts
  /** What to say when there is no way to ask and the flag was not given. */
  refusal: string
}

/**
 * A question that cannot be asked is **never** answered with yes. That is the
 * rule the later `tenant delete` needs, stated once here rather than retrofitted
 * around a confirmation somebody has already written.
 */
export async function resolveConfirm(options: ResolveConfirmOptions): Promise<boolean> {
  const { flag, question, given, input, prompts, refusal } = options

  if (given) return true
  if (input === 'refuse') throw new UsageError(`${refusal} (pass ${flag} to do it anyway)`)
  return prompts.confirm(question)
}

/** `--password-stdin`: the way to give a password to an unattended run without
 *  putting it in the shell history or the process table. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}
