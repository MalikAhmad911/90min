/**
 * Route segment -> entity id. Positive integers that fit Postgres `integer`
 * only; anything else is a 404 before the database is asked.
 */
export function parseEntityId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null
}
