import { z } from 'zod'

/**
 * POST /api/auth/login.
 *
 * Bounds are about cost, not policy: bcrypt only reads the first 72 bytes, but
 * an unbounded password still has to be received and parsed, and an unbounded
 * username becomes a rate-limit key.
 */
export const loginSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
})

export type LoginInput = z.infer<typeof loginSchema>
