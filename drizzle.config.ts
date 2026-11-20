import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'

// drizzle-kit runs outside Next, so it does not get .env.local for free.
config({ path: '.env.local' })

/**
 * Migrations run over the DIRECT connection, not the pooled one.
 *
 * Neon's pooler (PgBouncer in transaction mode) cannot hold the session-level
 * state that DDL and advisory locks need, so a migration run through it can
 * fail or half-apply. The app itself uses the pooled URL - see lib/db/index.ts.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set to run migrations')
}

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Keep generated SQL readable in review.
  verbose: true,
  strict: true,
} satisfies Config
