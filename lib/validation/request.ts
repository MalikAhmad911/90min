import { NextResponse } from 'next/server'
import type { z } from 'zod'

/** Admin and login payloads are a few hundred bytes; anything far larger is not ours. */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

interface ParseOptions {
  maxBytes?: number
  /**
   * Replaces the detailed validation message. Login uses this: telling a
   * caller which field failed helps nobody there and only describes the API.
   */
  publicError?: string
}

function fail(status: number, error: string): ParsedBody<never> {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/** "stream.src: HLS source must be ..." - enough for the admin UI to show. */
export function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.map(String).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * Reads a JSON body and validates it against an allow-list schema.
 *
 * Routes only ever see `data` - the schema's output - so a field the schema
 * does not name can never reach a database write.
 *
 * Requiring `application/json` is cheap CSRF defence in depth on top of the
 * SameSite cookie: a cross-site HTML form cannot send that content type, and a
 * cross-site fetch that does triggers a CORS preflight we never answer.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  opts: ParseOptions = {}
): Promise<ParsedBody<T>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES

  const contentType = req.headers.get('content-type') ?? ''
  if (!/^application\/json\b/i.test(contentType)) {
    return fail(415, 'Content-Type must be application/json')
  }

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return fail(413, 'Request body too large')
  }

  let text: string
  try {
    text = await req.text()
  } catch {
    return fail(400, 'Invalid request')
  }
  // Content-Length can be absent or wrong (chunked bodies), so check what arrived.
  if (new TextEncoder().encode(text).length > maxBytes) {
    return fail(413, 'Request body too large')
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return fail(400, 'Invalid JSON')
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    return fail(400, opts.publicError ?? describeIssue(result.error))
  }
  return { ok: true, data: result.data }
}
