# Implementation Roadmap — Charu Pottery

Phase order follows CLAUDE.md §13. The one exception is DEC-18: payment, order and inventory integrity move to the front because of a live security defect.

| Phase | Scope | Requirement IDs | Status |
|---|---|---|---|
| 0 | Audit, requirements, decision register | all | ✅ Done (2026-11-24) |
| **1A** | **Payment lifecycle, order state machine, atomic inventory and ledger core, refunds, backend test harness** | CP-CUST-050, CP-CUST-052, CP-CUST-030 (pricing), CP-ADMIN-011, CP-ADMIN-020 (core), CP-SEC-001…004 | ✅ Done 2026-11-24, **with COD + PhonePe instead of Stripe** (owner brief; the Stripe design below is superseded) |
| 1B | Separate `Admin/` app shell; CORS allow-list; upload validation; general audit log; config module | CP-XCUT-003, CP-SEC-003 | ✅ Done (admin bundle + build targets, CORS allow-list, upload validation, audit log, config) |
| 2 | Admin product catalogue and media | CP-ADMIN-001/002 | ✅ API tested · 🟡 UI build-verified |
| 3 | Storefront, discovery, product detail, design tokens | CP-CUST-001…011, CP-XCUT-001/002 | 🟡 UI build-verified (banners, new arrivals, offers, about) |
| 4 | Order management UI, order source | CP-ADMIN-010/011 | ✅ API tested · 🟡 UI (admin order detail actions, source capture) |
| 5 | Inventory UI: packaging and custom stock categories, alerts, reports | CP-ADMIN-020/021 | ✅ API tested · 🟡 UI (packaging/sections, ledger, alerts) |
| 6 | Account, addresses, wishlist, order history; admin customer DB | CP-CUST-031/032/051, CP-ADMIN-030 | ✅ API tested · 🟡 UI (addresses, notifications, customer DB) |
| 7 | Reviews and customer media moderation | CP-CUST-012/013, CP-ADMIN-012 | ✅ API tested · 🟡 UI — default policy pending DEC-10 |
| 8 | Offers, coupons, banners, brand and social content | CP-CUST-002/004/020…024 | ✅ API tested · 🟡 UI — content from client pending DEC-13 |
| 9 | Site notifications and WhatsApp | CP-ADMIN-031 | ✅ site notifications · ⛔ WhatsApp sending (DEC-07) |
| 10 | Prime Collection | CP-CUST-040 | ✅ API tested · 🟡 UI — rules pending DEC-11 |
| 11 | Reporting, hardening, accessibility, performance, release | — | 🟡 Security hardening done; accessibility/performance audit and browser E2E outstanding |

---

# Phase 1A — detailed plan (HISTORICAL — Stripe parts superseded by the COD/PhonePe decision; see architecture.md)

## Goal

The goal is to make money and stock correct, before anything is built on top of them:
- An order is **paid** only when Stripe tells our server it was paid, for the right amount, for that order.
- Retries and duplicates never create a second order, a second charge, a second refund or a second stock change.
- Stock can't go negative under concurrent checkouts, cancellations or admin edits, and every change is recorded in a ledger.
- Cancelling a paid order refunds it through Stripe.

## Reassessed defects (confirmed by reading the code)

| # | Defect | Evidence | Severity |
|---|---|---|---|
| C1 | **No real payment ever happens. Any non-COD order is marked paid.** The frontend never loads Stripe: `CheckoutPage.js` POSTs `paymentMethod:'Stripe'\|'UPI'` with `paymentResult:{status:'pending'}`, and `createOrder` sets `isPaid: paymentMethod !== 'COD'`. | `orderController.js` `createOrder`; `CheckoutPage.js` `handlePlaceOrder` | **Critical.** This is worse than first reported: it isn't just spoofable, it's the normal path |
| C2 | The PaymentIntent endpoint is never used. The webhook only logs. Nothing ties a payment to an order or checks the amount. | `createPaymentIntent`; `webhookController.js` | Critical (part of C1) |
| C3 | **Overselling.** Stock is checked, then decremented later with an unconditional `$inc`, and there are no transactions. | `createOrder` loops | High |
| C3b | **Double restock.** `cancelOrder` reads the order, checks the status, then saves. Two concurrent cancels both pass and both restock. | `cancelOrder` | High |
| C3c | **Admin overwrites stock with an absolute value.** `PATCH /products/:id/stock {stock}` loses concurrent order decrements. | `productController.updateStock` | High |
| C3d | **Admin status changes skip side effects.** Admin can set any status, in any order (e.g. Delivered → Pending). Setting Cancelled or Refunded doesn't restock and doesn't refund. | `updateOrderStatus` | High |
| C4 | **Cancelling a paid order doesn't refund.** Today nothing was ever really charged, so the effect is that records are wrong. Once C1 is fixed, real money would be stuck. | `cancelOrder` | High (after C1 is fixed) |
| C5 | **Stale cart price.** The price is copied into the cart when the item is added. Checkout charges that old price even if the product price has since changed. | `cartController.addToCart` → `cart.subtotal` | Medium |
| C6 | Totals are computed in **two places** (frontend and backend) and stored as floating-point rupees. | `CheckoutPage.js`, `orderController.js` | Medium |
| C7 | Order number `ORD-<ms>-<0..999>` can collide. | `Order` pre-save | Low |

