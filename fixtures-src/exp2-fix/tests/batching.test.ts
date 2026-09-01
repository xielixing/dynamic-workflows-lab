import { describe, it, expect } from 'vitest'
import { batchIds } from '../src/batching'

describe('batchIds', () => {
  it('splits 250 ids into chunks of 100 per ORD-88', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${String(i).padStart(3, '0')}`)
    const result = batchIds(ids)
    expect(result.batches.map((b) => b.length)).toEqual([100, 100, 50])
    expect(result.overflow).toBe(50)
  })

  it('keeps original order within batches', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const result = batchIds(ids)
    expect(result.batches[0]).toEqual(ids)
  })
})
