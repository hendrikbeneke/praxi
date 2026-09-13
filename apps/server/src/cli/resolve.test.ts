import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { UsageError } from './errors.js'
import type { Prompts } from './prompt.js'
import { resolveConfirm, resolveSecret, resolveValue, zodParser } from './resolve.js'

/**
 * The rule that makes these commands usable by hand and by a script at once,
 * tested without a terminal: the prompts are a parameter, so nothing here needs
 * a TTY, and nothing here calls out to anything.
 */

const name = zodParser(z.string().trim().min(3, 'at least three characters'))

/** Records what was asked, and answers from a queue. */
function fakePrompts(answers: readonly string[]): Prompts & { asked: string[]; notes: string[] } {
  const queue = [...answers]
  const asked: string[] = []
  const notes: string[] = []

  const next = (question: string) => {
    asked.push(question)
    const answer = queue.shift()
    if (answer === undefined) throw new Error(`nothing left to answer "${question}" with`)
    return Promise.resolve(answer)
  }

  return {
    asked,
    notes,
    text: next,
    note: (text) => {
      notes.push(text)
    },
    secret: next,
    confirm: (question) => next(question).then((answer) => answer === 'j'),
    choose: (_question, items) => Promise.resolve(items[0] as never),
  }
}

describe('resolveValue', () => {
  it('takes the argument and does not ask', async () => {
    const prompts = fakePrompts([])

    const value = await resolveValue({
      flag: '--name',
      question: 'Name:',
      given: 'Praxis am Wall',
      input: 'ask',
      prompts,
      parse: name,
    })

    expect(value).toBe('Praxis am Wall')
    expect(prompts.asked).toEqual([])
  })

  it('asks when the value is missing', async () => {
    const prompts = fakePrompts(['Praxis am Wall'])

    expect(
      await resolveValue({
        flag: '--name',
        question: 'Name:',
        given: undefined,
        input: 'ask',
        prompts,
        parse: name,
      }),
    ).toBe('Praxis am Wall')
    expect(prompts.asked).toEqual(['Name:'])
  })

  /** `--no-input`, and equally a run with no terminal to ask at. */
  it('names the missing flag instead of waiting, when it cannot ask', async () => {
    await expect(
      resolveValue({
        flag: '--practice-name',
        question: 'Practice name:',
        given: undefined,
        input: 'refuse',
        prompts: fakePrompts([]),
        parse: name,
      }),
    ).rejects.toThrow(UsageError)

    await expect(
      resolveValue({
        flag: '--practice-name',
        question: 'Practice name:',
        given: undefined,
        input: 'refuse',
        prompts: fakePrompts([]),
        parse: name,
      }),
    ).rejects.toThrow('--practice-name is required')
  })

  /**
   * The same schema validates both paths and only the reaction differs: a typed
   * answer is asked again, an argument aborts. A script cannot be asked twice,
   * and carrying on with a value nobody checked is the thing that must not
   * happen.
   */
  it('asks again after an answer that does not parse', async () => {
    const prompts = fakePrompts(['ab', 'Praxis am Wall'])

    expect(
      await resolveValue({
        flag: '--name',
        question: 'Name:',
        given: undefined,
        input: 'ask',
        prompts,
        parse: name,
      }),
    ).toBe('Praxis am Wall')
    expect(prompts.asked).toHaveLength(2)
    // Said back to whoever is typing, so the second attempt is an informed one.
    expect(prompts.notes).toEqual(['at least three characters'])
  })

  it('aborts on an argument that does not parse, naming the flag', async () => {
    await expect(
      resolveValue({
        flag: '--name',
        question: 'Name:',
        given: 'ab',
        input: 'ask',
        prompts: fakePrompts([]),
        parse: name,
      }),
    ).rejects.toThrow('--name: at least three characters')
  })
})

describe('resolveSecret', () => {
  const password = zodParser(z.string().min(12, 'at least 12 characters'))

  it('asks twice and refuses a mismatch before accepting a repeat', async () => {
    const prompts = fakePrompts([
      'ein langes passwort',
      'ein anderes passwort',
      'ein langes passwort',
      'ein langes passwort',
    ])

    expect(
      await resolveSecret({
        flag: '--password',
        question: 'Password:',
        repeatQuestion: 'Repeat password:',
        given: undefined,
        fromStdin: undefined,
        input: 'ask',
        prompts,
        parse: password,
      }),
    ).toBe('ein langes passwort')
    expect(prompts.asked).toHaveLength(4)
    expect(prompts.notes).toEqual(['The two entries do not match.'])
  })

  /** `--password-stdin` is what an unattended run uses; it beats `--password`,
   *  which is the one that lands in the shell history. */
  it('prefers what came in on stdin over the flag', async () => {
    expect(
      await resolveSecret({
        flag: '--password',
        question: 'Password:',
        repeatQuestion: 'Repeat password:',
        given: 'aus dem argument',
        fromStdin: 'von der standardeingabe',
        input: 'refuse',
        prompts: fakePrompts([]),
        parse: password,
      }),
    ).toBe('von der standardeingabe')
  })

  it('names --password-stdin and --password when it cannot ask', async () => {
    await expect(
      resolveSecret({
        flag: '--password',
        question: 'Password:',
        repeatQuestion: 'Repeat password:',
        given: undefined,
        fromStdin: undefined,
        input: 'refuse',
        prompts: fakePrompts([]),
        parse: password,
      }),
    ).rejects.toThrow('--password-stdin')
  })
})

describe('resolveConfirm', () => {
  /**
   * The rule the later `tenant delete` needs, and the reason it is written down
   * now: a question that cannot be asked is never answered with yes.
   */
  it('refuses rather than assuming yes when it cannot ask', async () => {
    await expect(
      resolveConfirm({
        flag: '--resume',
        question: 'Add to it?',
        given: false,
        input: 'refuse',
        prompts: fakePrompts([]),
        refusal: 'Practice "Praxis am Wall" already exists',
      }),
    ).rejects.toThrow('pass --resume to do it anyway')
  })

  it('takes the flag as the answer without asking', async () => {
    const prompts = fakePrompts([])

    expect(
      await resolveConfirm({
        flag: '--resume',
        question: 'Add to it?',
        given: true,
        input: 'refuse',
        prompts,
        refusal: 'exists',
      }),
    ).toBe(true)
    expect(prompts.asked).toEqual([])
  })

  it('asks when it can', async () => {
    expect(
      await resolveConfirm({
        flag: '--resume',
        question: 'Add to it?',
        given: false,
        input: 'ask',
        prompts: fakePrompts(['j']),
        refusal: 'exists',
      }),
    ).toBe(true)
  })
})
