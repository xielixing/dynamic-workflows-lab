import { sleep } from '../shared/db'
import { makeLogger } from '../shared/logger'

const log = makeLogger('notify:push')

interface PushToken {
  userId: string
  token: string
  platform: 'ios' | 'android'
}

const TOKENS: PushToken[] = [
  { userId: 'u-002', token: 'apk-8812', platform: 'android' },
  { userId: 'u-003', token: 'aps-4410', platform: 'ios' },
]

export async function tokenFor(userId: string): Promise<PushToken | null> {
  await sleep(2)
  return TOKENS.find((t) => t.userId === userId) ?? null
}

export async function pushOrderUpdate(userId: string, orderId: string): Promise<boolean> {
  const target = await tokenFor(userId)
  if (!target) {
    log.info(`no push token for ${userId}, skipping`)
    return false
  }
  await sleep(3)
  log.info(`push to ${target.platform}:${target.token} about ${orderId}`)
  return true
}

export async function broadcastMaintenance(atIso: string): Promise<void> {
  for (const t of TOKENS) {
    await sleep(1)
    log.info(`maintenance notice ${atIso} → ${t.token}`)
  }
}
