# API contracts (v1) — new and changed endpoints

Base: `/api/v1`. Errors: `{ success:false, message, code?, details? }`. Money is integer **paise** unless a field says rupees.

## Checkout and orders (customer)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders/checkout/quote?couponCode=` | Server quote: `lines[]`, `itemsPaise`, `discountPaise`, `taxPaise`, `shippingPaise`, `totalPaise`, `problems[]`, `prime.rewardsAvailable` |
| POST | `/orders/checkout` (also `POST /orders`) | Header `Idempotency-Key` (16–100 chars, required). Body `{shippingAddress, paymentMethod:'COD'|'PHONEPE', expectedTotalPaise, couponCode?, applyPrimeReward?, source?}`. 201 new · 200 replay. Errors: 400 `IDEMPOTENCY_KEY_REQUIRED`/`INVALID_ADDRESS`/`PAYMENT_METHOD_*`/`CART_EMPTY`/`EXPECTED_TOTAL_REQUIRED`; 409 `PRICE_CHANGED`/`CART_INVALID`/`INSUFFICIENT_STOCK`/`COUPON_INVALID`/`NO_REWARD` (with `details.quote` where relevant); 422 `IDEMPOTENCY_KEY_REUSED`; 502 `PAYMENT_INIT_FAILED`; 503 when the DB lacks transactions. Client `isPaid`/`paymentResult`/prices are ignored |
| GET | `/orders/my-orders?page&limit` | Paginated. Includes `canCancel` |
| GET | `/orders/:id` | Owner or admin |
| POST (PUT legacy) | `/orders/:id/cancel` | Owner. 409 `ALREADY_CANCELLED` / `PAYMENT_IN_PROGRESS`; 400 `NOT_CANCELLABLE` |
| POST | `/orders/:id/payment/verify` | Owner. Server asks the gateway and applies the result |
| POST | `/orders/:id/payment/initiate` | Owner. Retry starting an online payment |

## Orders (admin)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders?status&paymentStatus&provider&needsReview&q&from&to&page&limit` | Whitelisted filters; `limit` ≤ 100 |
| PUT | `/orders/:id/status` `{orderStatus?, trackingNumber?, carrier?, note?}` | Pending→Processing→Shipped→(Out for Delivery)→Delivered only. 400 `PROTECTED_STATUS` for Cancelled/Refunded/Expired/AwaitingPayment |
| POST | `/orders/:id/admin-cancel` `{reason}` | Same rules as a customer cancel |
| POST | `/orders/:id/cod/collect` `{amountPaise, note?}` | Out for Delivery / Delivered only. Amount must equal the total. 409 `ALREADY_COLLECTED` |
| POST | `/orders/:id/refund` `{reason, restock}` | Paid + Delivered. COD → waits for the manual record; PhonePe → sent to the gateway |
| POST | `/orders/:id/refund/manual` `{outcome:'SUCCEEDED'|'FAILED', reference, note}` | COD only. Reference required on success |
| POST | `/orders/:id/refund/retry` | PhonePe REFUND_FAILED only |
| POST | `/orders/:id/refund/reconcile`, `/orders/:id/payment/reconcile` | Re-check with the gateway |
| GET | `/orders/:id/history` | Payment transactions, stock movements, audit entries |
| GET | `/orders/analytics/summary` | Verified revenue only. `legacyUnverifiedPaidOrders` |

## Payments

| Method | Path | Notes |
|---|---|---|
| GET | `/payments/methods` | Enabled methods (today `[COD]`) |
| POST | `/payments/phonepe/callback` | Raw body. 404 while disabled, 401 if verification fails, 200 duplicate/ignored, 500 if processing failed (PhonePe retries) |
| POST | `/webhooks/stripe` | 410 Gone (legacy disabled) |

## Products and inventory

| Method | Path | Notes |
|---|---|---|
| GET | `/products?category&clayType&technique&isFeatured&isNewArrival&inStock&price[gte]&price[lte]&keyword&sort&page&limit` | Whitelisted. `limit` ≤ 48. `sort` ∈ newest, price, -price, popular, rating, name |
| GET | `/products/new-arrivals`, `/products/featured`, `/products/:id/related` | |
| GET | `/products/admin/all?status&lowStock&q&category` | Admin, includes archived |
| POST/PUT | `/products`, `/products/:id` | Admin, multipart. Stock changes on PUT need `expectedStock` (compare-and-set, ledgered). `soldCount`/`reservedStock` are ignored |
| DELETE | `/products/:id` | Archive. `/:id/permanent` → 409 if history exists |
| PATCH | `/products/:id/stock` `{stock, expectedStock, reason}` | Compare-and-set. 409 `STOCK_CHANGED` |
| POST | `/products/:id/stock-adjustments` `{delta, reason}` | 409 `NEGATIVE_STOCK` |
| GET | `/products/:id/stock-movements` | Ledger |
| GET/POST/PUT | `/admin/inventory/items[/:id]`, POST `/admin/inventory/items/:id/adjust`, GET `/admin/inventory/movements` | Packaging and other sections |

## Content, marketing, account, admin

| Method | Path | Notes |
|---|---|---|
| GET | `/content/brand`, `/content/banners?placement`, `/content/offers` | Public |
| PUT | `/content/brand` | Admin. Validated, unknown fields dropped, https/relative links only |
| POST | `/content/media` | Admin image upload (content-verified) |
| CRUD | `/content/admin/banners[/:id]` | Admin |
| GET/POST/DELETE | `/admin/coupons…`, `/admin/notifications…` | Admin |
| GET/POST | `/admin/campaigns`, `/admin/campaigns/whatsapp/status`, `/admin/campaigns/whatsapp` | Consent-gated. Recorded as BLOCKED until a provider is set |
| GET/PATCH | `/admin/customers`, `/admin/customers/:id`, `/admin/customers/:id/status` | Detail views are audited |
| GET | `/admin/dashboard`, `/admin/audit` | |
| GET/POST | `/account/notifications`, `/account/notifications/:id/read`, `/account/notifications/read-all` | |
| GET | `/account/loyalty` | Prime progress |
| PUT | `/account/consent` `{whatsapp?, email?}` | Opt-in/out with timestamps |
| GET/POST/PATCH | `/products/:id/reviews` (multipart `media[]`), `/products/:id/reviews/mine`, `/reviews/:id/report`, `/reviews/admin?status`, `/reviews/:id/moderate` | Pre-moderation |
| PUT | `/auth/addresses/:id` | Edit / set default |
| GET | `/health` | `{database, transactions}` |
