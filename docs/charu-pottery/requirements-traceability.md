# Requirements Traceability — Charu Pottery

**Source:** `docs/client-requirements/Charu Pottery Website Needs.pdf` (2 pages, dated 20 Nov 2026). The client's wording is quoted where it matters.

**Status keys**
- **Type:** `REQUIRED` = the client stated it explicitly. `RECOMMENDED` = engineering proposes it. `PENDING_CLIENT_DECISION` = it can't be built safely until the client confirms.
- **Existing:** ✅ works · ⚠️ partial or defective · ❌ missing.
- **Code** and **Tests** are filled in as each phase lands. Decision IDs (`DEC-xx`) refer to `client-decisions.md`.

## Customer panel

| ID | Requirement (client wording) | Type | Existing | Phase | Code | Tests |
|---|---|---|---|---|---|---|
| CP-CUST-001 | Home: "Search bar and the other icons like (cart, profile, wish list, etc.)" | REQUIRED | ⚠️ Navbar has search, cart, wishlist, profile; needs review | 3 | | |
| CP-CUST-002 | Home: "A scrollable banners slide like amazon and our hotel khoyai customer app has" | REQUIRED | ❌ No banner model or carousel | 3 / 8 | | |
| CP-CUST-003 | Home: "Simple and minimal product display" | REQUIRED | ⚠️ ProductCard exists | 3 | | |
| CP-CUST-004 | Home: footer with Charu Pottery social media pages | REQUIRED | ⚠️ Footer exists; links are not admin-managed | 3 / 8 | | |
| CP-CUST-005 | Home: "Other wanted things … (inspiration — amazon, comet, gullylabs)" (featured, new arrivals, categories) | REQUIRED (open-ended) | ⚠️ Featured and new-arrival flags exist | 3 | | |
| CP-CUST-010 | Product: "Main Image and the slides like the amazon product pages has" | REQUIRED | ⚠️ Multiple images; gallery to verify | 3 | | |
| CP-CUST-011 | Product: "Proper details of the product" | REQUIRED | ✅ Rich pottery attributes in the model | 3 | | |
| CP-CUST-012 | Product: "Customer review section" | REQUIRED | ⚠️ Reviews exist; no moderation; `isVerifiedPurchase` never set | 7 | | |
| CP-CUST-013 | Product: "About Us and review photo and video section (uploaded by customer)" | REQUIRED | ❌ Review images unused; no video; no moderation | 7 | | |
| CP-CUST-020 | Offers: "small updates weekly wise and the new launches, coupon codes and offers" | REQUIRED | ❌ No coupon or offer logic (cart fields only) | 8 | | |
| CP-CUST-021 | Offers: "Fetching some social media posts and reels from Charu Pottery media handles" | REQUIRED; method is a pending decision (DEC-09) | ❌ | 8 | | |
| CP-CUST-022 | "Display the founder and the Co-Founder info" | REQUIRED | ❌ | 8 | | |
| CP-CUST-023 | "Workshop location and the proper details about the brand" | REQUIRED | ⚠️ Static ContactPage | 8 | | |
| CP-CUST-024 | "Social Media direct links with their proper buttons" | REQUIRED | ⚠️ | 8 | | |
| CP-CUST-030 | Cart page | REQUIRED | ⚠️ Works, but the price is snapshotted when the item is added | 4 (**Phase 1 for pricing**) | | |
| CP-CUST-031 | Wish List page | REQUIRED | ✅ | 6 | | |
| CP-CUST-032 | Customer Profile page | REQUIRED | ⚠️ Addresses can't be edited or set as default | 6 | | |
| CP-CUST-040 | Prime Collection: "when some one buy at least 5 timer from us he or she can order 6th time with free gift and some entertainment on the website" | REQUIRED; rules are a pending decision (DEC-11) | ❌ | 10 | | |
| CP-CUST-050 | Checkout and payment (implied by e-commerce; **not mentioned in the PDF**) | RECOMMENDED; provider and methods are a pending decision (DEC-01, DEC-02) | ⚠️ **No real payment happens. Non-COD orders are marked paid** | **1** | | |
| CP-CUST-051 | Order history and tracking (implied) | RECOMMENDED | ⚠️ | 6 | | |
| CP-CUST-052 | Cancellation and refund (implied) | RECOMMENDED; policy is a pending decision (DEC-06) | ⚠️ Cancel restocks without a refund and is race-prone | **1** | | |

