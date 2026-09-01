## Done — the failing test suite passes ✅

**`npm test` → 12/12 passed (6 files)** · **`npx tsc --noEmit` → exit 0, clean**

### Workflow execution
The workflow ran one diagnostic round (6 parallel read-only diagnosis agents → 6 parallel fix agents → 6 independent adversarial verifiers), then a second round's full status check confirmed green. All 6 fixes were **independently confirmed** by verifier agents that checked the on-disk `git diff` against full test intent (input immutability, exact rounding, ordering, error re-throws, attempt counts), re-ran each targeted test, and confirmed `tests/` was never modified. Since two consecutive no-progress rounds were never reached, the loop stopped cleanly on the success criterion.

### Root causes & fixes (all in `src/`, one line each — no tests touched)

| File | Root cause | Fix |
|---|---|---|
| `src/config.ts` | `BATCH_SIZE = 99` contradicted the ORD-88 spec (chunks of exactly 100) | `BATCH_SIZE = 100` |
| `src/dates.ts` | `shortDate` used `getUTCMonth()` directly, which is 0-based → March rendered as `2026-02-08` | `d.getUTCMonth() + 1` |
| `src/money.ts` | `applyDiscountCents` returned a fractional value (e.g. `1699.15`, `166.5`) instead of rounding half-up per FIN-19 | `Math.round(cents - (cents * percentOff) / 100)` |
| `src/refunds.ts` | `createRefund` wrote `userId` instead of the `customerId` field → `refund.customerId` was `undefined`, and this was also the TS2353 type error | `userId:` → `customerId:` |
| `src/retry.ts` | `withRetry` swallowed the last error and returned `undefined as T` after exhausting attempts (the exact 2026-06-19 silent-failure bug the RET-7 spec warns about) | `return undefined as T` → `throw lastError` |
| `src/sorting.ts` | `newestFirst` sorted by `id` ascending instead of `createdAt` descending | comparator → `Date.parse(b.createdAt) - Date.parse(a.createdAt)` (still on `[...orders]` copy, so input is not mutated) |

### Constraints honored
- **Root causes, not symptoms** — e.g. the batching fix corrected the config constant that `batchIds` depends on, and the refunds fix also eliminated the only `tsc` error.
- **`tests/` untouched** — `git diff` shows 6 modified files, all under `src/`, 6 insertions / 6 deletions.
- **No assertions weakened** — verifiers confirmed test files are unchanged from baseline and re-derived every assertion's expected value.