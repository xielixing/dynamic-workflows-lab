import { describe, it, expect } from 'vitest'
import { withRetry } from '../src/retry'

describe('withRetry', () => {
  it('rejects with the last error after exhausting attempts (RET-7)', async () => {
    let calls = 0
    const alwaysFails = async () => {
      calls++
      throw new Error(`boom ${calls}`)
    }
    await expect(withRetry(alwaysFails, 3)).rejects.toThrow('boom 3')
    expect(calls).toBe(3)
  })

  it('returns the value when the call eventually succeeds', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls < 2) throw new Error('transient')
      return 'ok'
    }
    await expect(withRetry(flaky, 3)).resolves.toBe('ok')
  })
})
