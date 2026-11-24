# PhonePe Payment Gateway — activation guide

**Status:** implemented and tested against a mocked SDK. **Disabled.** No merchant account approval or credentials are available yet. No real or sandbox transaction has been made.

## What is already built

| Piece | Where |
|---|---|
| Provider module (the only code that talks to PhonePe) | `Backend/services/payments/phonepeProvider.js` |
| Provider registry + enable rules | `Backend/services/payments/index.js`, `Backend/config/payments.js` |
| Checkout → reserve stock 30 min → `pay()` → redirect | `orderService.checkout` / `initiateOnlinePayment` |
| Server-side status verification (`getOrderStatus`) | `orderService.verifyOnlinePayment` / `applyOnlineStatus` |
| Callback endpoint `POST /api/v1/payments/phonepe/callback` | `controllers/paymentController.js` |
| Refunds (`refund`, `getRefundStatus`), retry, reconcile | `orderService.startGatewayRefund` / `reconcileRefund` / `retryRefund` |
| Reservation expiry with a gateway check | `orderService.expireReservations` (runs every minute) |
| Audit trail of every gateway interaction | `PaymentTransaction` collection |

**Safety properties (tested in `tests/payments.phonepe.test.js`):**
- An order is marked paid only after the server calls the status API and checks amount = order amount and provider order id = stored id.
- A callback is never trusted alone. It is verified with the SDK's `validateCallback`, deduplicated, then re-checked with the status API.
- Duplicate callbacks are processed once. A processing error returns 500 so PhonePe retries.
- If the payment fails, or the reservation expires, stock is released. A payment that arrives late is re-allocated if stock is still available, and automatically refunded if not.
- Refunds are recorded as `REFUND_PENDING` until PhonePe confirms. Failures become `REFUND_FAILED` and can be retried. A retry first checks the previous attempt, so a refund is never sent twice.
- In production, PhonePe stays off unless `PHONEPE_ENV=production` **and** `PHONEPE_PRODUCTION_APPROVED=true`. Sandbox credentials are refused in production.

## Credentials and settings you will need (from the PhonePe Business Dashboard)

Never put these in code, docs, chat or tickets. Use the hosting provider's secret settings.

| Env variable | Source |
|---|---|
| `PHONEPE_CLIENT_ID` | Dashboard → Developer settings (Test Mode ON for sandbox, OFF for production) |
| `PHONEPE_CLIENT_SECRET` | Same place |
| `PHONEPE_CLIENT_VERSION` | Same place |
| `PHONEPE_CALLBACK_USERNAME` / `PHONEPE_CALLBACK_PASSWORD` | You choose them when configuring the webhook in the dashboard. Enter the same values here |
| `PHONEPE_ENV` | `sandbox` first, then `production` |
| `PUBLIC_STOREFRONT_URL` | e.g. `https://www.<your-domain>`. The customer returns to `/order-success/<orderId>` |
| `PHONEPE_ENABLED` | `true` to turn it on |
| `PHONEPE_PRODUCTION_APPROVED` | `true` only after the sandbox sign-off below |

**Dashboard webhook URL:** `https://<api-host>/api/v1/payments/phonepe/callback`. Subscribe to order completed/failed and refund completed/failed/accepted events.

## Activation steps (sandbox first)

1. Install the official SDK in `Backend/`: `npm i @phonepe-pg/pg-sdk-node`. This is a new runtime dependency and needs approval. Confirm the package name and version in PhonePe's current docs.
2. Set the sandbox variables above in a **non-production** environment.
3. Check that `GET /api/v1/payments/methods` now lists PhonePe.
4. Place sandbox orders. Verify success, failure, abandonment (wait for the 30-minute expiry), a duplicate callback, and a refund (cancel a paid order before shipping).
5. **Verify these against the live SDK. The docs left them ambiguous or did not show them:**
   - Whether `getRefundStatus` takes the **merchantRefundId** (our `CP_<orderId>_R<n>`). The provider passes merchantRefundId.
   - The exact callback `type` names (`CHECKOUT_ORDER_COMPLETED` etc.). The handler re-checks status for any non-refund type, so naming differences cannot mark an order paid by themselves.
   - The error shape for "refund not found" (`httpStatusCode` 404 is treated as not found).
   - The `expireAt` units and how `expireAfter` behaves.
6. Review the `PaymentTransaction` rows and the admin order history for each test.
7. For production: switch to production credentials, `PHONEPE_ENV=production`, `PHONEPE_PRODUCTION_APPROVED=true`, deploy, and make one small real order and refund with the owner present.

## Not done / out of scope until approval

- The SDK is not installed, so there is no network code path in this repository today.
- No real or sandbox transactions.
- Partial refunds are not supported. Refunds are full order amount only.
