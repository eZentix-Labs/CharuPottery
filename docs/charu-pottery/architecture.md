# Architecture — Charu Pottery

## Overview

```
 Browser ──► React SPA (Frontend/, CRA)
               ├─ Storefront bundle (main.js)         /, /products, /cart, /checkout, /profile …
               └─ Admin bundle (admin.chunk.js, lazy)  /admin/*  (own login + layout)
                        │  axios, base = REACT_APP_API_URL || /api/v1
                        ▼
             Express API (Backend/app.js)  ──►  MongoDB (replica set required)
               routes → controllers → services → models
                                         │
                                         └─ services/payments/phonepeProvider.js ─► PhonePe (disabled)
```

**Build targets** (`REACT_APP_APP_TARGET`):
- `all` (the default) is today's single deployment.
- `storefront` builds without any admin code. `/admin` redirects to `REACT_APP_ADMIN_URL`.
- `admin` builds an admin-only app, which can be deployed on its own hostname.

The backend must list both origins in `CLIENT_URL` / `ADMIN_URL` (CORS allow-list).

## Backend layers

| Layer | Responsibility |
|---|---|
| `app.js` | Builds the Express app: security headers, CORS allow-list, raw-body payment callback, rate limits, body limits, sanitisation, routes, health. `server.js` only connects and listens (so tests load the app without a port or a real DB) |
| `routes/*` | Auth and role checks on every protected route (`protect`, `authorize('admin')`) |
| `controllers/*` | HTTP translation and input shaping. No money or stock logic |
| `services/orderService.js` | Checkout, payment application, cancellation, COD collection, refunds, reservation expiry |
| `services/inventory.js` | The **only** writer of stock counters. Conditional updates plus a ledger row in the same transaction |
| `services/pricing.js` | Server-side repricing in integer paise. Coupon validation |
| `services/loyalty.js` | Prime Collection eligibility and one-time redemption |
| `services/orderStateMachine.js` | Allowed fulfilment transitions per actor |
| `services/payments/*` | Provider registry and PhonePe adapter (isolated) |
| `services/messaging/whatsapp.js` | Consent-gated integration point. Sends nothing today |
| `services/audit.js` | Audit log writer |
| `utils/withTransaction.js` | Refuses money and stock writes (503) on a non-replica-set database |

## Key flows

### COD checkout

1. `POST /orders/checkout` with `Idempotency-Key`.
2. One transaction:
   - Reprice the cart.
   - Compare against `expectedTotalPaise` (a mismatch returns 409 `PRICE_CHANGED`).
   - `SALE` movement per line, using a conditional `stock >= qty`.
   - Coupon redemption (atomic usage counter).
   - Prime redemption (atomic counter).
   - Create the order (`Pending`, `PAYMENT_PENDING`) and clear the cart.
3. The order becomes `PAID` **only** when an admin records the cash at Out for Delivery or Delivered, with an amount equal to the total. A conditional update makes duplicates impossible.

### Online checkout (PhonePe, disabled)

1. Same transaction, but with `RESERVE` movements and `AwaitingPayment`, and a reservation that expires after 30 minutes.
2. After the commit, `pay()` returns the redirect URL.
3. On return, or on a callback (verified, deduplicated), the server calls `getOrderStatus` and checks the amount and ids.
4. `COMPLETED` → `COMMIT` movements, order `Pending`/`PAID`. `FAILED` → `RELEASE` and `Cancelled`/`FAILED`.
5. A sweeper expires stale reservations, checking the gateway first.

### Cancellation and refunds

Allowed before Shipped. One transaction does three things:
- a conditional status change (a concurrent second cancel matches nothing and gets 409);
- a ledger-driven release (`RELEASE` if reserved, `RETURN_TO_STOCK` if sold), applied exactly once because each order/item/type combination is unique in the ledger;
- coupon and Prime reversal.

Refund handling depends on how the order was paid:
- **Paid online:** the refund goes to PhonePe after the commit (atomically claimed, retryable, reconciled).
- **Paid COD:** the admin records the actual refund with a reference.
- **Legacy orders** (no `payment` block): restocked once, and no refund state is invented.

## Security model

- JWT access token (15 min by default) plus an httpOnly refresh cookie. Logout, password change and deactivation bump `tokenVersion`, which revokes refresh tokens.
- Roles `user` / `admin` (DEC-12). Authorisation is enforced on the server for every admin route.
- Inputs are validated server-side. List filters are whitelisted, page sizes capped, and regex input escaped. `express-mongo-sanitize` blocks operator injection.
- Uploads are verified by magic bytes (never by the client-supplied type or extension), with size limits and random filenames. Served with `nosniff`.
- Payment secrets live only in server env. No card or UPI data touches the server.

## Known architectural limits

- Uploaded media is stored on the API server's local disk (`/uploads`). On hosts with ephemeral disks (e.g. Render without a disk), files are lost on redeploy. Configure a persistent disk or move to Cloudinary/S3 before launch.
- The reservation sweeper runs in-process. With several API instances, each runs it. That is safe, because every transition is conditional, but redundant.
- Single admin role (DEC-12).
