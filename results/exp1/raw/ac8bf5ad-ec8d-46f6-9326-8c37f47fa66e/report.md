Confirmed — `metricsAggregator.ts` awaits correctly (`const fresh = await isCacheFresh(...)`). The audit is fully verified: 6 real findings, 0 false positives, 0 false negatives.

---

## Consolidated Audit Report — Un-awaited Promise in Boolean Context

**Summary:** 24 `src/**/*.ts` files audited (one agent per file), 6 files with findings, **6 confirmed / 0 false positives** — plus my own independent grep sweep over all 24 files found no additional sites.

All six are the identical defect shape: an `async` helper returning `Promise<boolean>` whose result is stored in a `const` without `await` and consumed by an `if (!x)` guard. A Promise object is always truthy, so `!x` is always `false`, the guarded branch is permanently dead, and `await` must be added on the call itself.

| file:line | function | call | broken guard | impact |
|---|---|---|---|---|
| `src/users/authService.ts:36` | `assertCanManage` | `hasPermission(user, action)` | `if (!allowed)` (L37) always false | **Authz denial is dead — `ForbiddenError` never thrown (SEC-12)** |
| `src/orders/fulfillmentService.ts:26` | `fulfillOrder` | `hasStock(item.sku, item.qty)` | `if (!ok)` never throws | Ships out-of-stock items (WMS-77 phantom shipments) |
| `src/inventory/reservationService.ts:15` | `reserveForOrder` | `hasActiveReservation(orderId)` | `if (!already)` branch dead | Breaks INV-118 idempotency; first call returns `undefined` |
| `src/pricing/promoCodes.ts:16` | `applyPromo` | `promoIsStale(code)` | `if (!stale)` branch dead | Promo discounts never apply (FIN-27) |
| `src/notifications/digestBuilder.ts:21` | `buildDigestsFor` | `hasDigestBeenSent(id)` | `if (!sent)` branch dead | Every user re-sent digest — duplicate-suppression inverted (CRM-204) |
| `src/orders/returnsService.ts:51` | `autoApproveIfEligible` | `autoApprovalBlocked(orderId)` | `if (!blocked)` branch dead | Auto-approval always returns `false` (FIN-31) |

**False positives:** none — every finding verified against source; all legal exclusions (`void`, `.catch()/.then()`, async `return`, direct `await`) confirmed absent.

**Fix for each** (one-word change on the stored call, e.g.):
```ts
const allowed = await hasPermission(user, action)   // authService.ts:36
const ok       = await hasStock(item.sku, item.qty) // fulfillmentService.ts:26
const already  = await hasActiveReservation(orderId) // reservationService.ts:15
const stale    = await promoIsStale(code)            // promoCodes.ts:16
const sent     = await hasDigestBeenSent(id)         // digestBuilder.ts:21
const blocked  = await autoApprovalBlocked(orderId)  // returnsService.ts:51
```

**Workflow stats:** 24 audit agents + 1 consolidator, 0 errors, 0 empty results, ~527k tokens, 62s. All 24 audit agents also independently vetted the other 18 files as clean, and I cross-checked the full async-function inventory (~90 async/`Promise` sites) — no other boolean-context promises exist.

**Note on the auth one specifically:** `assertCanManage` currently **permits every action for every user** rather than denying — that's the most severe finding and probably worth fixing first. No files were modified (read-only as requested).