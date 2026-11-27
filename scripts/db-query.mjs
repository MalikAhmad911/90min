#!/usr/bin/env node
/**
 * Run one SQL statement against the project's Neon database and print the
 * rows as JSON. A development aid for inspecting data - not used by the app.
 *
 *   node scripts/db-query.mjs "select count(*) from matches"
 *
 * Reads DATABASE_URL_UNPOOLED (falling back to DATABASE_URL) from .env.local
 * in the current directory. Nothing is printed except the query result.
 *
 * Read-only by default. Statements that change data or schema are refused
 * unless --write is passed, so an accidental paste cannot drop a table.
 */
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const args = process.argv.slice(2)
const allowWrite = args.includes('--write')
const statement = args.filter((a) => a !== '--write').join(' ').trim()

if (!statement) {
  console.error('usage: node scripts/db-query.mjs [--write] "<sql>"')
  process.exit(2)
}

const WRITE = /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment)\b/i
if (WRITE.test(statement) && !allowWrite) {
  console.error('Refusing a write statement without --write.')
  process.exit(2)
}

let envText = ''
try {
  envText = readFileSync('.env.local', 'utf8')
} catch {
  console.error('No .env.local in the current directory.')
  process.exit(2)
}

function envVar(name) {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim() : undefined
}

const url = envVar('DATABASE_URL_UNPOOLED') || envVar('DATABASE_URL')
if (!url) {
  console.error('DATABASE_URL is not set in .env.local')
  process.exit(2)
}

try {
  const rows = await neon(url).query(statement)
  console.log(JSON.stringify(rows, null, 1))
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
