# Production Verification Checklist

Tick each item on the **live** deployment. Use test accounts only, and never paste tokens or customer data into tickets or chat.

## Before first deploy
- [ ] Repo made private, or the client PDF removed (S1)
- [ ] Lockfiles committed (B3)
- [ ] `Frontend/vercel.json` added with the real API host (B2/B6)
- [ ] MongoDB Atlas cluster created; app-scoped DB user; network access configured (B4)
- [ ] Custom domains decided: `www.<domain>` + `api.<domain>` (B1)
- [ ] Render Persistent Disk attached at `/opt/render/project/src/Backend/uploads` (B2)
- [ ] All required env vars set on Render and Vercel (see reference); no `DEV_*`/`STRIPE_*` on Render

## Backend
- [ ] `GET /api/v1/health` → 200, `database: connected`, `transactions: supported`
- [ ] Render logs: no `Missing required environment variables`, no `db.transactions_unavailable`
- [ ] `GET /api/v1/products` and `/api/v1/categories` → 200
- [ ] Requests from an unlisted origin get no `Access-Control-Allow-Origin` header

## Frontend
- [ ] Home, Shop, product detail, cart, checkout render; no console errors
- [ ] DevTools Network: API calls go to `https://api.<domain>/api/v1`, never `localhost`
- [ ] Deep link refresh works (`/products/<slug>`, `/my-orders`, `/admin`)
- [ ] Mobile view at ~390 px: no horizontal scroll; filter drawer opens and closes

## Auth and session
- [ ] Register, log out, log in
- [ ] Still logged in after waiting longer than `JWT_EXPIRE`, then reloading (refresh cookie works — B1)
- [ ] Cookies show `Secure`, `HttpOnly`
- [ ] Customer account gets 403 on `/api/v1/admin/*`; admin UI not reachable
- [ ] First admin promoted via Atlas; `/admin` login works

## Commerce (test data only)
- [ ] Add to cart; totals match server-calculated values
- [ ] COD order placed; stock decremented once; order visible in My Orders and Admin → Orders
- [ ] Double-clicking "Place order" creates one order (idempotency)
- [ ] Order cancel restores stock
- [ ] PhonePe shows as unavailable unless deliberately enabled

## Media
- [ ] Admin creates a product with an image → image displays on the storefront
- [ ] **Redeploy the backend** → that image still displays (persistent disk)
- [ ] Non-image upload is rejected with a clear error

## Email (if SMTP configured)
- [ ] Forgot-password email arrives; link points at `CLIENT_URL`

## Ops
- [ ] Render health check is green; alert/notification email configured
- [ ] Atlas backups enabled (M10+), or a manual `mongodump` schedule documented (M0 has no backups)
- [ ] Note the last-known-good Render deploy and Vercel deployment (for rollback)
