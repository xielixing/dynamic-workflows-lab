import type {
  User,
  Product,
  Order,
  Reservation,
  PromoCode,
  AuditEvent,
  Shipment,
  RefundRequest,
} from './types'

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * In-memory stand-in for the production Postgres cluster.
 * Every method is async on purpose: in production these go over the wire,
 * and callers must treat them as network I/O.
 */
class Table<T extends { id: string }> {
  constructor(
    private readonly rows: T[],
    private readonly latency = 2,
  ) {}

  async find(id: string): Promise<T | null> {
    await sleep(this.latency)
    return this.rows.find((r) => r.id === id) ?? null
  }

  async all(): Promise<T[]> {
    await sleep(this.latency + 2)
    return [...this.rows]
  }

  async where(pred: (row: T) => boolean): Promise<T[]> {
    await sleep(this.latency + 2)
    return this.rows.filter(pred)
  }

  async count(pred?: (row: T) => boolean): Promise<number> {
    await sleep(this.latency)
    return pred ? this.rows.filter(pred).length : this.rows.length
  }

  async insert(row: T): Promise<void> {
    await sleep(this.latency)
    this.rows.push(row)
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    await sleep(this.latency)
    const idx = this.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.rows[idx] = { ...this.rows[idx], ...patch }
  }

  async delete(id: string): Promise<void> {
    await sleep(this.latency)
    const idx = this.rows.findIndex((r) => r.id === id)
    if (idx >= 0) this.rows.splice(idx, 1)
  }
}

const SEED_USERS: User[] = [
  { id: 'u-001', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin', active: true },
  { id: 'u-002', name: 'Bo Chen', email: 'bo@example.com', role: 'customer', active: true },
  { id: 'u-003', name: 'Cy Marquez', email: 'cy@example.com', role: 'support', active: true },
  { id: 'u-004', name: 'Dee Okafor', email: 'dee@example.com', role: 'customer', active: false },
]

const SEED_PRODUCTS: Product[] = [
  { id: 'p-101', sku: 'SKU-KETTLE', name: 'Electric kettle', stock: 40, priceCents: 3999 },
  { id: 'p-102', sku: 'SKU-TOASTER', name: 'Toaster duo', stock: 0, priceCents: 5499 },
  { id: 'p-103', sku: 'SKU-BLENDER', name: 'Pro blender', stock: 7, priceCents: 12999 },
  { id: 'p-104', sku: 'SKU-LAMP', name: 'Desk lamp', stock: 120, priceCents: 2599 },
]

const SEED_ORDERS: Order[] = [
  {
    id: 'o-9001',
    userId: 'u-002',
    items: [
      { sku: 'SKU-KETTLE', qty: 2, unitPriceCents: 3999 },
      { sku: 'SKU-BLENDER', qty: 1, unitPriceCents: 12999 },
    ],
    status: 'paid',
    totalCents: 20997,
    createdAt: '2026-08-14T10:12:00Z',
  },
  {
    id: 'o-9002',
    userId: 'u-004',
    items: [{ sku: 'SKU-TOASTER', qty: 1, unitPriceCents: 5499 }],
    status: 'awaiting_stock',
    totalCents: 5499,
    createdAt: '2026-08-20T16:40:00Z',
  },
  {
    id: 'o-9003',
    userId: 'u-002',
    items: [{ sku: 'SKU-LAMP', qty: 3, unitPriceCents: 2599 }],
    status: 'delivered',
    totalCents: 7797,
    createdAt: '2026-08-28T09:03:00Z',
  },
]

const SEED_PROMOS: PromoCode[] = [
  { id: 'SAVE10', code: 'SAVE10', percentOff: 10, expiresAt: '2030-01-01T00:00:00Z', minTotalCents: 5000 },
  { id: 'GHOST5', code: 'GHOST5', percentOff: 5, expiresAt: '2020-01-01T00:00:00Z', minTotalCents: 0 },
]

const SEED_REFUNDS: RefundRequest[] = [
  { id: 'rf-501', orderId: 'o-9003', reason: 'arrived damaged', amountCents: 2599, approved: true },
  { id: 'rf-502', orderId: 'o-9001', reason: 'changed mind', amountCents: 20997, approved: false },
]

export const db = {
  users: new Table<User>([...SEED_USERS]),
  products: new Table<Product>([...SEED_PRODUCTS]),
  orders: new Table<Order>([...SEED_ORDERS]),
  reservations: new Table<Reservation>([]),
  promos: new Table<PromoCode>([...SEED_PROMOS]),
  events: new Table<AuditEvent>([]),
  shipments: new Table<Shipment>([]),
  refunds: new Table<RefundRequest>([...SEED_REFUNDS]),
}
