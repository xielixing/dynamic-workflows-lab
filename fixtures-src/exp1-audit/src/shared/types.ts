export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'support' | 'customer'
  active: boolean
}

export interface Product {
  id: string
  sku: string
  name: string
  stock: number
  priceCents: number
}

export interface OrderItem {
  sku: string
  qty: number
  unitPriceCents: number
}

export type OrderStatus = 'cart' | 'paid' | 'awaiting_stock' | 'shipped' | 'delivered' | 'cancelled'

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  status: OrderStatus
  totalCents: number
  createdAt: string
}

export interface Reservation {
  id: string
  orderId: string
  sku: string
  qty: number
  createdAt: string
}

export interface PromoCode {
  id: string
  code: string
  percentOff: number
  expiresAt: string
  minTotalCents: number
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: string
  detail: string
}

export interface Shipment {
  id: string
  orderId: string
  carrier: string
  tracking: string
  shippedAt: string
}

export interface RefundRequest {
  id: string
  orderId: string
  reason: string
  amountCents: number
  approved: boolean
}
