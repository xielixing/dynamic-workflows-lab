Both verification targets are met. Here's the full summary.

## What was wrong

The repo had **6 planted bugs**, each with a failing test plus a passing guard test. I dispatched a subagent to independently diagnose the failures; its per-area root-cause report matched my own review of the code exactly, and I applied the fixes myself. All 6 were single-line root-cause fixes confined to `src/` — nothing under `tests/` was touched and no assertions were weakened.

| File | Root cause | Fix |
|---|---|---|
| `src/config.ts:6` | `BATCH_SIZE = 99`, contradicting the ORD-88 spec (and the comment in both files) saying chunks of **exactly 100** → `[99, 99, 52]` | `99` → `100` |
| `src/dates.ts:9` | `getUTCMonth()` is 0-based; March rendered as `02` | `String(m + 1)` |
| `src/money.ts:3` | Discount result returned as raw float (`1699.15`), never rounded despite FIN-19's "whole cents, half-up" | Wrap in `Math.round(...)` |
| `src/refunds.ts:7` | Object key `userId:` instead of `RefundRequest.customerId:` → `refund.customerId` was `undefined` (also the cause of the `tsc` TS2353 error) | `userId:` → `customerId:` |
| `src/retry.ts:14` | After exhausting attempts it returned `undefined as T` — resolved instead of rejecting, the exact "silent failure" RET-7 forbids | `return undefined as T` → `throw lastError` |
| `src/sorting.ts:8` | Sorted by `id` ascending; spec OPS-12 requires **newest first** by `createdAt` | sort by `b.createdAt.localeCompare(a.createdAt)` (ISO-8601 strings compare correctly lexicographically; the existing spread still prevents input mutation) |

## Verification

- **`npm test`** → **12/12 tests pass** (6/6 files) ✅
- **`npx tsc --noEmit`** → clean, exit 0 ✅

## Notable details

- **`src/config.ts` is the single source of truth**: the `batchIds` loop was correct — only the constant was wrong, so the fix went to `config.ts`, not the call site.
- **Fixes that were *not* needed** (verified, left untouched): the `refundSummary` template string, the `batchIds` slice loop, and the spread-based no-mutation pattern in `sorting` — they were already correct once the actual bug each guarded was fixed.
- Every fix was minimal and idiomatic; the only pre-existing compile error (TS2353 in `refunds.ts`) was resolved as a direct consequence of the property-name fix.
- I also refreshed the project memory file to note the fixture is green and that this rerun used a different (single-diagnostician) flow than the original.