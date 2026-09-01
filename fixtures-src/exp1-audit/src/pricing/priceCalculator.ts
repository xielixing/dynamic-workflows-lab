import { db } from '../shared/db'
import type { OrderItem } from '../shared/types'
import { convert } from './currencyRates'

export interface Quote {
  subtotalCents: number
  currency: string
  totalCents: number
}

export function subtotalCents(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + it.qty * it.unitPriceCents, 0)
}

export async function quoteCart(items: OrderItem[], currency = 'USD'): Promise<Quote> {
  const sub = subtotalCents(items)
  if (currency === 'USD') {
    return { subtotalCents: sub, currency, totalCents: sub }
  }
  const usdAmount = sub / 100
  const converted = await convert(usdAmount, currency)
  return { subtotalCents: sub, currency, totalCents: Math.round(converted * 100) }
}

export async function priceOfSku(sku: string): Promise<number> {
  const products = await db.products.all()
  const product = products.find((p) => p.sku === sku)
  if (!product) {
    throw new Error(`unknown sku: ${sku}`)
  }
  return product.priceCents
}

export async function cheapestSku(): Promise<string | null> {
  const products = await db.products.all()
  if (products.length === 0) return null
  const cheapest = products.reduce((a, b) => (a.priceCents <= b.priceCents ? a : b))
  return cheapest.sku
}
