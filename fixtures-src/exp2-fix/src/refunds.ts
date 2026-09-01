import type { Order, RefundRequest } from './types'
import { formatCents } from './money'

export function createRefund(order: Order, reason: string, amountCents: number): RefundRequest {
  return {
    refundId: `rf-${order.id}-${amountCents}`,
    userId: order.customerId,
    orderId: order.id,
    amountCents,
    reason,
  }
}

export function refundSummary(refund: RefundRequest): string {
  return `${refund.refundId}: ${formatCents(refund.amountCents)} for customer ${refund.customerId}`
}
