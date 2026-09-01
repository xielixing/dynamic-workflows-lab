import { db } from '../shared/db'
import type { RefundRequest } from '../shared/types'

const REFUND_WINDOW_DAYS = 30

export async function openRefund(orderId: string, reason: string): Promise<RefundRequest> {
  const order = await db.orders.find(orderId)
  if (!order) {
    throw new Error(`unknown order ${orderId}`)
  }
  const refund: RefundRequest = {
    id: `rf-${Date.now().toString(36)}`,
    orderId,
    reason,
    amountCents: order.totalCents,
    approved: false,
  }
  await db.refunds.insert(refund)
  return refund
}

export async function approveRefund(refundId: string, approverRole: string): Promise<void> {
  if (approverRole !== 'admin' && approverRole !== 'support') {
    throw new Error(`${approverRole} may not approve refunds`)
  }
  await db.refunds.update(refundId, { approved: true })
}

export async function refundWithinWindow(orderId: string): Promise<boolean> {
  const order = await db.orders.find(orderId)
  if (!order) return false
  const ageDays = (Date.now() - Date.parse(order.createdAt)) / 86_400_000
  return ageDays <= REFUND_WINDOW_DAYS
}

async function autoApprovalBlocked(orderId: string): Promise<boolean> {
  // True when the order is unknown, outside the refund window, or too
  // expensive for unattended approval.
  const order = await db.orders.find(orderId)
  if (!order) return true
  const ageDays = (Date.now() - Date.parse(order.createdAt)) / 86_400_000
  return ageDays > REFUND_WINDOW_DAYS || order.totalCents > 5_000
}

/**
 * Small refunds inside the window are auto-approved to save support time;
 * anything else must wait for a human approver. Finance requires this gate
 * before any refund settles (FIN-31).
 */
export async function autoApproveIfEligible(orderId: string): Promise<boolean> {
  const blocked = autoApprovalBlocked(orderId)
  if (!blocked) {
    const pending = await db.refunds.where((r) => r.orderId === orderId && !r.approved)
    for (const refund of pending) {
      await db.refunds.update(refund.id, { approved: true })
    }
    return pending.length > 0
  }
  return false
}

export async function pendingRefundCount(): Promise<number> {
  const refunds = await db.refunds.where((r) => !r.approved)
  return refunds.length
}
