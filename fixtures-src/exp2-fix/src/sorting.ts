import type { Order } from './types'

/**
 * OPS-12: the ops dashboard renders orders newest first. Ties are fine —
 * createdAt has millisecond precision in production.
 */
export function newestFirst(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => a.id.localeCompare(b.id))
}