## Design

### Order and payment state (backward-compatible)

The fulfilment status stays in `orderStatus`. Two values are added; nothing existing is removed:

```
AwaitingPayment → Pending → Processing → Shipped → Out for Delivery → Delivered
       │             │           │
       ├→ Expired    └───────────┴→ Cancelled → Refunded   (refunds for paid orders only)
       └→ Cancelled
```

- Customer-placed COD orders start at `Pending`, as today.
- Card orders start at `AwaitingPayment`.
- A new sub-document `payment` holds the payment state:
  - `provider` (`stripe` | `cod`)
  - `status`: `requires_payment` · `processing` · `succeeded` · `failed` · `canceled` · `cod_pending` · `cod_collected`
  - `intentId` (unique, sparse)
  - `amountPaise`, `currency`, `paidAt`
  - `refund`: `{status: none|pending|succeeded|failed, refundId, amountPaise, requestedBy, at}`
- `isPaid` and `paidAt` are **kept** for existing screens. They are set **only** by the server transition to `succeeded` or `cod_collected`.
- **One transition table** (`services/orderStateMachine.js`) lists the allowed `from → to` moves for each actor (customer, admin, system). Every transition is a **conditional update** (`findOneAndUpdate({_id, orderStatus: from, …})`), so two concurrent transitions can't both succeed.

### Pricing (server only)

`services/pricing.js` reprices every cart line from the current `Product.finalPrice` and `isActive`. It computes subtotal, tax, shipping, discount and total in **integer paise**. The tax and shipping values come from `config/commerce.js` (current values unchanged; DEC-04, DEC-05).

If any price has changed since the item was added, checkout returns **409** with the refreshed cart, so the customer sees the new total before paying (C5).

The frontend shows the server's numbers from `GET /orders/checkout/quote` and does no maths of its own (C6).

The existing rupee fields (`itemsPrice` etc.) are still filled in, for existing screens.

### Checkout flow (card)

1. **`POST /api/v1/orders/checkout`** with an `Idempotency-Key` header (a UUID the client creates once per checkout attempt) and body `{shippingAddress, paymentMethod: 'stripe'|'cod'}`. The address is validated field by field.
2. In **one transaction**:
   - Reprice the cart.
   - **Reserve stock** for each line with `Product.updateOne({_id, isActive:true, stock:{$gte:qty}}, {$inc:{stock:-qty}})`. If any line fails, abort with 409 and list the items short of stock.
   - Write the `InventoryMovement` records (type `RESERVE`).
   - Create the order (`AwaitingPayment`, `reservationExpiresAt = now + 30 min`, DEC-03).
   - Cancel any earlier unpaid `AwaitingPayment` orders of this customer, releasing their stock and cancelling their PaymentIntents.
3. **After the commit**, create the Stripe PaymentIntent:
   - `amount = order.payment.amountPaise`, `currency: 'inr'`
   - `metadata: {orderId, userId}`
   - Stripe idempotency key `pi-create-<orderId>`
   - Save `intentId` on the order. Return `{orderId, clientSecret, totals}`.
   - If Stripe fails here, the order stays `AwaitingPayment` with no intent. A retry with the same `Idempotency-Key` resumes at this step, and expiry cleans it up otherwise.
4. **Same `Idempotency-Key` again** returns the same order and client secret. The unique index on `{user, idempotencyKey}` guarantees this, including when two identical requests race each other.
5. The frontend confirms the payment with the **Stripe Payment Element** (`@stripe/react-stripe-js` is already installed; no new frontend dependency).
6. **Payment is confirmed by the server only, through either of these paths. Both call the same idempotent `markPaid(order, intent)`:**
   - **Webhook** `payment_intent.succeeded` (the primary path).
   - **`POST /orders/:id/confirm-payment`**, which the client calls after Stripe redirects back. The server **retrieves the PaymentIntent from Stripe itself**; the request body is ignored. This covers delayed webhooks and local development without the Stripe CLI.
