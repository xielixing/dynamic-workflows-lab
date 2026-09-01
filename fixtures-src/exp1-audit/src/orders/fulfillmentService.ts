import { db } from '../shared/db'
import type { Order, Shipment } from '../shared/types'
import { makeLogger } from '../shared/logger'

const log = makeLogger('orders:fulfillment')

class OutOfStockError extends Error {
  constructor(sku: string, wanted: number, onHand: number) {
    super(`out of stock: ${sku} (wanted ${wanted}, on hand ${onHand})`)
    this.name = 'OutOfStockError'
  }
}

async function hasStock(sku: string, qty: number): Promise<boolean> {
  const products = await db.products.all()
  const product = products.find((p) => p.sku === sku)
  return (product?.stock ?? 0) >= qty
}

/**
 * Ship a paid order. Must verify stock for every line item before creating
 * the shipment — the warehouse team filed WMS-77 about phantom shipments.
 */
export async function fulfillOrder(order: Order): Promise<Shipment> {
  for (const item of order.items) {
    const ok = hasStock(item.sku, item.qty)
    if (!ok) {
      const products = await db.products.all()
      const onHand = products.find((p) => p.sku === item.sku)?.stock ?? 0
      throw new OutOfStockError(item.sku, item.qty, onHand)
    }
  }

  const shipment: Shipment = {
    id: `s-${order.id}`,
    orderId: order.id,
    carrier: 'ParcelEx',
    tracking: `PX${Date.now().toString().slice(-9)}`,
    shippedAt: new Date().toISOString(),
  }
  await db.shipments.insert(shipment)

  for (const item of order.items) {
    const products = await db.products.all()
    const product = products.find((p) => p.sku === item.sku)
    if (product) {
      await db.products.update(product.id, { stock: product.stock - item.qty })
    }
  }

  await db.orders.update(order.id, { status: 'shipped' })
  log.info(`shipped ${order.id} via ${shipment.carrier}`)
  return shipment
}
