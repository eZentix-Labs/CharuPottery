# Testing and acceptance

## How to run

```bash
cd Backend
npm test                 # Jest + Supertest + mongodb-memory-server (single-node replica set)
npm run dev:memory       # run the real API on an in-memory replica set (local only)
cd ../Frontend
npm start                # storefront http://localhost:3000, admin http://localhost:3000/admin
CI=true npm run build    # production build; lint warnings fail the build
```

If the system drive is full, point `TEMP`/`TMP` at a drive with space. The in-memory DB writes its data under `os.tmpdir()`. The mongod binary is cached in `~/.cache/mongodb-binaries`.

No test makes network calls. PhonePe uses an in-process fake SDK (`tests/helpers/fakePhonePeSdk.js`). WhatsApp has no provider, and sending is blocked outside production in any case.

## Automated suites (Backend/tests)

| Suite | Covers |
|---|---|
| `orders.cod.test.js` | COD checkout, pending payment, ledger SALE, cart cleared, client `isPaid` ignored, UPI/Stripe rejected, idempotency (sequential, concurrent, key reuse), status transitions, protected statuses, delivered ≠ paid, COD collection (amount, timing, duplicate, concurrent), cancel (restock once, ownership, shipped refused), COD manual refund, revenue analytics |
| `inventory.test.js` | 5 concurrent buyers for 1 unit, rollback on insufficient stock, concurrent cancels, compare-and-set conflict, adjustments (reason, never negative, concurrent), protected fields, packaging sections and ledger |
| `pricing.test.js` | Paise rounding, free shipping, discount price, stale price → 409, archived product, invalid quantities, coupons (percent/flat/min/expiry/per-user/usage limit under concurrency/release on cancel), admin coupon validation |
| `payments.phonepe.test.js` | Disabled by default, production guards, reserve and redirect, replay without a second `pay`, init failure + resume, pending, completed → paid, amount mismatch → review, failed → release, ownership, invalid/forged/duplicate/unknown callbacks, retry after 500, expiry (failed, pending past grace, completed race, late payment re-allocated or refunded), refund pending → completed, refund failure → retry → reconcile, refund failed, cancel while payment in progress |
| `auth.test.js` | Register (role ignored, password policy, duplicates, WhatsApp consent), login, generic errors, deactivated users, missing/invalid/expired/forged tokens, refresh revoked on logout, forgot-password non-enumeration, admin surface 401/403, role escalation, addresses, wishlist |
| `products.test.js` | Multipart create with verified image + ledger, disguised upload rejected, unsafe image URLs stripped, archive/visibility, permanent delete guard, filter whitelist and caps, operator injection, availability, featured, new arrivals, related |
| `loyalty.test.js` | Qualifying count rules, reward after 5, single and concurrent redemption, reversal on cancel, refunded orders stop counting |
| `reviews-content.test.js` | Pre-moderation and approval, rating counts approved only, media validation, verified purchase, reports, brand content validation, banners window, site notifications read state, WhatsApp consent/suppression/BLOCKED, consent API, admin customer DB + audit |
| `legacyOrders.test.js` | Pre-upgrade orders: cancel restocks once, no invented refund, legacy COD collection |
| `transactionGuard.test.js` | Standalone DB → checkout 503, nothing written. Browsing and health still work |

## Acceptance checklist (CLAUDE.md §9)

| Check | Evidence |
|---|---|
| Customer cannot access admin functions | `auth.test.js` role restrictions; `orders.cod.test.js` customers vs admin actions; E2E smoke |
| Unauthorised users cannot access protected data | `auth.test.js`; ownership tests in orders/payments |
| Product create/edit/list and image upload | `products.test.js` (API). UI: build only |
| Totals calculated server-side | `pricing.test.js`; checkout ignores client prices |
| Duplicate checkout/callbacks → no duplicates | idempotency + callback dedupe tests; E2E double-submit |
| Inventory consistent under concurrency | `inventory.test.js`; E2E last-piece race |
| Loyalty rewards cannot be redeemed twice | `loyalty.test.js` |
| Reviews and media follow moderation | `reviews-content.test.js` |
| WhatsApp not sent without consent | `reviews-content.test.js` |
| Admin actions auditable | AuditLog assertions across suites |

## Not yet verified

- **Browser walkthrough of the UI** (customer and admin) was not performed. Pages compile in the production build only.
- Accessibility was not audited beyond labels and roles added in new screens. Contrast and keyboard order are unverified.
- Performance and load testing were not done.
- Live PhonePe sandbox: blocked by credentials.
