# Deployment Audit — Charu Pottery (Render + Vercel)

Audit date: 2026-11-25 · Commit audited: `af5c737` (`main`, github.com/eZentix-Labs/CharuPottery)
Status: **NOT READY for production.** Builds and tests pass, but the blockers in §6 must be resolved first.

Nothing was deployed, no infrastructure was touched, and no application code was changed during this audit.

## 1. Repository structure (verified)

```
/                         monorepo root (no root package.json; a stray package-lock.json is git-ignored)
├── Backend/              Express 4 + Mongoose 8 REST API (CommonJS)
│   ├── server.js         entry point (npm start → node server.js)
│   ├── app.js            createApp(): middleware, CORS, routes, /api/v1/health
│   ├── config/           db.js, payments.js (PhonePe), commerce.js, cloudinary.js
│   ├── controllers/ models/ routes/ services/ middleware/ utils/
│   ├── scripts/          dev-memory-server.js (dev only), backfill-inventory-opening.js, demo-catalog.js
│   ├── legacy/stripe/    retired Stripe code (webhook now returns 410)
│   ├── tests/            Jest + supertest + mongodb-memory-server (10 suites)
│   └── uploads/          local media store (only .gitkeep is committed)
├── Frontend/             Create React App (react-scripts 5.0.1), React 18, react-router 6
│   ├── src/              storefront + lazily-loaded admin app (src/admin)
│   └── public/index.html
├── docs/
│   ├── charu-pottery/    architecture, API contracts, decisions, etc.
│   ├── client-requirements/Charu Pottery Website Needs.pdf
│   └── deployment/       (this folder)
├── CLAUDE.md
└── .claude/launch.json   (local dev launcher; settings.local.json is git-ignored)
```

Directory names are capitalised: **`Backend`** and **`Frontend`** (case matters on Render/Vercel Linux builders).

## 2. Backend findings

