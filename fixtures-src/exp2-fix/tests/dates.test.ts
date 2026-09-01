import { describe, it, expect } from 'vitest'
import { shortDate } from '../src/dates'

describe('shortDate', () => {
  it('renders UTC dates with 1-based months (OPS-31)', () => {
    expect(shortDate('2026-03-08T12:00:00Z')).toBe('2026-03-08')
    expect(shortDate('2026-12-31T23:59:59Z')).toBe('2026-12-31')
    expect(shortDate('2026-01-01T00:00:00Z')).toBe('2026-01-01')
  })

  it('pads single digit days', () => {
    expect(shortDate('2026-04-05T08:00:00Z').endsWith('-05')).toBe(true)
  })
})
