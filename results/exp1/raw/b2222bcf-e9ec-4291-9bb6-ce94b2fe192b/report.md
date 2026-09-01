Audit complete. The workflow ran **24 agents in parallel — one per file under `src/`** — each returning structured findings, merged into a consolidated report at the end. **No files were modified** (read-only; git working tree remains clean).

## Consolidated Report — Missing `await` in boolean context

**Coverage:** 24/24 files audited · **6 genuine findings** across 6 files · 18 files clean.

Every finding is the same root cause: an async function returning `Promise<boolean>` is called *without* `await`, its result stored in a variable, then negated in an `if (!x)` guard. Since a Promise object is always truthy, `!x` is always `false` — the guard never fires and the intended logic silently breaks.

### The findings (verified against source)

| # | Location | Function | Offending call | Effect of the bug |
|---|----------|----------|----------------|-------------------|
| 1 | `src/users/authService.ts:36` | `assertCanManage` | `hasPermission(user, action)` | **Authorization gate always grants access.** `ForbiddenError` never thrown — `SEC-12` check silently dead. |
| 2 | `src/orders/fulfillmentService.ts:26` | `fulfillOrder` | `hasStock(item.sku, item.qty)` | **Out-of-stock orders ship anyway.** `OutOfStockError` never throws — the exact "phantom shipment" from `WMS-77`. |
| 3 | `src/notifications/digestBuilder.ts:21` | `buildDigestsFor` | `hasDigestBeenSent(id)` | **Dedup never fires — duplicate digests are sent** to every user every cycle (reintroduces `CRM-204`). |
| 4 | `src/inventory/reservationService.ts:15` | `reserveForOrder` | `hasActiveReservation(orderId)` | **Idempotency check dead — duplicate reservation rows** inserted, breaking the `INV-118` reconciliation contract. |
| 5 | `src/pricing/promoCodes.ts:16` | `applyPromo` | `promoIsStale(code)` | **Valid promos never apply a discount** — `!stale` always false, so the discount branch is unreachable (`FIN-27` gate). |
| 6 | `src/orders/returnsService.ts:51` | `autoApproveIfEligible` | `autoApprovalBlocked(orderId)` | **Auto-approval never happens** — function always returns `false`; eligible small refunds must wait for a human (`FIN-31` gate). |

### Notes

- **Severity ordering** above is by impact: #1 and #2 are security/ops-critical (authorization bypass, phantom shipments); #3–#6 are correctness/behavioral bugs.
- **Correctly excluded** (per your rules): fire-and-forget bare calls, `void someAsync()`, `.catch()`/`.then()` chains, and `return someAsync()` from async functions — none of the 6 flagged sites fall under those exceptions.
- **Fix pattern** for all six is identical: add `await` to the call site (e.g. `const allowed = await hasPermission(user, action)`).

The script persisted to `…\workflows\scripts\missing-await-boolean-audit-wf_1569709a-91d.js` if you want to re-run it (e.g. after fixes, or `resumeFromRunId` to skip cached agent results).