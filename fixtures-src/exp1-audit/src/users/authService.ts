import { db, sleep } from '../shared/db'
import type { User } from '../shared/types'
import { makeLogger } from '../shared/logger'

const log = makeLogger('users:auth')

export class ForbiddenError extends Error {
  constructor(userId: string, action: string) {
    super(`user ${userId} is not allowed to ${action}`)
    this.name = 'ForbiddenError'
  }
}

// Role → allowed actions. Stored remotely in the real deployment.
const MATRIX_REMOTE: Record<string, string[]> = {
  admin: ['order:cancel', 'refund:approve', 'user:deactivate', 'report:export'],
  support: ['order:cancel', 'refund:approve'],
  customer: [],
}

async function loadPermissionMatrix(): Promise<Record<string, string[]>> {
  await sleep(4)
  return MATRIX_REMOTE
}

async function hasPermission(user: User, action: string): Promise<boolean> {
  const matrix = await loadPermissionMatrix()
  return matrix[user.role]?.includes(action) ?? false
}

/**
 * Authorization gate for admin operations. Must throw ForbiddenError when
 * the caller lacks the action — security review item SEC-12.
 */
export async function assertCanManage(user: User, action: string): Promise<void> {
  const allowed = hasPermission(user, action)
  if (!allowed) {
    log.warn(`denied ${action} for ${user.id}`)
    throw new ForbiddenError(user.id, action)
  }
  await recordAccess(user.id, action)
}

async function recordAccess(userId: string, action: string): Promise<void> {
  await db.events.insert({
    id: `ev-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    actor: userId,
    action: `auth.${action}`,
    detail: 'granted',
  })
}
