import { db } from '../shared/db'
import type { AuditEvent } from '../shared/types'

/**
 * Append-only audit trail. Event writes are intentionally fire-and-forget:
 * they must never block or fail the business operation that produced them.
 */
export function recordEvent(actor: string, action: string, detail: string): void {
  const event: AuditEvent = {
    id: `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    at: new Date().toISOString(),
    actor,
    action,
    detail,
  }
  void db.events.insert(event).catch(() => {
    // Swallowed on purpose: audit writes are best-effort by design (AUD-9).
  })
}

export async function eventsFor(actor: string): Promise<AuditEvent[]> {
  return db.events.where((e) => e.actor === actor)
}

export async function recentActions(limit = 20): Promise<AuditEvent[]> {
  const events = await db.events.all()
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export async function countByAction(): Promise<Record<string, number>> {
  const events = await db.events.all()
  const counts: Record<string, number> = {}
  for (const e of events) {
    counts[e.action] = (counts[e.action] ?? 0) + 1
  }
  return counts
}
