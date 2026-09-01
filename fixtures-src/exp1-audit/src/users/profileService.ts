import { db } from '../shared/db'
import type { User } from '../shared/types'

export async function profileFor(userId: string): Promise<ProfileView | null> {
  const user = await db.users.find(userId)
  if (!user) return null
  const orders = await db.orders.all()
  const orderCount = orders.filter((o) => o.userId === userId).length
  return {
    id: user.id,
    displayName: user.name,
    email: user.email,
    orderCount,
  }
}

export interface ProfileView {
  id: string
  displayName: string
  email: string
  orderCount: number
}

export async function updateEmail(userId: string, email: string): Promise<void> {
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    throw new Error(`invalid email: ${email}`)
  }
  await db.users.update(userId, { email })
}

export async function mergeAccounts(primaryId: string, duplicateId: string): Promise<User> {
  const [primary, duplicate] = await Promise.all([db.users.find(primaryId), db.users.find(duplicateId)])
  if (!primary || !duplicate) {
    throw new Error('both accounts must exist to merge')
  }
  const orders = await db.orders.all()
  for (const o of orders.filter((x) => x.userId === duplicateId)) {
    await db.orders.update(o.id, { userId: primaryId })
  }
  await db.users.delete(duplicateId)
  return primary
}
