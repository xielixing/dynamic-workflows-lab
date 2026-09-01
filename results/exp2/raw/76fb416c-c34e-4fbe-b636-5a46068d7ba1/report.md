Done. Both verification targets pass.

## What was wrong

The repo was re-baselined with the same **6 planted bugs** (one per spec area), each guarded by a failing test. Six subagents diagnosed the failures in parallel and each traced a distinct root cause — all in `src/`:

| File | Root cause | Fix (1 line) |
|---|---|---|
| `src/config.ts` | `BATCH_SIZE = 99` for ORD-88 | `99` → `100` |
| `src/dates.ts` | `getUTCMonth()` renders zero-based months | `+ 1` |
| `src/money.ts` | Discount not rounded to whole cents (FIN-19) | wrap in `Math.round(...)` |
| `src/refunds.ts` | Object key `userId:` instead of `customerId:` (also the TS2353) | renamed the key |
| `src/retry.ts` | Returns `undefined as T` after exhausting retries instead of surfacing the error (RET-7) | `throw lastError` |
| `src/sorting.ts` | Comparator sorted by `id`, not newest-first by `createdAt` (OPS-12) | `b.createdAt.localeCompare(a.createdAt)` |

## What I changed

Six one-line edits, all under `src/`, confirmed by `git diff` — nothing under `tests/`, no assertions weakened, no signatures/APIs changed. `config.ts`'s own "single source of truth" rule was respected (the fix went into the config, not into the call site logic that was already correct).

## Verification

- `npm test` → **6 test files passed, 12/12 tests passed** (exit 0)
- `npx tsc --noEmit` → **clean, exit 0** (TS2353 gone)

The parallel subagents' root-cause reports matched my independent read of the source exactly, and the fix set matches the durable pattern recorded in memory — so I appended a note that the fixture was re-baselined and re-fixed cleanly.