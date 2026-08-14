import { describe, expect, it } from 'vitest'
import { practiceSettingsPatchSchema } from './practice-settings.js'

/**
 * The one thing this schema exists to get right: omitting a key must leave
 * it genuinely absent from the parsed result, not reintroduce its default.
 * `practiceSettingsInputSchema.partial()` looks equivalent and is not —
 * Zod applies a field's `.default()` whenever the key is missing, regardless
 * of `.optional()` — which is exactly the trap D4's two independently-saving
 * settings panels (Praxis, Rechnungsstellung) would have fallen into.
 */
describe('practiceSettingsPatchSchema', () => {
  it('produces no keys at all for an empty patch', () => {
    expect(practiceSettingsPatchSchema.parse({})).toEqual({})
  })

  it('does not reintroduce a defaulted field alongside the one that was sent', () => {
    expect(practiceSettingsPatchSchema.parse({ defaultPaymentTermDays: 30 })).toEqual({
      defaultPaymentTermDays: 30,
    })
  })

  it('still folds an explicitly sent empty string to null', () => {
    expect(practiceSettingsPatchSchema.parse({ street: '' })).toEqual({ street: null })
  })
})
