# Data model — Charu Pottery

All changes are **additive**. No collection or field was renamed or removed, and existing documents stay valid.

## Changed collections

| Collection | Added | Notes |
|---|---|---|
| `orders` | `pricing{itemsPaise, discountPaise, shippingPaise, taxPaise, totalPaise, taxRateBasisPoints, couponCode}`, `payment{provider, status, amountPaise, currency, merchantOrderId, providerOrderId, transactionId, paymentMode, redirectUrl, paidAt, codCollection{…}, refund{…}, needsReview, reviewReason}`, `orderItems[].unitPricePaise/lineTotalPaise`, `idempotencyKey`, `requestFingerprint`, `reservationExpiresAt`, `source{channel, utm*, referrer}`, `primeReward{applied, rewardNumber}`, `cancelledBy`, `statusHistory[].actor/actorRole` | `orderStatus` enum gains `AwaitingPayment` and `Expired`. `paymentMethod` gains `PhonePe`. Legacy rupee fields and `isPaid` are kept and derived by the server |
| `products` | `reservedStock` | `stock` = available. Units reserved for unpaid online orders sit in `reservedStock` |
| `users` | `tokenVersion`, `marketingConsent.{whatsapp,email}{optedIn, optedInAt, optedOutAt, source}`, `loyalty.redeemedCount` | |
| `reviews` | `media[]`, `status` (pending/approved/rejected), `moderatedBy/At`, `moderationNote`, `reports[]`, `reportCount` | Reviews without `status` (legacy) are treated as approved |

## New collections

| Collection | Purpose | Key indexes |
|---|---|---|
| `inventorymovements` | Append-only stock ledger (INITIAL, RESERVE, RELEASE, COMMIT, SALE, RETURN_TO_STOCK, ADJUSTMENT) for products and inventory items | `{item, createdAt}`; unique `{order, item, type}` (partial) |
| `inventoryitems` | Packaging and other stock sections | `{category, name}`; unique `sku` (partial) |
| `paymenttransactions` | Gateway, COD and refund interaction history | `{order, createdAt}`; unique `eventKey` (partial) |
| `auditlogs` | Sensitive admin and money actions | `{entity, entityId, createdAt}`, `{action}`, `{actor}` |
| `coupons`, `couponredemptions` | Coupons and their per-order usage | unique `code`; unique `{order}` |
| `loyaltyledgers` | Prime REDEEM / REVERSE entries | unique `{order, type}` |
| `notifications` | Website notifications (per user or broadcast) | `{audience, user, createdAt}` |
| `messagecampaigns` | WhatsApp campaign records (currently BLOCKED) | — |
| `banners`, `sitecontents` | Homepage banners and brand content | `{placement, isActive, sortOrder}`; unique `key` |

## New indexes on `orders`

- unique `{user, idempotencyKey}` (partial: string keys only)
- unique `{payment.merchantOrderId}` (partial)
- `{orderStatus, reservationExpiresAt}`
- `{payment.status, createdAt}`
- `{createdAt}`

Mongoose builds indexes automatically at startup (`autoIndex`). On a large production collection, build them during a quiet period or create them manually first.

## Migration notes

- No migration is required for the app to run. Old orders keep working: they are cancelled through the legacy path, and their COD collection goes through `adoptLegacyCodOrder`.
- **Opening stock balances (recommended):** `node scripts/backfill-inventory-opening.js` (dry run) → `--apply`. It is insert-only, never changes stock, and refuses non-local hosts without `--i-understand-target=<host>`. Take a backup first. Owner approval is required.
- **Falsely-paid legacy orders (DEC-17):** non-COD orders with `isPaid: true` and no `payment` block were never really paid. They are excluded from revenue and counted in `legacyUnverifiedPaidOrders`. The owner decides what to do with them. No automatic change is made.