7. `markPaid` checks all of the following and then makes one conditional update to `succeeded`:
   - `intent.status === 'succeeded'`
   - `intent.id === order.payment.intentId`
   - `intent.metadata.orderId === order.id`
   - `intent.amount_received === order.payment.amountPaise`
   - `intent.currency === 'inr'`

   In the same transaction it converts the reservation into a sale (ledger `SALE`; `soldCount += qty`) and clears the cart. A mismatch never marks the order paid: it is logged and the order is flagged for admin review.

### COD flow

Same endpoint and the same transactional stock reservation, but the movement is written as `SALE` straight away. The order is `Pending` with payment status `cod_pending`, and the cart is cleared. Admin marks the cash collected (`cod_collected`), which sets `isPaid`. This keeps today's behaviour, pending DEC-02.

### Webhook

- It stays on the raw-body route, registered before `express.json()`. The signature check with `stripe.webhooks.constructEvent` and `STRIPE_WEBHOOK_SECRET` is already there and is kept. Missing or invalid signatures get **400**.
- **Exclude this route from the `/api` rate limiter**, so Stripe's retries aren't throttled.
- **Deduplication:** a new `PaymentEvent` collection has a unique `eventId`. The event is inserted first. A duplicate key means it's already processed, so return 200. If processing fails, delete the record and return 500 so Stripe retries.
- Events handled:

| Event | Action |
|---|---|
| `payment_intent.succeeded` | `markPaid` |
| `payment_intent.payment_failed` | `payment.status = failed`. The order stays `AwaitingPayment` until expiry, so the customer can retry with the same PaymentIntent. |
| `payment_intent.canceled` | Release the reservation and set `Expired`. |
| `charge.refunded`, `refund.updated` | Settle the refund status. |

- Events can arrive out of order. That's harmless, because the state machine ignores transitions that aren't allowed (e.g. `failed` after `succeeded`).

### Reservation expiry

