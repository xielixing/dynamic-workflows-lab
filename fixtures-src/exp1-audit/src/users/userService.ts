import { db } from '../shared/db'
import type { User } from '../shared/types'

export async function getUser(id: string): Promise<User | null> {
  return db.users.find(id)
}

export async function activeCustomers(): Promise<User[]> {
  return db.users.where((u) => u.role === 'customer' && u.active)
}

export async function deactivateUser(id: string, reason: string): Promise<void> {
  const user = await db.users.find(id)
  if (!user) return
  if (user.role === 'admin') {
    throw new Error(`refusing to deactivate admin ${id}: ${reason}`)
  }
  await db.users.update(id, { active: false })
}

export async function roleDistribution(): Promise<Record<string, number>> {
  const users = await db.users.all()
  const dist: Record<string, number> = {}
  for (const u of users) {
    dist[u.role] = (dist[u.role] ?? 0) + 1
  }
  return dist
}
