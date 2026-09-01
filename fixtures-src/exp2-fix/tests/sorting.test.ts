import { describe, it, expect } from 'vitest'
import { newestFirst } from '../src/sorting'
import type { Order } from '../src/types'

const ORDERS: Order[] = [
  { id: 'o-1', customerId: 'c-1', totalCents: 100, createdAt: '2026-08-01T10:00:00Z' },
  { id: 'o-2', customerId: 'c-2', totalCents: 200, createdAt: '2026-08-03T09:00:00Z' },
  { id: 'o-3', customerId: 'c-3', totalCents: 300, createdAt: '2026-08-02T12:00:00Z' },
]

describe('newestFirst', () => {
  it('sorts orders newest first (OPS-12)', () => {
    const sorted = newestFirst(ORDERS)
    expect(sorted.map((o) => o.id)).toEqual(['o-2', 'o-3', 'o-1'])
  })

  it('does not mutate the input array', () => {
    const input = [...ORDERS]
    newestFirst(input)
    expect(input.map((o) => o.id)).toEqual(['o-1', 'o-2', 'o-3'])
  })
})