An in-process sweeper (`setInterval`, every minute; disabled in tests, where it's called directly) finds `AwaitingPayment` orders whose `reservationExpiresAt` has passed. For each one it:

1. **Cancels the PaymentIntent at Stripe first.**
2. If Stripe says the intent already **succeeded**, runs `markPaid` instead (the payment won the race).
3. Otherwise releases the stock (ledger `RELEASE`) and sets the order to `Expired`.

**Late payment edge case.** A `succeeded` event can arrive for an order that has already expired. In that case the server tries to re-reserve the stock in a transaction. If the stock is gone, it **automatically refunds in full**, flags the order, and the customer is told.

### Cancellation (C3b, C3d, C4)

`POST /orders/:id/cancel` (customer). The existing `PUT /orders/:id/cancel` is kept as an alias for compatibility.

- **Ownership** is checked against `req.user`. Admins use `POST /orders/:id/admin-cancel`.
- **Allowed** from `AwaitingPayment`, `Pending` and `Processing`, i.e. before Shipped (DEC-06).
- In one transaction: a conditional status update, plus restock through ledger `RETURN_TO_STOCK` (or `RELEASE` for reservations). A second concurrent cancel matches no document and gets 409, so stock is never double-counted.
- **Paid order:** after the commit, `stripe.refunds.create({payment_intent, amount}, {idempotencyKey: 'refund-<orderId>-full'})`. Then `refund.status = pending`; the webhook settles it to `Refunded` or `failed`. A refund that fails to *start* is recorded as `failed`, shown to admin, and can be retried idempotently with `POST /orders/:id/refund/retry` (admin only).
- `updateOrderStatus` (admin) can **no longer** set `Cancelled` or `Refunded` directly. Those go through the cancel and refund service, so stock and money always move together.

### Inventory ledger core (C3, C3c)

**New `InventoryMovement` collection**

| Field | Notes |
|---|---|
| `item` (Product ref) | `itemType: 'product'`. Packaging and custom categories plug in at Phase 5 via `itemType` |
| `type` | `INITIAL`, `RESERVE`, `RELEASE`, `SALE`, `RETURN_TO_STOCK`, `ADJUSTMENT` |
| `delta`, `balanceAfter`, `reason` | |
| `actor` (User), `order` | |
| `createdAt` | |

A unique index on `{order, item, type}` (sparse, partial) prevents double-applying an order movement.

**How it's used**
- `Product.stock` remains the **available quantity** the storefront reads. It is changed **only** by `services/inventory.js`, always in the same transaction as the ledger insert.
- **Admin stock:** a new `POST /products/:id/stock-adjustments {delta, reason}` uses a conditional update so stock can't go below 0.
  - The existing `PATCH /products/:id/stock {stock}` is kept for compatibility. It's reimplemented as "set to N" = compare-and-set on the current value, and it writes an `ADJUSTMENT` entry. A concurrent change gets 409 instead of a silent overwrite.
  - Product create and edit with a `stock` field also go through the service. Create writes `INITIAL`; edit writes `ADJUSTMENT`.
- **Opening balances:** `scripts/backfill-inventory-opening.js` writes one `INITIAL` entry per existing product.
  - **Dry-run by default; insert-only; never changes stock.**
  - It refuses to run unless `MONGO_URI` points at localhost or `--i-understand-target=<host>` is passed.
  - It is not run against production in Phase 1.

### Transactions and replica set (DEC-15)

- `utils/withTransaction.js` wraps `mongoose.connection.transaction()` and retries transient transaction errors.
- **Startup check:** `db.hello()` must report `setName`, or `msg: 'isdbgrid'` (sharded).
  - If it doesn't, **checkout, cancel, refund and stock-adjust return 503** with a clear message, and the server logs an error.
  - We never fall back silently to non-transactional writes.
  - Read-only browsing keeps working.
- **Local development:** MongoDB 7/8 as a single-node replica set: `mongod --replSet rs0`, then `rs.initiate()` once, and `MONGO_URI=mongodb://127.0.0.1:27017/charu_pottery?replicaSet=rs0`. Or an Atlas **development** cluster.
- **Production:** confirm that the Render backend's database is Atlas or another replica set **before** deploying Phase 1. If it isn't, this deploy would turn checkout off (by design).

### Audit log (minimal, for Phase 1A only)

A new `AuditLog` collection: `{actor, action, entity, entityId, before, after, ip, at}`. No secrets and no full addresses.

Phase 1A writes entries for: admin order status changes, admin cancel and refund, refund retry, stock adjustments and stock sets, and payment-amount mismatches. Phase 1B extends it to the other admin actions.

### Other small fixes in scope

- Order number: `CP-YYMMDD-<6 random base32 chars>` from `crypto.randomInt`, retried on a duplicate key. Existing numbers are unchanged.
- Order validation: field-by-field checks on the shipping address, and `paymentMethod ∈ {stripe, cod}`.
  - Legacy values `Card`/`Stripe` are mapped to `stripe`.
  - **`UPI` is rejected** (DEC-02).
  - Client-supplied `paymentResult` is **ignored**.
- Restructure: split `server.js` into `app.js` (builds and exports the Express app) and `server.js` (connects to the DB and listens), so tests can load the app without opening a port or a real DB.

  Stripe access moves into `services/payments/stripeGateway.js`, the only module that imports `stripe`. It's a thin adapter so tests can substitute it, and so a provider switch (DEC-01a) stays contained.

### Frontend changes (customer SPA, minimal)

`CheckoutPage.js`:
- Read the totals from the quote endpoint.
- Remove the fake UPI option.
- Card payments: call `/orders/checkout`, mount the Payment Element, `stripe.confirmPayment` with `return_url=/order-success/:id`.
- COD: call the same endpoint.
- Keep one `Idempotency-Key` per attempt, stored in `sessionStorage`.
- Disable the button while a request is in flight.
- Handle the 409 price-changed and out-of-stock responses.

`OrderSuccessPage.js`: call `confirm-payment` and show **Processing / Paid / Failed** honestly. No "success" before the server says the order is paid.

`MyOrdersPage.js` / `OrderDetailPage.js`: show the new statuses and the refund state.

`REACT_APP_STRIPE_PUBLISHABLE_KEY` is needed (DEC-19).

## Files

| New | Changed |
|---|---|
| `Backend/app.js` | `Backend/server.js` (connect and listen only) |
| `Backend/config/commerce.js` | `Backend/models/Order.js` (add fields and statuses; nothing removed) |
| `Backend/services/pricing.js` | `Backend/controllers/orderController.js` |
| `Backend/services/orderStateMachine.js` | `Backend/controllers/webhookController.js` |
| `Backend/services/orderService.js` (checkout, markPaid, cancel, expire) | `Backend/controllers/productController.js` (stock through the service) |
| `Backend/services/inventory.js` | `Backend/routes/orderRoutes.js`, `productRoutes.js` |
| `Backend/services/payments/stripeGateway.js` | `Backend/middleware/validators.js` |
| `Backend/services/reservationSweeper.js` | `Backend/package.json` (test scripts, devDependencies, DEC-16) |
| `Backend/models/InventoryMovement.js`, `PaymentEvent.js`, `AuditLog.js` | `Frontend/src/pages/CheckoutPage.js`, `OrderSuccessPage.js`, `MyOrdersPage.js`, `OrderDetailPage.js` |
| `Backend/utils/withTransaction.js` | |
| `Backend/scripts/backfill-inventory-opening.js` | |
| `Backend/tests/**` | |
| `Backend/.env.example` (no secrets) | |

**Documentation:** `architecture.md`, `data-model.md`, `api-contracts.md`, `testing-and-acceptance.md`, `release-and-rollback.md`, plus updates to `phase-status.md` and the traceability Code and Tests columns.

## Database impact

- **Additive only:**
  - three new collections
  - new optional Order fields
  - two new `orderStatus` enum values
  - new indexes:
    - `Order {user, idempotencyKey}` unique, partial
    - `Order {'payment.intentId'}` unique, sparse
    - `Order {orderStatus, reservationExpiresAt}`
    - `PaymentEvent {eventId}` unique
    - `InventoryMovement {item, createdAt}`
    - `InventoryMovement {order, item, type}` unique, partial
- No renames, no deletes, no migration of existing orders.
- Existing orders keep their `isPaid` values (DEC-17 covers the falsely-paid ones separately, read-only).

## Automated tests (Jest + Supertest + MongoMemoryReplSet; Stripe gateway mocked; webhooks signed for real with `stripe.webhooks.generateTestHeaderString`, no network)

| Area | Cases |
|---|---|
| Pricing | Repricing from the product; price-change 409; paise rounding; shipping threshold; inactive product rejected |
| Checkout | Card checkout creates `AwaitingPayment`, reserves stock and writes ledger entries; COD writes `SALE` and clears the cart; empty cart → 400; **client `paymentResult`/`isPaid` ignored**; UPI rejected; same `Idempotency-Key` twice (sequential **and** concurrent) → one order and one PaymentIntent |
| Concurrency | Stock 1, 5 parallel checkouts → exactly 1 succeeds and stock = 0; parallel cancel ×2 → one restock; admin compare-and-set vs concurrent order → 409 and no lost update; stock never < 0 |
| Payment confirmation | `confirm-payment` with a succeeded intent → paid; with `requires_payment` → stays unpaid; wrong amount, currency, intent or order metadata → not paid, flagged, audited; another user's order → 403/404 |
| Webhook | Bad or missing signature → 400; valid `succeeded` → paid; **same event delivered twice** → processed once; failure while processing → 500 then a retry succeeds; out-of-order `payment_failed` after success → still paid; `canceled` → stock released |
| Expiry | Expired reservation → `Expired` with stock restored; the race where Stripe already succeeded → paid, not expired; late success after expiry → re-reserve, or refund if sold out |
| Cancel and refund | Customer cancels an unpaid order → restock and no refund; paid → refund created with the idempotency key, `refund.pending`, then the webhook → `Refunded`; Shipped → 400; another user's order → 403; Stripe refund error → `refund.failed`, then admin retry succeeds once; admin can't set `Cancelled`/`Refunded` through the status endpoint |
| Authorization | Customer → admin endpoints 403; anonymous → 401 |
| Transactions guard | Standalone (non-replica-set) DB → checkout returns 503 |
| Regression | Existing cart, product list and auth endpoints still respond |

**Manual check, if DEC-01b and DEC-19 are provided:** a full browser checkout with Stripe test card `4242…` and `stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe`, plus 3DS test card `4000 0027 6000 3184`. I will report exactly what was and wasn't run.

## Risks and rollback

- **Risk: a production database that isn't a replica set would disable checkout.** Mitigation: verify the production topology before deploying.
- **Risk: Stripe India account availability (DEC-01a).** Mitigation: payments sit behind a gateway adapter.
- **Risk: the existing frontend deploy.** The frontend and backend contracts change together, so they must be deployed together. The old `POST /orders` is kept and **forwards to the new checkout with COD/stripe semantics**, so an old frontend gets an unpaid `AwaitingPayment` order, never a falsely paid one.
- **Rollback:** the changes are additive at the database level. Rolling back means redeploying the previous builds. The new collections are inert to old code. Nothing is committed or pushed by me.

## Explicitly out of scope for Phase 1A

- Coupons (the cart's discount stays 0)
- Returns and damaged-item claims
- Partial refunds
- Packaging and custom stock categories, and the inventory UI (Phase 5)
- The admin app split (1B)
- Any production data change
