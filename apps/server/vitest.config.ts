import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The domain layer is tested against a real Postgres — triggers and
    // constraints are part of the rules being tested, and from slice 5 on they
    // cannot be tested any other way. Each worker gets its own database; see
    // src/test/database-url.ts.
    globalSetup: ['src/test/global-setup.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Argon2 hashing dominates the auth tests; the default is plenty of time,
    // but a cold first hash on a loaded machine is not instant.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
