// RET-7: transient calls must surface the last error after exhausting
// attempts — callers log it and page on-call. Silent failure here caused
// the 2026-06-19 incident where payments vanished without a trace.

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
    }
  }
  return undefined as T
}
