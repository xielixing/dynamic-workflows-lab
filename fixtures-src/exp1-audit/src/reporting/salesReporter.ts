import { db } from '../shared/db'
import type { Order } from '../shared/types'

export interface SalesRow {
  day: string
  orders: number
  revenueCents: number
}

export function bucketByDay(orders: Order[]): Map<string, Order[]> {
  const buckets = new Map<string, Order[]>()
  for (const o of orders) {
    const day = o.createdAt.slice(0, 10)
    const list = buckets.get(day) ?? []
    list.push(o)
    buckets.set(day, list)
  }
  return buckets
}

export async function salesRows(): Promise<SalesRow[]> {
  const orders = await db.orders.all()
  const rows: SalesRow[] = []
  for (const [day, list] of bucketByDay(orders)) {
    rows.push({
      day,
      orders: list.length,
      revenueCents: list.reduce((sum, o) => sum + o.totalCents, 0),
    })
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day))
}

export async function topDay(): Promise<SalesRow | null> {
  const rows = await salesRows()
  if (rows.length === 0) return null
  return rows.reduce((a, b) => (a.revenueCents >= b.revenueCents ? a : b))
}
