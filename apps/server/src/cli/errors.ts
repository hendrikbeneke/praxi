/**
 * Three exit codes, because a script has to tell three things apart.
 *
 *   0  done
 *   1  ran and refused — the email is taken, the tenant is unknown, the
 *      database said no. The command worked; the answer was no.
 *   2  called wrongly — unknown command, unknown flag, a value missing under
 *      `--no-input`. Nothing was attempted.
 *
 * Collapsing 1 and 2 would make "I typed it wrong" indistinguishable from "it
 * refused", which is exactly the distinction an unattended caller needs.
 */
export const EXIT = {
  ok: 0,
  refused: 1,
  usage: 2,
} as const

/**
 * A failure the command is reporting, not suffering: it prints as one sentence
 * with no stack, because a stack here would say nothing the sentence does not.
 *
 * Anything that is NOT one of these prints its stack, deliberately — an
 * unexpected error is a bug in this code, and hiding it behind a friendly line
 * would cost the only evidence there is.
 */
export class CliError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode: number = EXIT.refused) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

/** Wrong call, nothing attempted. Carries the usage exit code. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT.usage)
    this.name = 'UsageError'
  }
}
