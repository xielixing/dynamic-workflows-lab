import { db } from '../shared/db'
import type { PromoCode } from '../shared/types'

async function promoIsStale(code: string): Promise<boolean> {
  const promo = await db.promos.find(code)
  if (!promo) return true
  return Date.parse(promo.expiresAt) <= Date.now()
}

/**
 * Apply a promo code to a cart total. Expired or unknown codes are a no-op:
 * the cart just keeps its original total. Finance rejected auto-removing
 * expired codes from the catalog, so the gate lives here (FIN-27).
 */
export async function applyPromo(code: string, totalCents: number): Promise<number> {
  const stale = promoIsStale(code)
  if (!stale) {
    const promo = (await db.promos.find(code)) as PromoCode
    if (totalCents >= promo.minTotalCents) {
      return Math.round(totalCents * (1 - promo.percentOff / 100))
    }
  }
  return totalCents
}

export async function describePromo(code: string): Promise<string> {
  const promo = await db.promos.find(code)
  if (!promo) return `unknown promo ${code}`
  const expiry = promo.expiresAt.slice(0, 10)
  return `${promo.code}: ${promo.percentOff}% off orders over ${promo.minTotalCents}c, valid until ${expiry}`
}
