import { db } from '../shared/db'
import { makeLogger } from '../shared/logger'
import { stageEmail } from './emailService'

const log = makeLogger('notify:digest')

async function hasDigestBeenSent(userId: string): Promise<boolean> {
  const events = await db.events.where(
    (e) => e.action === 'digest.sent' && e.detail.includes(userId),
  )
  return events.length > 0
}

/**
 * Weekly digest fan-out. Each active user must receive at most one digest
 * per cycle; the CRM team reported complaints about duplicates (CRM-204).
 */
export async function buildDigestsFor(userIds: string[]): Promise<string[]> {
  const out: string[] = []
  for (const id of userIds) {
    const sent = hasDigestBeenSent(id)
    if (!sent) {
      const body = await composeDigest(id)
      await stageEmail(id, 'Your weekly digest', body)
      await db.events.insert({
        id: `ev-digest-${id}`,
        at: new Date().toISOString(),
        actor: 'system',
        action: 'digest.sent',
        detail: `digest delivered to ${id}`,
      })
      out.push(id)
    }
  }
  log.info(`digests built for ${out.length}/${userIds.length} users`)
  return out
}

async function composeDigest(userId: string): Promise<string> {
  const orders = await db.orders.all()
  const mine = orders.filter((o) => o.userId === userId)
  if (mine.length === 0) {
    return 'No activity this week.'
  }
  const lines = mine.map((o) => `- ${o.id}: ${o.status}, $${(o.totalCents / 100).toFixed(2)}`)
  return `Your week in review:\n${lines.join('\n')}`
}
