import { describe, it, expect } from 'vitest'
import { createRefund, refundSummary } from '../src/refunds'
import type { Order } from '../src/types'

const ORDER: Order = {
  id: 'o-77',
  customerId: 'c-42',
  totalCents: 2500,
  createdAt: '2026-08-01T10:00:00Z',
}

describe('refunds', () => {
  it('carries the customer id on the refund request', () => {
    const refund = createRefund(ORDER, 'damaged', 2500)
    expect(refund.customerId).toBe('c-42')
    expect(refundSummary(refund)).toContain('c-42')
  })

  it('summarizes a refund for the ops log', () => {
    const refund = createRefund(ORDER, 'damaged', 2500)
    expect(refundSummary(refund).startsWith('rf-o-77-2500: $25.00')).toBe(true)
  })
})
