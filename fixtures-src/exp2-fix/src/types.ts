export interface Order {
  id: string
  customerId: string
  totalCents: number
  createdAt: string
}

export interface RefundRequest {
  refundId: string
  customerId: string
  orderId: string
  amountCents: number
  reason: string
}

export interface BatchResult {
  batches: string[][]
  overflow: number
}
