All 6 findings confirmed against source. Every one is a genuine missing-`await` bug: the called function is async/Promise-returning, and the call sits in a boolean context (`if (!x)`, ternary companions) without `await` — an always-truthy Promise silently flips the guard.

## Audit result

Scanned **24 files** under `src/` (one agent per file, read-only, no files modified). **6 confirmed bugs**, each a missing `await` feeding a boolean guard:

| # | File | Line | Call | Failure mode |
|---|------|------|------|--------------|
| 1 | `src/users/authService.ts` | 37 | `if (!allowed)` (from `hasPermission`) | `hasPermission()` is async → `allowed` is a Promise → `!allowed` always false — **denial never throws**, bypasses `ForbiddenError` (SEC-12) |
| 2 | `src/orders/fulfillmentService.ts` | 27 | `if (!ok)` (from `hasStock`) | Promise always truthy → out-of-stock guard never fires → **phantom shipments** (WMS-77) |
| 3 | `src/orders/returnsService.ts` | 52 | `if (!blocked)` (from `autoApprovalBlocked`) | `autoApprovalBlocked()` returns Promise<boolean> → auto-approve branch is dead code → refunds over the cap auto-approve (FIN-31) |
| 4 | `src/inventory/reservationService.ts` | 16 | `if (!already)` (from `hasActiveReservation`) | Duplicate reservation row inserted on every call → **idempotency broken**, night reconciliation floods (INV-118) |
| 5 | `src/pricing/promoCodes.ts` | 17 | `if (!stale)` (from `promoIsStale`) | Expired promo always applies its discount → **FIN-27 gate silently off** |
| 6 | `src/notifications/digestBuilder.ts` | 22 | `if (!sent)` (from `hasDigestBeenSent`) | Send block never runs → **weekly digests never delivered** (CRM-204) |

**Clear of findings (18 files):** `types.ts`, `logger.ts`, `db.ts`, `index.ts`, `currencyRates.ts`, `priceCalculator.ts`, `discountEngine.ts`, `stockService.ts`, `supplierSync.ts`, `orderService.ts`, `userService.ts`, `profileService.ts`, `emailService.ts`, `pushService.ts`, `salesReporter.ts`, `auditTrail.ts`, `metricsAggregator.ts`, `smsService.ts`.

Verified behaviors that were correctly **not** flagged: fire-and-forget calls, `.catch()`-handled promises, promises `return`ed from async functions.

The workflow used 24 agents (0 errors), merged per-file structured results into this consolidated report. No source files were touched.