| Item | Finding |
|---|---|
| Entry point | `Backend/server.js` → validates `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (exits 1 if missing) → connects Mongo → `app.listen(PORT)` |
| PORT | `process.env.PORT \|\| 5000` — Render's injected `PORT` is honoured |
| Bind address | `app.listen(PORT)` with no host → Node listens on all interfaces (`::`/`0.0.0.0`). OK for Render |
| Health check | `GET /api/v1/health` → 200 when DB connected, 503 otherwise; also reports transaction support. No secrets in output |
| Node version | `engines.node: ">=18.0.0"`; tests verified on Node 22.22.1. Pin Node 22 on Render |
| Lockfile | Was git-ignored (B3). **Fixed locally 2026-11-25** — ignore rules removed; `npm ci` verified (not yet committed) |
| Scripts | `start`, `dev` (nodemon), `test` (jest), `seed` (local-only, refuses non-localhost DBs), `dev:memory` (dev only) |
| MongoDB | `mongoose.connect(MONGO_URI)`. Local `.env` points at a **localhost** MongoDB — no hosted provider is configured yet. Checkout, cancellation, refunds and stock changes **require a replica set** (multi-document transactions); otherwise they return 503 |
| API base | All routes under `/api/v1/*` (auth, account, products, categories, cart, orders, payments, reviews, upload, content, admin) |
| CORS | Exact-origin allow-list from `CLIENT_URL` and `ADMIN_URL` (comma-separated). Falls back to `http://localhost:3000` if both unset. `credentials: true`. Not a wildcard ✔ |
| Auth | Access JWT (default 15m) returned in JSON + httpOnly cookie; refresh JWT (30d) in httpOnly cookie. Cookies: `secure` in production, **`sameSite: 'strict'`** (see B1) |
| Trust proxy | `app.set('trust proxy', 1)` — correct for Render's single proxy hop |
| Rate limits | `/api` 300 req/15 min/IP; auth routes stricter. Payment callback exempt |
| Security middleware | helmet, express-mongo-sanitize, xss-clean, 20 kb JSON limit, compression |
| Uploads | Product images, review photos/videos, content images and avatars are written to **local disk** `Backend/uploads/` and stored in the DB as **relative URLs** `/uploads/...` (see B2). Type verified by magic bytes; size caps 8 MB image / 25 MB video / 3 MB avatar. Cloudinary is only used by `POST /api/v1/upload/products`, which the current frontend does not call |
| Payments | PhonePe (disabled unless configured; production requires `PHONEPE_ENV=production` **and** `PHONEPE_PRODUCTION_APPROVED=true`). COD enabled by default. Stripe is retired |
| Email | Nodemailer via SMTP_* — used for password reset |
| WhatsApp | No adapter; always disabled (pending client decision) |

## 3. Frontend findings

| Item | Finding |
|---|---|
| Framework | Create React App (`react-scripts build`), **not Vite** — env vars use the `REACT_APP_` prefix; there are no `VITE_` variables |
| Build output | `Frontend/build` |
| API URL | `REACT_APP_API_URL \|\| '/api/v1'`. The `"proxy": "http://localhost:5000"` in package.json is used **only by the dev server** and has no effect on production builds. If `REACT_APP_API_URL` is unset in production, requests go to the Vercel domain's `/api/v1` and fail |
| Localhost check | Production build with `REACT_APP_API_URL` set contains **no** `localhost` URLs (verified by grepping the built JS) |
| Build targets | `REACT_APP_APP_TARGET` = `all` (default: storefront at `/`, admin at `/admin`), `storefront`, or `admin` |
| SPA routing | Uses `BrowserRouter`; there is **no `vercel.json`**. Vercel's CRA preset normally serves `index.html` for unknown paths, but this must be verified on deep links (e.g. `/products/some-slug`, `/admin/orders`) after the first deploy |
| Media URLs | Cards and detail pages render `image.url` as-is, so `/uploads/...` resolves against the **Vercel** domain, not the API (see B2). Only `AdminReviewsPage` rewrites to the API host |
| Placeholder | `ProductCard` falls back to `/placeholder.jpg`, which does not exist in `public/` (cosmetic) |

## 4. Build and test results (run 2026-11-25, local Windows, Node 22.22.1 / npm 10.9.4)

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd Backend && npx jest --runInBand` | **10/10 suites, 98/98 tests passed** (in-memory replica set) |
| Frontend tests | — | None exist (no test files, no `test` script) |
| Frontend prod build | `CI=true REACT_APP_API_URL=https://example-backend.onrender.com/api/v1 react-scripts build` | **Compiled successfully** with `CI=true` (warnings would fail on Vercel; there were none). main.js 121 kB gz, admin chunk 19 kB gz |
| Localhost in bundle | grep built JS | none |
| TypeScript | — | Not applicable (plain JS) |
| Lint | — | No separate lint script; CRA's ESLint ran during build with no warnings |
| Backend production start | — | **Not run**: there is no production MongoDB to connect to |
| `npm audit --omit=dev` (Backend) | | 8 vulns: 2 critical (mongoose, proxy-addr), 4 high (body-parser, cloudinary, compression, nodemailer), 2 moderate. Computed from the **local, uncommitted** lockfile |
| `npm audit --omit=dev` (Frontend) | | 49 vulns (2 critical, 28 high) — almost all in `react-scripts` build tooling, which is not shipped to browsers; `axios` (direct, runtime) has a non-breaking fix |

## 5. Security findings

| # | Severity | Finding |
|---|---|---|
| S1 | **High** | The GitHub repository is **public**. It contains the client document `docs/client-requirements/Charu Pottery Website Needs.pdf`, internal docs and `CLAUDE.md`. Make the repo private, or remove the PDF and purge it from history. Render and Vercel both deploy from private repos |
| S2 | OK | No `.env` file is, or has ever been, committed. A scan of tracked files found no Mongo credentials, Stripe/AWS keys or private keys |
| S3 | OK | JWT secrets come only from env; the server refuses to start without them |
| S4 | Low | `utils/seeder.js` (public) contains a fixed dev admin password. It refuses to run against any non-localhost DB or with `NODE_ENV=production`, so it can't affect production — but never reuse that password |
| S5 | OK | CORS is an exact-origin allow-list, not `*` |
| S6 | Medium | Dependency vulnerabilities (§4). Runtime backend packages (mongoose, body-parser/express, nodemailer, cloudinary) should be updated in a separate, tested change |
| S7 | OK | Uploads: magic-byte type check, size limits, served with `nosniff` and `dotfiles: deny` |
| S8 | OK | Dev-only features (`dev:memory`, demo catalogue, `DEV_ADMIN_*`) run only via the dev script, never from `npm start`. `morgan` only in development; stack traces only in development error responses |
| S9 | Low | `xss-clean` is deprecated/unmaintained (still functional) |

## 6. Deployment blockers

| ID | Blocker | Why it breaks production | Smallest safe fix (needs approval) |
|---|---|---|---|
| **B1** | Auth cookies are `SameSite=Strict` while frontend and API would be on different sites (`*.vercel.app` vs `*.onrender.com`) | Browsers won't send the refresh cookie on cross-site API calls → silent refresh fails → **every user is logged out ~15 min after login** (`JWT_EXPIRE` default) | **Preferred, no code change:** use custom domains under one registrable domain, e.g. `www.<domain>` (Vercel) and `api.<domain>` (Render). They are then *same-site* and Strict cookies work. Alternative (code change to auth, not recommended without review): `sameSite: 'none'` in production |
| **B2** | Uploaded media lives on local disk with relative `/uploads/...` URLs | (a) Render's filesystem is **ephemeral**: every deploy/restart erases all product images, review media and avatars. (b) The storefront resolves `/uploads/...` against the Vercel domain → images 404 | **Config-only:** attach a Render Persistent Disk (paid instance) mounted at `/opt/render/project/src/Backend/uploads`, **and** add `Frontend/vercel.json` rewriting `/uploads/:path*` to the Render API. Long term: move to object storage (Cloudinary/S3) — a code change |
| **B3** | `package-lock.json` is git-ignored in `/`, `Backend/` and `Frontend/` | Render/Vercel resolve fresh versions on every build → non-reproducible builds, and `npm ci` is impossible **Done locally (uncommitted):** rules removed; Frontend lockfile gained one missing entry (`tailwindcss/node_modules/yaml@2.9.1`, an optional peer), no version changes; clean `npm ci` passes in both packages |
| **B4** | No production MongoDB | Local `.env` uses localhost. The app needs a **replica set** for checkout/refunds/stock | Create a MongoDB Atlas cluster (every Atlas tier, including M0, is a replica set). Manual, see render-backend-setup.md |
| **B5** | No way to create the first admin in production | `npm run seed` deliberately refuses non-local DBs; there is no admin-bootstrap script **Done locally (uncommitted):** `Backend/scripts/promote-admin.js` (+ `tests/promoteAdmin.test.js`). Procedure in render-backend-setup.md §7 |
| B6 (verify) | SPA deep links | No `vercel.json`; deep links must serve `index.html` | Include an SPA fallback rewrite in the same `vercel.json` as B2 |

Non-blocking: missing `/placeholder.jpg`; `npm audit` items; PhonePe stays off until approved (COD works); password-reset email needs SMTP.

## 7. Remediation status (2026-11-25, local only — not committed or pushed)

Item 1 is waiting for the production Render API URL. Items 2 and 3 are implemented and verified locally.

1. **`Frontend/vercel.json`** (new file, config only):
   ```json
   {
     "rewrites": [
       { "source": "/uploads/:path*", "destination": "https://<RENDER_API_HOST>/uploads/:path*" },
       { "source": "/((?!static/|uploads/|api/).*)", "destination": "/index.html" }
     ]
   }
   ```
   `<RENDER_API_HOST>` must be filled in once the Render URL or custom API domain is known.
2. **Lockfiles — done.** Root rule anchored to `/package-lock.json` (still ignores the empty stray root lockfile); the rule was removed from `Backend/.gitignore` and `Frontend/.gitignore`.
3. **Admin promotion script — done.** `Backend/scripts/promote-admin.js`; see render-backend-setup.md §7.

Auth cookie behaviour (B1) is intentionally **not** proposed as a code change; custom domains solve it without touching authentication.
