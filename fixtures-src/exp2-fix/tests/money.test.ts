import { describe, it, expect } from 'vitest'
import { applyDiscountCents, formatCents } from '../src/money'

describe('money', () => {
  it('rounds discounts to whole cents, half-up (FIN-19)', () => {
    expect(applyDiscountCents(1999, 15)).toBe(1699)
    expect(applyDiscountCents(1000, 10)).toBe(900)
    expect(applyDiscountCents(333, 50)).toBe(167)
  })

  it('formats cents as dollars', () => {
    expect(formatCents(2500)).toBe('$25.00')
    expect(formatCents(5)).toBe('$0.05')
  })
})
