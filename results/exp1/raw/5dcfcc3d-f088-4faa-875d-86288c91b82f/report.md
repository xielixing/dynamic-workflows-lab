All 6 findings verified independently against the source — every one is a genuine missing-`await` bug, and the count matches the fixture's documented ground truth ("6 planted missing-await bugs"). Here is the consolidated report.

## Audit report — missing `await` in boolean context

**Coverage:** 24/24 TypeScript files under `src/` audited (one agent per file, read-only). **Clean:** 18 files. **Bugs found: 6.**

| # | File | Line | Function | Offending expression |
|---|------|------|----------|----------------------|
| 1 | `src/pricing/promoCodes.ts` | 17 | `applyPromo` | `if (!stale)` |
| 2 | `src/inventory/reservationService.ts` | 16 | `reserveForOrder` | `if (!already)` |
| 3 | `src/orders/fulfillmentService.ts` | 27 | `fulfillOrder` | `if (!ok)` |
| 4 | `src/orders/returnsService.ts` | 52 | `autoApproveIfEligible` | `if (!blocked)` |
| 5 | `src/users/authService.ts` | 37 | `assertCanManage` | `if (!allowed)` |
| 6 | `src/notifications/digestBuilder.ts` | 22 | `buildDigestsFor` | `if (!sent)` |

### What's wrong

Each finding is the same failure mode: an async function's `Promise<boolean>` result is assigned to a variable without `await`, then tested with `if (!x)`. A Promise object is **always truthy**, so each `!x` is always `false` — the guard branch never runs, and the code does the opposite of its intent. All 6 were confirmed against the actual source (async callees at `promoCodes.ts:4`, `reservationService.ts:4`, `fulfillmentService.ts:14`, `returnsService.ts:36`, `authService.ts:26`, `digestBuilder.ts:7`), not just the agents' word.

### Consequence per finding

- **`applyPromo` (FIN-27)** — `promoIsStale(code)` never awaited; `!stale` always `false`, so the discount branch never executes. Every valid promo code silently becomes a no-op.
- **`reserveForOrder` (INV-118)** — `hasActiveReservation(orderId)` never awaited; guard never fires, so calling twice for the same order inserts a **duplicate reservation row**, breaking the documented idempotency contract.
- **`fulfillOrder` (WMS-77)** — `hasStock(...)` never awaited; the stock check silently always passes, so **phantom shipments** can be created with zero on-hand stock (never throws `OutOfStockError`).
- **`autoApproveIfEligible` (FIN-31)** — `autoApprovalBlocked(orderId)` never awaited; auto-approval branch is dead code, so refunds are **never auto-approved** regardless of eligibility.
- **`assertCanManage` (SEC-12)** — `hasPermission(user, action)` never awaited; `!allowed` always `false`, so **`ForbiddenError` is never thrown** and the authorization gate passes every caller. Notably the severity is reversed vs. the obvious read — per the ticket name, this is the security bug. (You flagged this one already in the initial read; it's confirmed.)
- **`buildDigestsFor` (CRM-204)** — `hasDigestBeenSent(id)` never awaited; suppression branch never taken, so **every active user gets a duplicate digest** every cycle.

### Fix pattern

In all 6 cases it's a one-line correction — await at the call site:

```ts
const allowed = await hasPermission(user, action)   // authService.ts:36
```

### Notes
- The audit spec's exclusions were respected: fire-and-forget `void f()` calls, `.catch()`/`.then()` chains, and promises returned from async functions were filtered out (verified none of the 6 violate that).
- **No files were modified** — read-only audit, per the requirement.
- Excluded from every finding: the async callees themselves, and the synchronous code paths using `db.orders.find(...)` etc., which correctly `await` before `if`.

If you'd like, I can also add `await`s as a follow-up (separate, non-audit task), or run the same audit on a different directory.