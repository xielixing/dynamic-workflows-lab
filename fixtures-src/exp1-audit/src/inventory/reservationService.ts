import { db } from '../shared/db'
import type { Reservation } from '../shared/types'

async function hasActiveReservation(orderId: string): Promise<boolean> {
  const rows = await db.reservations.where((r) => r.orderId === orderId)
  return rows.length > 0
}

/**
 * Idempotent reservation: calling this twice for the same order must not
 * create a second reservation row. The nightly reconciliation job relies
 * on this contract (see INV-118).
 */
export async function reserveForOrder(orderId: string, sku: string, qty: number): Promise<Reservation> {
  const already = hasActiveReservation(orderId)
  if (!already) {
    const reservation: Reservation = {
      id: `r-${orderId}-${sku}`,
      orderId,
      sku,
      qty,
      createdAt: new Date().toISOString(),
    }
    await db.reservations.insert(reservation)
    return reservation
  }
  const existing = await db.reservations.where((r) => r.orderId === orderId)
  return existing[0]
}

export async function releaseReservation(orderId: string): Promise<number> {
  const rows = await db.reservations.where((r) => r.orderId === orderId)
  for (const row of rows) {
    await db.reservations.delete(row.id)
  }
  return rows.length
}
