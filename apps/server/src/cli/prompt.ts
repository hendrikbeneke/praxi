import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

/**
 * Asking, when there is a terminal to ask at.
 *
 * **Whether asking is possible at all is decided here and nowhere else**:
 * `canAsk()` is false without a TTY, and the resolver then treats the run as if
 * `--no-input` had been given. A command in a pipe or a cron must refuse with
 * the name of the missing flag, never sit waiting for an answer that cannot
 * come.
 */

export function canAsk(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

export type Prompts = {
  text(question: string): Promise<string>
  /** A line back to whoever is typing — "that does not parse, try again".
   *  Part of the conversation, so it belongs with the questions rather than
   *  written straight to stdout by whoever noticed. */
  note(text: string): void
  /** Read with the echo off — see `secret` below for why that is not cosmetic. */
  secret(question: string): Promise<string>
  confirm(question: string): Promise<boolean>
  /** A numbered list. Returns the chosen item. */
  choose<T>(question: string, items: readonly T[], label: (item: T) => string): Promise<T>
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

/**
 * The question is written by us and the readline interface gets a sink for an
 * output, so nothing of what is typed is echoed — readline does the echoing
 * itself in terminal mode, and an output that discards everything is what turns
 * it off. The alternative found everywhere is to reach into `_writeToOutput`,
 * which needs an `any` this project does not allow.
 *
 * **This is why a password should be typed rather than passed.** In `--password`
 * it lands in the shell history, in the process table for anyone else on the
 * machine while the command runs, and in Coolify's command log. Here it lands
 * in none of the three. `--password-stdin` is the third way and the one for
 * scripts: unattended, and out of both the history and the process table.
 */
async function askSecret(question: string): Promise<string> {
  process.stdout.write(question)

  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })

  const rl = createInterface({ input: process.stdin, output: sink, terminal: true })
  try {
    return (await rl.question('')).trim()
  } finally {
    rl.close()
    process.stdout.write('\n')
  }
}

export function createPrompts(): Prompts {
  return {
    text: (question) => ask(`${question} `),

    note(text) {
      process.stdout.write(`  ${text}\n`)
    },

    secret: (question) => askSecret(`${question} `),

    async confirm(question) {
      const answer = (await ask(`${question} [j/N] `)).toLowerCase()
      return answer === 'j' || answer === 'y' || answer === 'ja' || answer === 'yes'
    },

    async choose(question, items, label) {
      if (items.length === 0) throw new Error('nothing to choose from')

      process.stdout.write(`${question}\n`)
      for (const [index, item] of items.entries()) {
        process.stdout.write(`  ${String(index + 1).padStart(2)}  ${label(item)}\n`)
      }

      for (;;) {
        const raw = await ask(`Number [1-${items.length}]: `)
        const index = Number.parseInt(raw, 10)
        const chosen = items[index - 1]
        if (chosen !== undefined) return chosen
        this.note(`Not a number between 1 and ${items.length}.`)
      }
    },
  }
}
