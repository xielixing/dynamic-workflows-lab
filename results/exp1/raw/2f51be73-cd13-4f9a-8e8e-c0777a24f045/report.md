Workflow completed — all 24 agents finished (0 errors, 0 unaudited), and I spot-checked every reported finding against the actual source. **All 6 findings are confirmed real.** No files were modified (read-only audit).

## Audit result: un-awaited promises used in boolean context

**Coverage:** 24/24 TS files under `src/` · **6 files with findings** · **18 clean** · 0 errors

All six are the same bug: an `async` helper returning `Promise<boolean>` is called **without `await`**, and the resulting Promise (always truthy) is tested with `if (!x)` — so the guard **can never fire** and the intended branch or exception path is silently dead.

| File | Line | Function | Bug |
|---|---|---|---|
| `src/inventory/reservationService.ts` | 16 | `reserveForOrder` | `const already = hasActiveReservation(orderId)` (no await) → `if (!already)` always falls through, so the first reservation is never inserted — the INV-118 idempotency contract silently breaks. |
| `src/notifications/digestBuilder.ts` | 22 | `buildDigestsFor` | `const sent = hasDigestBeenSent(id)` → `if (!sent)` never true, so **no digest is ever sent**; `out` always empty (CRM-204 dedup becomes a no-delivery bug). |
| `src/orders/fulfillmentService.ts` | 26 | `fulfillOrder` | `const ok = hasStock(item.sku, item.qty)` → `if (!ok)` never throws `OutOfStockError`. Out-of-stock orders get shipped and stock decremented — the WMS-77 phantom-shipment failure. |
| `src/orders/returnsService.ts` | 51 | `autoApproveIfEligible` | `const blocked = autoApprovalBlocked(orderId)` → `if (!blocked)` unreachable, so no eligible refund is ever auto-approved (FIN-31 gate never passes). |
| `src/pricing/promoCodes.ts` | 17 | `applyPromo` | `const stale = promoIsStale(code)` → `if (!stale)` always false, so the discount branch is dead code — every promo code returns the full total. |
| `src/users/authService.ts` | 37 | `assertCanManage` | `const allowed = hasPermission(user, action)` → `if (!allowed)` never throws — **the authorization gate grants every action** (SEC-12), and access is always logged as "granted". |

**Consolidated summary (all findings confirmed at source):**

```
auditedFiles:      24
filesWithFindings: 6
filesClean:        18
filesUnaudited:    0
totalFindings:     6
```

**Pattern across all 6:** `const x = someAsyncCheck()` on one line, `if (!x)` on the next — the un-awaited call returns a `Promise<boolean>`, and `!x` on a Promise is always `false` (a Promise object is always truthy). The `await` is missing at the *call*, so the guard logic inverts to "never true"; the async result never flows into the condition. Fix in every case is one token: `const already = await hasActiveReservation(orderId)` (etc.).

**Why these pass the "fire-and-forget" exclusion:** none of the six are `void`-discarded or `.catch()`-handled — each uses the result directly in a boolean guard, so they're genuine violations of the pattern, not intentional async calls whose result is intentionally dropped. The 18 clean files (e.g. `src/index.ts`, `src/shared/db.ts`) all `await` their async calls or return them safely.

One observable upshot worth noting separately: in this fixture the `db` tables are seeded in-memory, so bugs #4 (`returnsService`) and #6 (`authService`) have visible runtime effects right now — no refund auto-approves, and `assertCanManage` logs "granted" for everyone. Bugs #1/#3/#5 flip their insert/throw/discount behavior on the seed data too.