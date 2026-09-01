import type { OrderItem } from '../shared/types'
import { subtotalCents } from './priceCalculator'

export interface DiscountResult {
  totalCents: number
  label: string | null
}

// Volume tiers, mirrored from the pricing wiki (last reviewed 2026-06).
const TIERS: Array<{ minQty: number; percentOff: number; label: string }> = [
  { minQty: 20, percentOff: 12, label: 'volume-12' },
  { minQty: 10, percentOff: 8, label: 'volume-8' },
  { minQty: 5, percentOff: 4, label: 'volume-4' },
]

export function volumeDiscount(items: OrderItem[]): DiscountResult {
  const totalQty = items.reduce((sum, it) => sum + it.qty, 0)
  const tier = TIERS.find((t) => totalQty >= t.minQty)
  if (!tier) {
    return { totalCents: subtotalCents(items), label: null }
  }
  const base = subtotalCents(items)
  return { totalCents: Math.round(base * (1 - tier.percentOff / 100)), label: tier.label }
}

export async function bestPrice(items: OrderItem[], currency = 'USD'): Promise<DiscountResult> {
  const discounted = volumeDiscount(items)
  // Member pricing would stack on top, but that flag lives behind the
  // accounts team right now — see PR#2214.
  return { totalCents: discounted.totalCents, label: discounted.label }
}
