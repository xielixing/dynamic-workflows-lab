import { db } from '../shared/db'
import type { Order, OrderItem } from '../shared/types'
import { priceOfSku } from '../pricing/priceCalculator'

export async function getOrder(id: string): Promise<Order | null> {
  return db.orders.find(id)
}

export async function ordersForUser(userId: string): Promise<Order[]> {
  const orders = await db.orders.all()
  return orders.filter((o) => o.userId === userId)
}

export async function createOrder(userId: string, wanted: Array<{ sku: string; qty: number }>): Promise<Order> {
  const items: OrderItem[] = []
  for (const line of wanted) {
    const unit = await priceOfSku(line.sku)
    items.push({ sku: line.sku, qty: line.qty, unitPriceCents: unit })
  }
  const totalCents = items.reduce((sum, it) => sum + it.qty * it.unitPriceCents, 0)
  const order: Order = {
    id: `o-${Date.now().toString(36)}`,
    userId,
    items,
    status: 'cart',
    totalCents,
    createdAt: new Date().toISOString(),
  }
  await db.orders.insert(order)
  return order
}

export async function markPaid(orderId: string): Promise<void> {
  await db.orders.update(orderId, { status: 'paid' })
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const order = await db.orders.find(orderId)
  if (!order) return
  if (order.status === 'shipped' || order.status === 'delivered') {
    throw new Error(`cannot cancel ${orderId} after shipment (${reason})`)
  }
  await db.orders.update(orderId, { status: 'cancelled' })
}
