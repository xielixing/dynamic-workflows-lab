All six subagent reports are in, and I've personally re-read every reported site to confirm file, line, function, and expression. The audit is consistent with the fixture's declared content (`package.json`: "6 planted missing-await bugs") — exactly 6 confirmed findings, all the same shape: an async helper's bare call assigned to a variable, then negated in an `if`, so the Promise (always truthy) permanently disables the guard.

No files were modified.

## Audit — missing `await` in boolean context

### Findings

**1. `src/pricing/promoCodes.ts:16` — enclosing function `applyPromo`**
```ts
const stale = promoIsStale(code)   // promoIsStale declared async at line 4
if (!stale) { ... }
```
`stale` is a Promise → always truthy → `!stale` is always `false`. The FIN-27 "expired/unknown code is a no-op" gate never triggers; expired codes keep applying their discount.

**2. `src/inventory/reservationService.ts:15` — enclosing function `reserveForOrder`**
```ts
const already = hasActiveReservation(orderId)   // declared async at line 4
if (!already) { ... }
```
`!already` is always `false`, so the INV-118 idempotency guard never fires — a duplicate reservation row is inserted on every call.

**3. `src/orders/fulfillmentService.ts:26` — enclosing function `fulfillOrder`**
```ts
const ok = hasStock(item.sku, item.qty)   // declared async at line 14
if (!ok) { throw new OutOfStockError(...) }
```
`!ok` is always `false` → the WMS-77 stock check is skipped for every line item; out-of-stock orders still ship and decrement stock below zero.

**4. `src/orders/returnsService.ts:51` — enclosing function `autoApproveIfEligible`**
```ts
const blocked = autoApprovalBlocked(orderId)   // declared async at line 36
if (!blocked) { ... approve all pending refunds ... }
```
`!blocked` is always `false` → the FIN-31 gate (unknown order / outside window / over $50) never blocks; any pending refund is auto-approved unconditionally.

**5. `src/users/authService.ts:36` — enclosing function `assertCanManage`**
```ts
const allowed = hasPermission(user, action)   // declared async at line 26
if (!allowed) { throw new ForbiddenError(...) }
```
`!allowed` is always `false` → the SEC-12 authorization check is silently bypassed; any user with an id is treated as permitted for admin actions. Most severe finding.

**6. `src/notifications/digestBuilder.ts:21` — enclosing function `buildDigestsFor`**
```ts
const sent = hasDigestBeenSent(id)   // declared async at line 7
if (!sent) { ... }
```
`!sent` is always `false` → the CRM-204 "at most one digest per cycle" check never fires, so **no** digest is ever sent (both branches of the guard are dead in opposite directions: duplicates can't be suppressed, and the send is skipped).

### Consolidated list

| # | File | Line | Function | Offending call |
|---|------|------|----------|----------------|
| 1 | `src/pricing/promoCodes.ts` | 16 | `applyPromo` | `promoIsStale(code)` → `if (!stale)` |
| 2 | `src/inventory/reservationService.ts` | 15 | `reserveForOrder` | `hasActiveReservation(orderId)` → `if (!already)` |
| 3 | `src/orders/fulfillmentService.ts` | 26 | `fulfillOrder` | `hasStock(item.sku, item.qty)` → `if (!ok)` |
| 4 | `src/orders/returnsService.ts` | 51 | `autoApproveIfEligible` | `autoApprovalBlocked(orderId)` → `if (!blocked)` |
| 5 | `src/users/authService.ts` | 36 | `assertCanManage` | `hasPermission(user, action)` → `if (!allowed)` |
| 6 | `src/notifications/digestBuilder.ts` | 21 | `buildDigestsFor` | `hasDigestBeenSent(id)` → `if (!sent)` |

### Coverage & exclusions applied
- All **24** files under `src/` were read in full across 6 parallel subagents (coverage: shared ×4, pricing ×4, inventory/orders ×4, fulfillment/returns/users ×4, profile/notifications ×4, sms/reporting ×4). Clean files — `types.ts`, `logger.ts`, `db.ts`, `index.ts`, `currencyRates.ts`, `priceCalculator.ts`, `discountEngine.ts`, `stockService.ts`, `supplierSync.ts`, `orderService.ts`, `userService.ts`, `profileService.ts`, `emailService.ts`, `pushService.ts`, `smsService.ts`, `salesReporter.ts`, `auditTrail.ts`, `metricsAggregator.ts` — each checked as correct.
- Correctly **excluded** per the brief: `return db.orders.find(id)` inside async functions (`userService.ts:5`, `orderService.ts:6`, `auditTrail.ts:22`), `void` fire-and-forget (`auditTrail.ts:16`), `.catch()` handlers, and all properly `await`-ed calls.

All 6 are the same mechanical fix — add `await` before the call — but with distinct consequences: a security bypass (authService), unconditional refund approval (returnsService), phantom shipments (fulfillmentService), duplicate reservations (reservationService), dead discount logic (promoCodes), and suppressed digests (digestBuilder).