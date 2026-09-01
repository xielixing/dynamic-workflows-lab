import { BATCH_SIZE } from './config'
import type { BatchResult } from './types'

// Spec ORD-88: split ids into chunks of exactly BATCH_SIZE; the remainder
// forms the final batch. Original order must be preserved inside batches.
export function batchIds(ids: string[]): BatchResult {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE))
  }
  return { batches, overflow: ids.length % BATCH_SIZE }
}
