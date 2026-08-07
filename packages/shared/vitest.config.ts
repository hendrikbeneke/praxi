import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Only the sources. Without this, the compiled copies in dist/ run a
    // second time.
    include: ['src/**/*.test.ts'],
  },
})
