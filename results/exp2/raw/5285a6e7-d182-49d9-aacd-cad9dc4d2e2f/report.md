All six planted bugs are fixed with one-line root-cause changes each; both verification targets pass.

## Verification

- **`npm test`** → 6 test files, 12/12 tests passing
- **`npx tsc --noEmit`** → clean (exit 0)

Changes are confined to `src/` (6 files, 6 insertions / 6 deletions) — nothing under `tests/` was touched and no assertions were weakened.

## What was wrong and what changed

Each failing test traced back to a distinct root cause in one source file:

| File | Root cause | Fix |
|---|---|---|
| `src/config.ts` | `BATCH_SIZE` was `99`, contradicting spec ORD-88 ("chunks of exactly 100") and the `batching.ts` comment. With the wrong constant, 250 ids split as `[99, 99, 52]`. | `99 → 100` (the batching algorithm itself was always correct) |
| `src/dates.ts` | `getUTCMonth()` is 0-based (March→2), so `shortDate` rendered every month one behind (`2026-02-08` instead of `2026-03-08`). | `getUTCMonth()` → `getUTCMonth() + 1` |
| `src/money.ts` | `applyDiscountCents` never rounded to whole cents despite spec FIN-19 — returned `1699.15` instead of `1699`. | Wrap result in `Math.round(...)` (JS native half-up) |
| `src/refunds.ts` | `createRefund` set `userId` but `RefundRequest` declares `customerId`; wrong property name caused TS2353 and made `refund.customerId` `undefined` at runtime. | `userId: order.customerId` → `customerId: order.customerId` |
| `src/retry.ts` | After exhausting attempts, `withRetry` fell through to `return undefined as T`, silently swallowing the last error — the exact failure mode the file's comment says caused the 2026-06-19 incident. The `as T` cast hid it from the type checker. | `return undefined as T` → `throw lastError` |
| `src/sorting.ts` | `newestFirst` sorted by `id` ascending instead of `createdAt` newest-first per OPS-12. | Sort by `Date.parse(b.createdAt) - Date.parse(a.createdAt)` (descending), keeping the `[...orders]` spread so the no-mutate guard still passes |

Each was independently diagnosed and fixed by a parallel subagent (all confirmed the failure, reasoned from the on-file spec comments + test expectations, and verified their module's tests + the guard test), then I ran the full suite and typecheck to close out.