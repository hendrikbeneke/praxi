import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs this config in its own process, so the root .env has to be
// loaded here as well. Two levels up from apps/server is the repository root.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // no .env file — rely on the ambient environment
}

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url },
  verbose: true,
  strict: true,
})
