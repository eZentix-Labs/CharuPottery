# Client Decision Register — Charu Pottery

**Status values:** `APPROVED` (owner approved) · `PROPOSED` (recommended, waiting on the owner) · `PENDING_CLIENT` (needs the client's business input) · `VERIFY` (a fact to confirm).

**"Blocks Phase 1"** means Phase 1 can't start, or can't finish safely, without this answer.

## Already decided (2026-11-24)

| ID | Decision | Status |
|---|---|---|
| D1 | The owner provides `CLAUDE.md` and the client PDF | ✅ Done |
| D2 | Frontend API base is `REACT_APP_API_URL \|\| '/api/v1'` | APPROVED, implemented (`Frontend/src/api/axios.js`) |
| D3 | Payment provider: keep **Stripe** | APPROVED, but see DEC-01a |
| D4 | Admin becomes a separate CRA app (`Admin/`) | APPROVED. The PDF supports it ("don't want to merge them") |

## Register

| ID | Topic | Options | Recommendation | Impact | Blocks Phase 1? | Status |
|---|---|---|---|---|---|---|
| **DEC-01a** | **Can the client actually take live INR payments through Stripe?** Stripe has been **invite-only in India since May 2024**, and new Indian accounts need video KYC (RBI rules, effective 1 Jan 2026). The configured key is a **test** key, and we don't know whose account it is. | (a) The client already has an active, invited Stripe India account. (b) Request an invite. (c) Revisit D3 (e.g. Razorpay) | Confirm (a) before go-live. Phase 1 can be built and tested in Stripe **test mode** either way, and the payment code sits behind a gateway adapter so switching providers stays contained | High. Without an account the shop can't take card payments in production | No for build and test. **Yes for go-live** | VERIFY |
| DEC-01b | Who owns the Stripe test account currently in `Backend/.env`? Can I use the Stripe CLI against it (`stripe listen`) for manual webhook testing? | — | Owner confirms, and runs `stripe login` themselves | Needed for the manual end-to-end webhook check (automated tests don't need it) | Partly (manual end-to-end only) | PENDING |
| **DEC-02** | Payment methods. **COD**: the current checkout offers it, but the PDF doesn't mention it. **UPI**: offered in checkout but has **no integration**. It just marks the order paid | COD: keep / remove. UPI: remove the fake option / provide it via Stripe Payment Element only if the account supports it | Keep COD as it works today (stock is committed at placement; payment is marked collected by admin). **Remove the fake UPI option now.** Show only methods Stripe enables on the account | Defines the checkout state machine | **Yes** | PROPOSED |
| **DEC-03** | When stock is taken for card orders | (a) **Reserve at checkout start, with a time limit** (released if unpaid). (b) Decrement only after payment succeeds (risk: paid but sold out, so refund) | (a), with a **30-minute** hold. Handmade items have low stock, so (b) would cause frequent paid-then-refunded orders | Affects stock shown to other customers during the hold | **Yes** | PROPOSED |
| DEC-04 | Shipping provider, service areas, delivery charges | — | Keep today's ₹99 flat, free over ₹2000, **moved into one server config**, labelled provisional | Totals | No (values unchanged) | PENDING_CLIENT |
| DEC-05 | GST and invoices. The current 5% "example" tax is hard-coded in both backend and frontend | — | Keep 5% in one server config, labelled provisional. The client's accountant must confirm the HSN codes and rate, and whether prices include tax | Totals and legal invoices | No (value unchanged) | PENDING_CLIENT |
| **DEC-06** | Cancellation and refund policy | Cancel window (before Shipped, as today?). Refund on cancel: automatic and full (including shipping?) or admin-approved. Returns and damaged items | Phase 1: customer can cancel before **Shipped** (existing rule). A paid order cancelled before shipping gets an **automatic full refund including shipping** through Stripe. Admin can also cancel and refund. Returns and damaged-item claims are deferred until the client sets a policy | Money movement | **Yes** (the refund rule) | PROPOSED |
| DEC-07 | WhatsApp provider, templates, consent. The PDF says customers should get offers "on their whatsapp mainly" when they log in. **Logging in is not consent**: explicit opt-in is needed (WhatsApp Business policy; India's DPDP Act) | Meta Cloud API direct / a provider such as Gupshup, Twilio, Interakt. Opt-in checkbox plus phone verification | Explicit opt-in at signup and in the profile, with opt-out. Provider chosen by the client | Phase 9 | No | PENDING_CLIENT |
| DEC-08 | Product variants or customization | — | None until the client asks | Product model | No | PENDING_CLIENT |
| DEC-09 | Social posts and reels ("fetching … from Charu Pottery media handles") | Instagram Graph API (needs a Business/Creator account plus a Meta app) / an admin-managed list of embedded links | Admin-managed links first; official API if the client provides access | Phase 8 | No | PENDING_CLIENT |
| DEC-10 | Moderation of reviews and customer photos/videos | Pre-moderation / post-moderation. Size and length limits | Pre-moderate media; text reviews only from verified purchasers | Phase 7 | No | PENDING_CLIENT |
| DEC-11 | Prime Collection rules | What counts as a purchase (paid? delivered? minimum value? after the return window?). Effect of a cancel or refund. Gift choice and stock. Automatic or chosen by the customer. **What "some entertainment" means** (e.g. a scratch-card or reveal animation). Is "Prime Collection" also a product range only for loyal customers? | Count **delivered, non-refunded** orders only. One redemption per cycle of 5 | Phase 10 | No | PENDING_CLIENT |
| DEC-12 | Admin roles | Single `admin` (today) / owner plus staff with limited rights | Single admin for now; design the auth checks so roles can be added | Phase 1B | No | PENDING_CLIENT |
| DEC-13 | Catalogue content: real photos, product copy, founder and co-founder bios, workshop address, social handles | — | Client supplies them. Clearly labelled placeholders in development only | Phases 3 and 8 | No | PENDING_CLIENT |
| DEC-14 | "how many orders come and **from where**" | Geography (city/state from the shipping address, available today) / channel (Instagram, WhatsApp, direct, captured with UTM/referrer at checkout) | Both: geography from existing data, channel captured going forward | Phases 4 and 11 | No | PENDING_CLIENT |
| **DEC-15** | Database for transactions. MongoDB is **not installed and not running** on this machine (`ECONNREFUSED 127.0.0.1:27017`). Multi-document transactions need a **replica set**. Production on Render must also be checked: Atlas is fine; a standalone server is not | Local: install MongoDB Community as a single-node replica set `rs0` / Docker / a free Atlas development cluster. Production: confirm the topology | Automated tests use an in-memory replica set (see DEC-16). For running the app locally, the owner installs MongoDB as `rs0` or provides an Atlas **development** URI. **I won't touch the production URI.** | Transactions | **Yes** (to run the app end to end; tests don't need it) | PROPOSED / VERIFY |
| **DEC-16** | New backend **dev** dependencies: `jest`, `supertest`, `mongodb-memory-server`. The last one downloads a `mongod` binary (~100 MB, cached) from fastdl.mongodb.org on first run | Approve / use Node's built-in `node:test` instead of jest (supertest and the memory server are still needed) | Approve all three as devDependencies only. No runtime dependency changes | Test infrastructure | **Yes** | PROPOSED |
| **DEC-17** | Existing **production** orders may be falsely marked paid: every non-COD order ever placed has `isPaid: true` with no real payment | Read-only report: count orders with `paymentMethod ≠ COD` and `isPaid: true` / leave them as they are | Read-only query against production **only with your explicit go-ahead**, then decide what to do with them. No writes | Business and accounting | No (but needed before go-live) | PENDING |
| **DEC-18** | Phase order. CLAUDE.md §13 puts payments in phase 4 | — | Do the payment, order and inventory integrity work **first** (as Phase 1A), because the defect lets anyone get "paid" orders for free. The rest of the foundation (admin app split, CORS allow-list, upload hardening, general audit log) becomes Phase 1B | Sequencing | **Yes** | PROPOSED |
| DEC-19 | Stripe publishable key for the frontend (`REACT_APP_STRIPE_PUBLISHABLE_KEY`, **test** key). `Frontend/.env` is currently empty | — | Owner adds the test publishable key locally | Card checkout UI | Partly | PENDING |

---

## Update 2026-11-24: owner's master implementation brief

The owner's brief **replaces D3 (Stripe)**. These items are now settled by the owner:

| ID | Decision | Status |
|---|---|---|
| D3′ | **Cash on Delivery is the only active payment method.** PhonePe Standard Checkout is prepared but **disabled** until merchant approval and credentials. The final architecture must not depend on Stripe | APPROVED (owner brief) |
| DEC-01a / DEC-01b / DEC-19 | Stripe account questions | OBSOLETE (Stripe no longer used) |
| DEC-02 | COD kept. UPI/Stripe fake options removed | APPROVED, implemented |
| DEC-03 | 30-minute reservation for **unpaid online** payments only | APPROVED, implemented (PhonePe path) |
| DEC-15 | Tests use an in-memory replica set. No local MongoDB install | APPROVED, implemented (`npm run dev:memory` for local runs) |
| DEC-16 | jest, supertest, mongodb-memory-server as devDependencies | APPROVED, kept |

### New items for the owner

| ID | Topic | Options | Recommendation | Impact | Status |
|---|---|---|---|---|---|
| **DEC-20** | Stripe leftovers: the `stripe` npm dependency and the code moved to `Backend/legacy/stripe/` (not loaded; the old webhook URL returns 410) | Keep for reference / delete the folder and `npm uninstall stripe` / keep the dependency | Delete both once you confirm Stripe will not be used | Smaller attack surface. No runtime effect today | PENDING |
| **DEC-21** | D4 said "separate CRA app `Admin/`". What was built is a **separate admin bundle inside `Frontend/`**: its own login, layout, routes and lazily-loaded JS chunk. `REACT_APP_APP_TARGET=storefront` / `admin` produce **separate builds and deployments** without duplicating ~300 MB of dependencies | Accept / still move it to its own `Admin/` folder | Accept. The separation the PDF asks for ("don't want to merge them") is met in navigation, layout, access and deployment | Moving later is mechanical | PROPOSED |
| **DEC-22** | COD stock policy | Sell stock at placement (no timer) / reserve until shipped | Sell at placement, with no expiry, as implemented. Cancelling before shipping returns the stock exactly once | Stock shown to others drops immediately | PROPOSED (implemented) |
| **DEC-23** | COD cash collection rule | Only at Out for Delivery or Delivered; amount must equal the total; partial payments not supported | As implemented | Courier/partial cash cases need manual handling | PROPOSED (implemented) |
| **DEC-24** | Password policy for **new** passwords: min 8 characters with a letter and a number (existing accounts are not forced to change) | — | As implemented | Registration/reset UX | PROPOSED (implemented) |
| **DEC-25** | Review moderation default: **every** new or edited review is hidden until approved; text reviews allowed without purchase, with a "verified purchase" badge when there is a delivered order | Pre-moderate all / auto-approve text | As implemented, pending DEC-10 | Reviews appear with a delay | PROPOSED (implemented) |
| **DEC-26** | Prime Collection defaults (DEC-11 still open): qualifying = **Delivered + Paid + not refunded**, 5 per reward, reward-orders don't count, the customer ticks "use reward" at checkout, the admin adds the gift by hand, and the "entertainment" is a simple tap-to-reveal card | Configure via env (`PRIME_PURCHASES_PER_REWARD`, `PRIME_MIN_ORDER_PAISE`) | Confirm or change | Loyalty behaviour | PENDING_CLIENT |
| **DEC-27** | Uploaded images and videos are stored on the API server disk | Persistent disk / Cloudinary or S3 | Use Cloudinary or a persistent disk before launch | Media lost on redeploy otherwise | PENDING |
