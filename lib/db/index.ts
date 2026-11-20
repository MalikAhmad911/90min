import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/**
 * The database handle.
 *
 * Driver choice: Neon's HTTP driver, not the WebSocket one. Every query from
 * this app is a short, self-contained read or upsert made from a Next route
 * handler, which on a serverless host is a process that may exist for a single
 * request. HTTP needs no connection to keep alive and no pool to drain, so it
 * suits that shape; the WebSocket driver is for long-lived servers and
 * interactive transactions, which this app does not use.
 *
 * The URL is the POOLED one. Many short-lived instances each opening their own
 * Postgres connection is exactly what Neon's pooler exists to absorb.
 * Migrations are the exception and use the direct URL - see drizzle.config.ts.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new DatabaseNotConfiguredError()
  }
  return url
}

/** Thrown when DATABASE_URL is absent, so callers can fall back cleanly. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not set')
    this.name = 'DatabaseNotConfiguredError'
  }
}

/** True when a database is configured at all. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

// Created once per process and reused. `neon()` builds no socket, so this is
// cheap even on a cold start.
let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (!client) {
    client = drizzle(neon(connectionString()), { schema })
  }
  return client
}

export { schema }
