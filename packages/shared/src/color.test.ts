import { describe, expect, it } from 'vitest'
import { BLACK, contrastRatio, hexColorSchema, readableTextOn, WHITE } from './color.js'

/** The colours `db/seed/activity-types.ts` starts a tenant with. */
const SEED_COLORS = {
  initial: '#2563eb',
  session: '#0d9488',
  talk: '#d97706',
  consultation: '#7c3aed',
}

describe('hexColorSchema', () => {
  it('normalizes to lower case', () => {
    expect(hexColorSchema.parse(' #2563EB ')).toBe('#2563eb')
  })

  it('refuses anything that is not a six-digit hex triplet', () => {
    for (const value of ['#fff', 'rebeccapurple', '#12345g', '2563eb']) {
      expect(hexColorSchema.safeParse(value).success).toBe(false)
    }
  })
})

describe('readableTextOn', () => {
  it('keeps every seeded colour above the 4.5:1 WCAG AA threshold', () => {
    for (const color of Object.values(SEED_COLORS)) {
      expect(contrastRatio(color, readableTextOn(color))).toBeGreaterThanOrEqual(4.5)
    }
  })

  /**
   * Fixing white as the text colour is what this function exists to avoid: it
   * fails on two of the four seeded colours. If this ever stops failing, the
   * seed changed and the reasoning in `color.ts` needs rereading.
   */
  it('is needed — white alone would fail on teal and amber', () => {
    expect(contrastRatio(SEED_COLORS.session, WHITE)).toBeLessThan(4.5)
    expect(contrastRatio(SEED_COLORS.talk, WHITE)).toBeLessThan(4.5)
  })

  it('picks black on light backgrounds and white on dark ones', () => {
    expect(readableTextOn('#ffffff')).toBe(BLACK)
    expect(readableTextOn('#000000')).toBe(WHITE)
  })

  /**
   * The point of choosing per colour rather than curating a palette: the
   * practitioner may pick anything, and the worst case is a background sitting
   * on the crossover between the two, where both choices give √21 ≈ 4.58:1.
   * Walked over the whole 24-bit space in steps that are dense enough to land
   * next to the crossover on all three axes.
   */
  it('holds for any colour, not only the seeded ones', () => {
    let worst = Number.POSITIVE_INFINITY
    for (let red = 0; red < 256; red += 5) {
      for (let green = 0; green < 256; green += 5) {
        for (let blue = 0; blue < 256; blue += 5) {
          const color = `#${[red, green, blue].map((c) => c.toString(16).padStart(2, '0')).join('')}`
          worst = Math.min(worst, contrastRatio(color, readableTextOn(color)))
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })
})
