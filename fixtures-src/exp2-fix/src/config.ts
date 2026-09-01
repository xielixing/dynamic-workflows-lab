// Central config. Values here are the single source of truth — do not
// hardcode them at call sites.

// ORD-88: orders are dispatched in chunks of exactly 100 ids; the remainder
// forms the final batch. Agreed with logistics on 2026-07-11.
export const BATCH_SIZE = 99

export const MAX_RETRIES = 3

// FIN-31: refunds above this threshold need a human approver.
export const REFUND_AUTO_APPROVE_LIMIT_CENTS = 5_000
