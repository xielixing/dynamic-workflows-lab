import { sleep } from '../shared/db'
import { makeLogger } from '../shared/logger'

const log = makeLogger('notify:sms')

const OPT_OUTS = new Set(['u-004'])

export async function optOut(userId: string): Promise<void> {
  await sleep(1)
  OPT_OUTS.add(userId)
}

export async function sendSms(userId: string, text: string): Promise<boolean> {
  if (OPT_OUTS.has(userId)) {
    log.info(`sms suppressed for opted-out user ${userId}`)
    return false
  }
  await sleep(4)
  log.info(`sms to ${userId}: ${text.slice(0, 40)}`)
  return true
}

export async function shipNotice(userId: string, tracking: string): Promise<void> {
  await sendSms(userId, `Your parcel is on the way. Tracking: ${tracking}`)
}

export async function optOutCount(): Promise<number> {
  await sleep(1)
  return OPT_OUTS.size
}
