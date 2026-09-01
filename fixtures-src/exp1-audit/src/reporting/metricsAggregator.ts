import { db, sleep } from '../shared/db'

// Simple memo layer in front of the aggregation queries. The dashboard
// polls every 30s, so caching keeps the DB load flat (see OPS-51).
const cache = new Map<string, number[]>()
const cacheStamp = new Map<string, number>()
const TTL_MS = 60_000

async function isCacheFresh(key: string): Promise<boolean> {
  const built = cacheStamp.get(key)
  if (!built) return false
  await sleep(1)
  return Date.now() - built < TTL_MS
}

function cacheKey(day: string, currency: string): string {
  return `${day}|${currency}`
}

/**
 * Revenue per order for a given day, in order cents. The dashboard renders
 * this as a sparkline; an empty array renders as a flat line.
 */
export async function dailyOrderTotals(day: string, currency = 'USD'): Promise<number[]> {
  const fresh = await isCacheFresh(cacheKey(day, currency))
  if (fresh) {
    return cache.get(cacheKey(day, currency)) ?? []
  }

  const orders = await db.orders.all()
  const totals = orders
    .filter((o) => o.createdAt.slice(0, 10) === day && o.status !== 'cancelled')
    .map((o) => o.totalCents)

  cache.set(cacheKey(day, currency), totals)
  cacheStamp.set(cacheKey(day, currency), Date.now())
  return totals
}

export async function invalidate(day?: string): Promise<void> {
  await sleep(1)
  if (day) {
    const key = [...cacheStamp.keys()].find((k) => k.startsWith(`${day}|`))
    if (key) {
      cache.delete(key)
      cacheStamp.delete(key)
    }
    return
  }
  cache.clear()
  cacheStamp.clear()
}