## Admin panel

| ID | Requirement (client wording) | Type | Existing | Phase | Code | Tests |
|---|---|---|---|---|---|---|
| CP-ADMIN-001 | Product: "simplest admin panel, where the admin can easily upload photos in one page and the other details" | REQUIRED | ⚠️ AdminProductFormPage (6 images) | 2 | | |
| CP-ADMIN-002 | Product: "simple listing way where the admin can select the products from the uploaded database" | REQUIRED | ⚠️ AdminProductsPage | 2 | | |
| CP-ADMIN-010 | Orders: "how many orders come and from where" | REQUIRED; meaning of "from where" is a pending decision (DEC-14) | ⚠️ Counts exist; no source | 4 / 11 | | |
| CP-ADMIN-011 | Orders: "The received order status section" | REQUIRED | ⚠️ Any status can be set; Cancelled/Refunded set by admin don't restock or refund | **1** (transitions) / 4 | | |
| CP-ADMIN-012 | Orders: "Post delivery customer review section" | REQUIRED | ❌ | 7 | | |
| CP-ADMIN-020 | Stock: "How many items we have, how many packaging material we have, etc." | REQUIRED | ⚠️ `Product.stock` only; no packaging | **1** (ledger core) / 5 | | |
| CP-ADMIN-021 | Stock: "You can add additional sections as you wish" | REQUIRED | ❌ | 5 | | |
| CP-ADMIN-030 | Customer DB: "logged in customer's details like their emails, phones, names, address" | REQUIRED | ❌ No admin customer views | 6 | | |
| CP-ADMIN-031 | "when someone logged into our website he got messages of offers and the new coupon codes on their whatsapp mainly, but also in their notification (like khoai have)" | REQUIRED; consent and provider are a pending decision (DEC-07) | ❌ | 9 | | |

## Cross-cutting

| ID | Requirement | Type | Existing | Phase |
|---|---|---|---|---|
| CP-XCUT-001 | "earthy colors like the light warm beige and the deep earth soil color" | REQUIRED | ⚠️ To audit against the existing CSS | 3 / 11 |
| CP-XCUT-002 | "Simple and minimal user friendly visuals" | REQUIRED | ⚠️ | all UI |
| CP-XCUT-003 | "The customer panel and the admin panel wants differently, don't want to merge them" | REQUIRED | ❌ One SPA today. Decision D4: separate `Admin/` app | 1B / 2 |
| CP-XCUT-004 | "if you think that some other features are needed so add them" | Authorizes RECOMMENDED items, subject to approval | — | — |
| CP-SEC-001 | Server-verified payments, idempotent orders and webhooks | RECOMMENDED (CLAUDE.md §8) | ❌ | **1** |
| CP-SEC-002 | Atomic, ledgered inventory | RECOMMENDED (CLAUDE.md §5.3) | ❌ | **1** |
| CP-SEC-003 | Audit log of sensitive admin actions | RECOMMENDED (CLAUDE.md §8) | ❌ | **1** (orders, refunds, stock) / 1B |
| CP-SEC-004 | Automated backend tests | RECOMMENDED (CLAUDE.md §9) | ❌ No test framework | **1** |

## Not in the PDF (from the master prompt or engineering)

Dashboard KPIs, refunds, coupon management, campaign logs and loyalty statistics are `RECOMMENDED`. The client authorized these under CP-XCUT-004 ("add them"), but each needs scope approval before it is built.


## Implementation status (2026-11-24)

The Code and Tests detail for every requirement ID is maintained in **`implementation-progress.md`**. Summary:
- All CP-SEC-001…004 items are implemented and tested.
- Every CP-CUST and CP-ADMIN item has an implemented, tested API. Customer and admin screens are compile-verified only, not browser-tested.
- Externally blocked:
  - PhonePe live payments (merchant approval and credentials).
  - WhatsApp sending (provider, templates, DEC-07).
  - Official social-media API (DEC-09).
  - Real catalogue and brand content (DEC-13).
- Business rules implemented as configurable defaults that need client confirmation: DEC-04/05 (shipping/tax), DEC-06 (refund on cancel), DEC-10 (moderation), DEC-11/26 (Prime Collection).
