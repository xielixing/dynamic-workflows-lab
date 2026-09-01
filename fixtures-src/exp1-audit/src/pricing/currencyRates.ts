import { sleep } from '../shared/db'
import { makeLogger } from '../shared/logger'

const log = makeLogger('pricing:rates')

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 155.2,
}

/**
 * Pretend we hit the central-bank aggregation feed. In production this is a
 * flaky third-party endpoint, so the fallback table matters.
 */
export async function fetchExchangeTable(): Promise<Record<string, number>> {
  await sleep(5)
  if (Math.random() < 0.15) {
    log.warn('upstream rates feed timed out, falling back to static table')
    return { ...FALLBACK_RATES }
  }
  return { ...FALLBACK_RATES, CAD: 1.36, AUD: 1.51, CHF: 0.88 }
}

export async function convert(amountUSD: number, target: string): Promise<number> {
  const table = await fetchExchangeTable()
  const rate = table[target] ?? FALLBACK_RATES[target]
  if (!rate) {
    throw new Error(`unknown currency: ${target}`)
  }
  return Math.round(amountUSD * rate * 100) / 100
}

export async function listSupportedCurrencies(): Promise<string[]> {
  const table = await fetchExchangeTable()
  return Object.keys(table).sort()
}
