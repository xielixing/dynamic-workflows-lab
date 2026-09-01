import { db } from './shared/db'
import { quoteCart } from './pricing/priceCalculator'
import { reserveForOrder } from './inventory/reservationService'
import { fulfillOrder } from './orders/fulfillmentService'
import { buildDigestsFor } from './notifications/digestBuilder'
import { dailyOrderTotals } from './reporting/metricsAggregator'

/**
 * Smoke path through the pipeline, mainly used by the nightly job to make
 * sure every subsystem still answers. Not part of the public API.
 */
export async function runPipelineSmoke(): Promise<string[]> {
  const steps: string[] = []

  const orders = await db.orders.all()
  const paid = orders.find((o) => o.status === 'paid')
  if (paid) {
    const quote = await quoteCart(paid.items)
    steps.push(`quote:${quote.totalCents}`)
    await reserveForOrder(paid.id, paid.items[0].sku, paid.items[0].qty)
    steps.push(`reserved:${paid.id}`)
  }

  const users = await db.users.all()
  const digestIds = users.filter((u) => u.active).map((u) => u.id)
  const digests = await buildDigestsFor(digestIds)
  steps.push(`digests:${digests.length}`)

  const today = new Date().toISOString().slice(0, 10)
  const totals = await dailyOrderTotals(today)
  steps.push(`totals:${totals.length}`)

  return steps
}

export { quoteCart, reserveForOrder, fulfillOrder, dailyOrderTotals }
