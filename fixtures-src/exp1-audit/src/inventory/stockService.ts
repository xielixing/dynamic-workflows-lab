import { db } from '../shared/db'
import { makeLogger } from '../shared/logger'

const log = makeLogger('inventory:stock')

export interface StockLevel {
  sku: string
  onHand: number
  reserved: number
}

export async function stockLevels(): Promise<StockLevel[]> {
  const [products, reservations] = await Promise.all([db.products.all(), db.reservations.all()])
  return products.map((p) => {
    const reserved = reservations
      .filter((r) => r.sku === p.sku)
      .reduce((sum, r) => sum + r.qty, 0)
    return { sku: p.sku, onHand: p.stock, reserved }
  })
}

export async function lowStockReport(threshold = 10): Promise<string[]> {
  const levels = await stockLevels()
  const low = levels.filter((l) => l.onHand - l.reserved < threshold)
  if (low.length > 0) {
    log.info('low stock alert', low)
  }
  return low.map((l) => l.sku)
}

export async function totalUnitsOnHand(): Promise<number> {
  const products = await db.products.all()
  return products.reduce((sum, p) => sum + p.stock, 0)
}
