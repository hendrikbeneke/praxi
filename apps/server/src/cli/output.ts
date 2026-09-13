/**
 * Everything the CLI says, in one place.
 *
 * Not pino: a log stream is a record kept for later, and this is a conversation
 * with whoever is standing at the terminal. The rule from CLAUDE.md rule 12
 * holds all the same — no contact names, no note text, no clinical content.
 * What these commands do print is practice identity (a practice name, a
 * practitioner's own email) and ids, which is what the operator asked to see.
 */

const STEP_WIDTH = 18

export type Output = {
  /** A plain line on stdout. */
  line(text?: string): void
  /** `  roles             3 created` — the running account of a long command. */
  step(name: string, result: string): void
  /** `  tenant id   019a…` — a fact the operator takes away with them. */
  fact(name: string, value: string): void
  /** stderr, for everything that went wrong. */
  problem(text: string): void
}

export function createOutput(): Output {
  return {
    line(text = '') {
      process.stdout.write(`${text}\n`)
    },
    step(name, result) {
      process.stdout.write(`  ${name.padEnd(STEP_WIDTH)}${result}\n`)
    },
    fact(name, value) {
      process.stdout.write(`  ${name.padEnd(12)}${value}\n`)
    },
    problem(text) {
      process.stderr.write(`${text}\n`)
    },
  }
}
