import { sleep } from '../shared/db'
import { makeLogger } from '../shared/logger'

const log = makeLogger('notify:email')

interface Email {
  to: string
  subject: string
  body: string
}

// Outbox pattern: we stage emails and a worker drains the table.
const OUTBOX: Email[] = []

export async function stageEmail(to: string, subject: string, body: string): Promise<void> {
  await sleep(2)
  OUTBOX.push({ to, subject, body })
}

export async function drainOutbox(): Promise<number> {
  const batch = [...OUTBOX]
  OUTBOX.length = 0
  for (const mail of batch) {
    await sleep(3)
    log.info(`sent "${mail.subject}" to ${mail.to}`)
  }
  return batch.length
}

export async function orderConfirmation(to: string, orderId: string, totalCents: number): Promise<void> {
  const body = `Your order ${orderId} is confirmed. Total: $${(totalCents / 100).toFixed(2)}.`
  await stageEmail(to, `Order ${orderId} confirmed`, body)
}

export async function outboxSize(): Promise<number> {
  await sleep(1)
  return OUTBOX.length
}
