# Implementation Progress — Charu Pottery (master tracker)

_Last updated: 2026-11-24. Nothing has been committed, pushed or deployed._

**How to resume:** read this file and `phase-status.md`. To run the tests:
`cd Backend && npm test` (Jest + in-memory MongoDB replica set). To run the app locally without MongoDB installed: `cd Backend && npm run dev:memory`, then `cd Frontend && npm start`.

Status values: ✅ done and tested · 🟡 done, partly verified · ⛔ blocked externally · ⏳ not started.
"Tests" names the test file; "UI build" means the code compiles in the production build but the screen was **not** exercised in a browser this session.

## Phase 0: Environment and repository recovery

| Item | Result |
|---|---|
| Temp dirs on D: | `TMP`/`TEMP` = `D:\claude-tmp`. Create, modify and delete probe succeeded |
| Free space | C: 1.4 MB free (still full), D: 109 GB free |
| Command output capture | Works |
| `fassert()` root cause | `mongod`'s data path defaulted to the full C: drive. Fixed: tests use `os.tmpdir()` (on D: in this session) |
| `ECONNRESET` | Harmless log line printed when `mongodb-memory-server` force-stops `mongod`. Not a failure; the smoke test passed (transaction committed, `setName testset`) |
| mongod binary | `~/.cache/mongodb-binaries/mongod-x64-win32-7.0.14.exe` (on C:, already downloaded). Read-only use, so it needs no C: space |
| npm cache | `C:\Users\…\AppData\Local\npm-cache` (unchanged). No installs were needed this session |
| Git | Backend `main` @ `634e62f`, Frontend `main` @ `870a77e`. The pre-existing changes (Backend `package.json` dev deps, Frontend `src/api/axios.js`) are preserved. The git index is untouched (no staging, no commits) |
| Actual project root | `D:\Pottery Web\Pottery Web\` (one level below the path given in the brief) |

## Requirement tracker

| ID | Module | State now | Key files | Impl. | Tests | Blockers |
|---|---|---|---|---|---|---|
| CP-SEC-001 | Server-verified payments, idempotent orders | COD never auto-paid. Idempotency-Key per user. Provider-verified online payments | `services/orderService.js`, `controllers/orderController.js` | ✅ | `orders.cod`, `payments.phonepe` | — |
| CP-SEC-002 | Atomic, ledgered inventory | Conditional `$inc` updates inside transactions. `InventoryMovement` ledger. Reserved, sold and available tracked separately | `services/inventory.js`, `models/InventoryMovement.js` | ✅ | `inventory`, `orders.cod`, `legacyOrders` | Production DB must be a replica set (Atlas): verify |
| CP-SEC-003 | Audit log | `AuditLog` covers orders, money, stock, products, coupons, content, reviews, customers | `services/audit.js` | ✅ | several | — |
| CP-SEC-004 | Automated tests | 98 Jest tests across 10 suites | `Backend/tests/**` | ✅ | — | — |
| CP-CUST-030 | Cart and pricing | Server repricing in paise. Price-change detection. 409 `PRICE_CHANGED` | `services/pricing.js`, `controllers/cartController.js` | ✅ | `pricing` | Tax and shipping values provisional (DEC-04/05) |
| CP-CUST-050 | Checkout (COD) | COD active. PhonePe prepared and disabled | `CheckoutPage.js`, `orderService.checkout` | ✅ API · 🟡 UI build | `orders.cod`, E2E smoke | — |
| CP-CUST-052 | Cancellation and refunds | Exactly-once restock. COD manual refund confirmation. PhonePe refund via provider with retry and reconcile | `orderService.cancelOrder/…Refund` | ✅ | `orders.cod`, `payments.phonepe` | Refund policy (DEC-06) proposed |
| CP-ADMIN-011 | Order status section | Strict transition table. Protected statuses only through dedicated actions | `services/orderStateMachine.js`, `AdminOrderDetailPage.js` | ✅ API · 🟡 UI | `orders.cod` | — |
| PAY-PHONEPE | PhonePe Standard Checkout | Provider module (official SDK surface), sandbox/production config, callback verification + server re-check, dedupe, reconcile, refunds | `services/payments/*`, `controllers/paymentController.js` | ✅ code (mocked) | `payments.phonepe` (fake SDK) | ⛔ Merchant approval and credentials; SDK not installed yet |
| PAY-STRIPE | Legacy Stripe | Fake-paid route removed. Code isolated in `legacy/stripe/`. Webhook URL returns 410 | `legacy/stripe/*` | ✅ | `orders.cod` (UPI/Stripe rejected) | DEC-20: remove the `stripe` dependency? |
| CP-CUST-001…005 | Home | Admin banners carousel (placeholder fallback), featured, new arrivals, categories, offers, weekly updates, social posts | `HomePage.js` | 🟡 UI build | API: `reviews-content` | Real photos and content (DEC-13) |
| CP-CUST-010/011 | Product detail | Existing gallery and details kept | `ProductDetailPage.js` | 🟡 (pre-existing) | `products` | — |
| CP-CUST-012/013 | Reviews and customer media | Pre-moderation. Images and videos validated by content. Reports. Verified-purchase badge | `reviewController.js`, `ProductDetailPage.js`, `AdminReviewsPage.js` | ✅ API · 🟡 UI | `reviews-content` | Policy DEC-10 pending |
| CP-CUST-020 | Offers and coupons | Coupons (percent/flat, caps, min order, dates, usage and per-user limits) validated server-side and atomically | `pricing.js`, `adminController` coupons | ✅ | `pricing` | — |
| CP-CUST-021 | Social posts | Admin-curated links and thumbnails (no scraping) | `contentController.js` | ✅ | `reviews-content` | Official API needs a Meta app (DEC-09) |
| CP-CUST-022/023/024 | Founders, workshop, social links | Admin-editable brand content, `/about` page, footer links | `AboutPage.js`, `Footer.js`, `AdminContentPage.js` | ✅ API · 🟡 UI | `reviews-content` | Content from client (DEC-13) |
| CP-CUST-031 | Wishlist | Existing. Product id now validated | `authController.toggleWishlist` | ✅ | `auth` | — |
| CP-CUST-032 | Profile and addresses | Address validation, edit, default, delete. Consent preferences. Notifications | `ProfilePage.js`, `authController` | ✅ API · 🟡 UI | `auth`, `reviews-content` | — |
| CP-CUST-040 | Prime Collection | Server-computed eligibility. Atomic one-time redemption. Ledger. Reversal on cancel. Tap-to-reveal gift | `services/loyalty.js`, `PrimeReveal.js` | ✅ API · 🟡 UI | `loyalty` | Rules PENDING (DEC-11); configurable defaults |
| CP-CUST-051 | Order history and tracking | Paginated, honest payment wording, refund state, tracking | `MyOrdersPage.js`, `OrderDetailPage.js` | 🟡 UI build | `orders.cod` | — |
| CP-ADMIN-001/002 | Product admin | Multi-image upload (content-verified), archive/restore view, stock compare-and-set | `productController.js`, `AdminProductFormPage.js` | ✅ API · 🟡 UI | `products`, `inventory` | — |
| CP-ADMIN-010 | Order counts and "from where" | By state on the dashboard. Source/UTM captured going forward | `adminController.getDashboard` | ✅ | `orders.cod` | DEC-14 meaning |
| CP-ADMIN-012 | Post-delivery reviews | Moderation queue | `AdminReviewsPage.js` | ✅ API · 🟡 UI | `reviews-content` | — |
| CP-ADMIN-020/021 | Stock, packaging, additional sections | Products + `InventoryItem` with free-form sections, suppliers, thresholds, ledger | `AdminInventoryPage.js` | ✅ API · 🟡 UI | `inventory` | — |
| CP-ADMIN-030 | Customer database | Search, totals, Prime status, audited detail view, deactivate | `AdminCustomersPage.js` | ✅ API · 🟡 UI | `reviews-content` | Single admin role (DEC-12) |
| CP-ADMIN-031 | Notifications and WhatsApp | Site notifications live. WhatsApp is a consent-gated integration point that sends nothing | `notifications.js`, `messaging/whatsapp.js` | ✅ site · ⛔ WhatsApp | `reviews-content` | Provider and templates (DEC-07) |
| CP-XCUT-001/002 | Brand look | Existing earthy token system reused. Admin uses the same tokens with a denser layout | `index.css`, `admin-common.css` | 🟡 | — | — |
| CP-XCUT-003 | Separate admin | Separate lazily-loaded admin bundle, own login and layout. `REACT_APP_APP_TARGET` builds a storefront-only or admin-only app | `App.js`, `src/admin/*` | ✅ build verified | storefront build contains no admin code | D4 revision for owner confirmation (DEC-21) |
| SEC-AUDIT | Security hardening | See `release-and-rollback.md` § Security changes | many | ✅ | `auth`, `products` | — |

## Tests executed (actual results, this session)

| Run | Result |
|---|---|
| Backend `npx jest --runInBand` | **98 passed / 98, 10 suites** (final run after all changes) |
| Frontend production build `CI=true react-scripts build` (target `all`) | Compiled successfully. Admin is a separate 19 kB chunk |
| Frontend production build, target `storefront` | Compiled successfully. No admin code emitted |
| E2E API smoke against a running server (in-memory replica set) | 21/21 checks passed: register, cart, quote, double-submit, COD pending, admin fulfilment, protected status, cash collection, duplicate refused, dashboard revenue, last-piece race |
| Browser UI walkthrough | **Not run.** Screens are compile-verified only |
| Lint | No separate lint script exists. CRA's build-time ESLint ran with CI=true (warnings fail the build): clean |
| Frontend unit tests | None exist (`react-scripts test` not configured with tests) |

## Next tasks (in order)

1. Owner: browser walkthrough of the customer and admin journeys (`npm run dev:memory` + `npm start`). Note issues.
2. Owner decisions: DEC-11 (Prime rules), DEC-10 (moderation), DEC-04/05 (shipping/GST), DEC-20/21, DEC-17.
3. Verify the production MongoDB is Atlas or another replica set **before** deploying (otherwise checkout returns 503 by design).
4. After approval and a backup: run `scripts/backfill-inventory-opening.js` (dry run first) on production.
5. PhonePe: when credentials arrive, follow `phonepe-activation.md` in sandbox first.
