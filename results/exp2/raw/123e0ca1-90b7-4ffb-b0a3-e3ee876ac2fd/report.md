Everything checks out. Both verification targets pass, and the diff is exactly 6 one-line changes in `src/` — nothing in `tests/`, no weakened assertions.

## Summary

The fixture's test suite was failing on **6 planted bugs** in `src/` (one per failing test). I diagnosed the root causes with an investigation subagent, then fixed each independently with a subagent per file, and had a separate adversarial subagent verify all six fixes.

### What was wrong and what changed (one line per file):

| File | Root cause | Fix |
|---|---|---|
| `src/config.ts` | `BATCH_SIZE = 99`, but spec **ORD-88** requires chunks of exactly 100 | `99 → 100` |
| `src/dates.ts` | `getUTCMonth()` is 0-based, so March rendered as `02` (`OPS-31`) | `m` → `m + 1` before padding |
| `src/money.ts` | Discount returned raw float (e.g. `1699.15`), not whole cents (`FIN-19`) | Wrap result in `Math.round(...)` |
| `src/refunds.ts` | Object key `userId:` instead of the interface's `customerId`, dropping the value (also the `tsc` error: TS2353) | `userId:` → `customerId:` |
| `src/retry.ts` | After retries exhausted, returned `undefined as T`, silently swallowing the error (`RET-7`) | `throw lastError` |
| `src/sorting.ts` | Sorted ascending by `id` instead of newest-first by `createdAt` (`OPS-12`) | Comparator now `b.createdAt.localeCompare(a.createdAt)`, immutability copy kept |

### Verification
- `npm test` → **6 test files, 12/12 tests pass** (exit 0)
- `npx tsc --noEmit` → **clean, exit 0**

`git diff --stat` confirms exactly **6 insertions / 6 deletions across the six `src/` files** — no changes to `tests/`, no assertion weakening, no comments or unrelated lines touched. Each fix addresses the semantic root cause (not the symptom), and each was independently verified by a separate subagent against the original tests.