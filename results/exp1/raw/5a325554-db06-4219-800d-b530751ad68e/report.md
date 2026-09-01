Both verified clean — `metricsAggregator.ts:25` properly awaits `isCacheFresh(...)`, and `userService.ts:13` properly awaits `db.users.find(id)`. My independent grep cross-check of every boolean context in the tree found the exact same six sites and nothing else. The report is verified.

## Audit report: missing `await` in boolean context

**Scope:** all 24 TypeScript files under `src/` (one agent per file, 0 errors). **6 findings** in 6 files, all confirmed against source. Every one is the same bug shape: the result of an async call is assigned to a variable *without* `await`, and that variable is then tested as a boolean. Since a `Promise` object is always truthy, `!x` is always `false` — the guard never fires.

### Findings (by severity)

**1. `src/users/authService.ts:37` — authorization check silently passes (security)**
```ts
const allowed = hasPermission(user, action)      // line 36, missing await
if (!allowed) { throw new ForbiddenError(...) }  // guard never fires
```
A Promise is always truthy, so `!allowed` is always false — **unauthorized users are never denied**. This is the `SEC-12` gate the comment explicitly references. Fix: `const allowed = await hasPermission(user, action)`.

**2. `src/orders/fulfillmentService.ts:27` — out-of-stock orders always ship (WMS-77 phantom shipments)**
```ts
const ok = hasStock(item.sku, item.qty)          // line 26, missing await
if (!ok) { throw new OutOfStockError(...) }      // never throws
```
The stock guard never fires, so undersupplied lines are shipped and stock isn't validated before the shipment is created.

**3. `src/pricing/promoCodes.ts:17` — promo codes never applied (FIN-27)**
```ts
const stale = promoIsStale(code)                 // line 16, missing await
if (!stale) { /* discount */ }                   // always false
```
`promoIsStale` resolves to `true` for unknown/expired codes, but here it returns a *pending Promise* — always truthy — so `!stale` is always false and **even a valid code keeps the original total**.

**4. `src/inventory/reservationService.ts:16` — reservations always returned instead of created (INV-118)**
```ts
const already = hasActiveReservation(orderId)    // line 15, missing await
if (!already) { /* insert reservation */ }       // never runs
```
Because `!already` is always false, the insert branch is dead and the function always returns the "existing" lookup — for a fresh order that's no row, so the caller gets a **non-existent reservation**.

**5. `src/notifications/digestBuilder.ts:22` — no digests ever sent (CRM-204)**
```ts
const sent = hasDigestBeenSent(id)               // line 21, missing await
if (!sent) { /* compose + stage digest */ }      // never runs
```
`!sent` is always false, so the digest body is never composed, staged, or recorded — despite the dedup contract, **no user receives a digest**.

**6. `src/orders/returnsService.ts:52` — auto-approval dead (FIN-31)**
```ts
const blocked = autoApprovalBlocked(orderId)     // line 51, missing await
if (!blocked) { /* auto-approve refunds */ }     // never runs
```
The function always returns `false`, so eligible small in-window refunds are never auto-approved and always wait for a human.

### Clean files
18 files clean, including the near-miss in `src/reporting/metricsAggregator.ts:25` (awaits `isCacheFresh` correctly) and `src/users/userService.ts` (awaits correctly). No fire-and-forget, `.catch()`-handled, or returned-promise cases were mis-flagged.

No files were modified — read-only audit throughout. Fix for all six is uniform: add `await` at the assignment site (`src/users/authService.ts:36`, `src/orders/fulfillmentService.ts:26`, `src/pricing/promoCodes.ts:16`, `src/inventory/reservationService.ts:15`, `src/notifications/digestBuilder.ts:21`, `src/orders/returnsService.ts:51`).