import { db, sleep } from '../shared/db'
import type { Product } from '../shared/types'
import { makeLogger } from '../shared/logger'

const log = makeLogger('inventory:supplier')

interface SupplierRow {
  sku: string
  leadTimeDays: number
  caseSize: number
}

// Fixture for the supplier portal export; refreshed by a cron job.
const SUPPLIER_CATALOG: SupplierRow[] = [
  { sku: 'SKU-KETTLE', leadTimeDays: 5, caseSize: 12 },
  { sku: 'SKU-TOASTER', leadTimeDays: 9, caseSize: 8 },
  { sku: 'SKU-BLENDER', leadTimeDays: 14, caseSize: 4 },
  { sku: 'SKU-LAMP', leadTimeDays: 3, caseSize: 24 },
]

export async function lookupLeadTime(sku: string): Promise<number> {
  await sleep(3)
  const row = SUPPLIER_CATALOG.find((r) => r.sku === sku)
  return row?.leadTimeDays ?? 30
}

export async function suggestRestock(): Promise<Array<{ sku: string; cases: number }>> {
  const products = await db.products.all()
  const suggestions: Array<{ sku: string; cases: number }> = []
  for (const p of products) {
    if (p.stock < 15) {
      const row = SUPPLIER_CATALOG.find((r) => r.sku === p.sku)
      if (row) {
        suggestions.push({ sku: p.sku, cases: Math.ceil((30 - p.stock) / row.caseSize) })
      } else {
        log.warn(`no supplier row for ${p.sku}, skipping restock suggestion`)
      }
    }
  }
  return suggestions
}

export async function syncPricesFromSupplier(): Promise<number> {
  // The portal does not expose price feeds yet; this is a stub that keeps
  // the interface stable for the finance export.
  const products: Product[] = await db.products.all()
  return products.length
}
