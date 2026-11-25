# Vercel — Frontend Setup

Status: **configured locally, not deployed.** `Frontend/vercel.json` was created on 2026-11-25 for the live API `https://charupottery.onrender.com` (uncommitted).

## 1. Project settings

| Setting | Value |
|---|---|
| Repository / branch | `eZentix-Labs/CharuPottery` / `main` |
| **Root Directory** | `Frontend` (capital F) |
| **Framework Preset** | Create React App |
| **Build Command** | `npm run build` (runs `react-scripts build`) |
| **Output Directory** | `build` |
| Install Command | `npm ci` (needs the committed `Frontend/package-lock.json`; until it is pushed, leave the default) |
| Node.js version | 22.x (Project → Settings → General) |

Vercel sets `CI=true`, which turns ESLint warnings into build errors. A local build with `CI=true` compiled with **no warnings** on 2026-11-25.

## 2. Environment variables (exact production configuration)

This is **Create React App, not Vite**, so use the `REACT_APP_` prefix; `VITE_` variables would be ignored. Values are inlined at **build time**: after changing one you must **redeploy**. They are public (anyone can read them in the browser bundle), so never put secrets here.

Set these in Vercel → Project → Settings → Environment Variables → **Production**:

| Name | Value | Derived from |
|---|---|---|
| `REACT_APP_API_URL` | `https://charupottery.onrender.com/api/v1` | `src/api/axios.js` → `process.env.REACT_APP_API_URL || '/api/v1'`. No trailing slash |
| `REACT_APP_APP_TARGET` | `all` | `src/App.js`: `all` (also the default when unset) serves the storefront at `/` and the admin app at `/admin/*` from one deployment. Set it explicitly so the intent is visible |
| `GENERATE_SOURCEMAP` | `false` | Recommended, not required. CRA publishes `.map` files by default, which exposes the original source to anyone |

**Do not set:**
- `REACT_APP_ADMIN_URL`. It is read only by `ExternalAdminRedirect`, which is used only when `REACT_APP_APP_TARGET=storefront`. With `all`, `/admin` is served by this same deployment.
- `REACT_APP_STOREFRONT_URL`. It is read only by `AdminLayout.js` for the "View store" link, which defaults to `/`. With `all`, `/` is the storefront, so the default is correct.

**Preview deployments:** previews get their own `*.vercel.app` origins, which the API does not allow (CORS). Either leave previews without API access or add a staging backend. Do not add wildcard CORS.

## 3. Production API URL — verified

- A production build with the value above contains `https://charupottery.onrender.com/api/v1` exactly once in `main.*.js`, and **no** `localhost` in any shipped JS. The only `localhost` text is a code comment inside the `.map` file, which is another reason for `GENERATE_SOURCEMAP=false`.
- `package.json` `"proxy": "http://localhost:5000"` is used only by the dev server (`npm start`), never by `npm run build`.

## 4. Render settings this frontend depends on

| Render env var | Required value | Current state (probed 2026-11-25) |
|---|---|---|
| `CLIENT_URL` | The exact Vercel production origin, e.g. `https://<project>.vercel.app` (comma-separate if adding a custom domain later; no trailing slash) | ❌ **The API currently only allows `http://localhost:3000`**: either `CLIENT_URL` is unset or it is set to localhost. Until it's fixed, **every API call from Vercel is blocked by CORS** |
| `PUBLIC_STOREFRONT_URL` | The same storefront origin | Needed only before PhonePe is enabled (payment redirects). COD works without it |
| `NODE_ENV` | `production` | Enables `Secure` cookies |

`ADMIN_URL` is **not** needed, because the admin app is served from the same origin as the storefront.

## 5. Cross-site cookie limitation (blocker B1, still open)

`onrender.com` and `vercel.app` are both on the Public Suffix List. So `charupottery.onrender.com` is a **different site** from any `*.vercel.app` origin, and also from any custom storefront domain. The refresh cookie is `HttpOnly; Secure; SameSite=Strict`. Browsers neither store nor send a Strict cookie on these cross-site API calls, and Safari and Firefox block third-party cookies anyway.

What happens in practice:

| Flow | Works? |
|---|---|
| Register / login | ✅ The access token comes back in the JSON body and is sent as `Authorization: Bearer` |
| Browsing, cart, checkout, my orders, admin pages | ✅ while the access token is valid (`JWT_EXPIRE`, default 15 min) |
| Silent session refresh (`/auth/refresh-token`) | ❌ No cookie is sent, so the refresh returns 401, the token is cleared, and **the user is effectively logged out when the access token expires**. A cart in progress needs a re-login |
| Logout | ✅ (the server-side `tokenVersion` bump does not depend on the cookie) |

Options, none applied:
1. **Recommended, no code change:** custom domains on one registrable domain. For example `www.<domain>` (Vercel) and `api.<domain>` (Render custom domain), with `REACT_APP_API_URL=https://api.<domain>/api/v1` and `CLIENT_URL=https://www.<domain>`. Same-site, so Strict cookies work unchanged.
2. Proxy `/api` through Vercel (same-origin). It's config only, but the API would then see Vercel's IPs: with `trust proxy 1`, all users would share the 300/15 min API and 20/15 min auth rate limits. That would need a code change to the proxy-trust setting. Not recommended.
3. Change the cookie to `SameSite=None`. This is an **authentication change that weakens CSRF protection**, still fails under third-party-cookie blocking, and needs explicit approval. Not recommended.

Raising `JWT_EXPIRE` would hide the symptom but lengthens the lifetime of a stolen token. Don't do it without a security decision.

## 6. SPA routing and media — `Frontend/vercel.json` (created)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/uploads/:path*", "destination": "https://charupottery.onrender.com/uploads/:path*" },
    { "source": "/((?!static/|uploads/|api/).*)", "destination": "/index.html" }
  ]
}
```

Vercel serves real files from `build/` first, then applies rewrites top-to-bottom; the first match wins.

| Request | Result |
|---|---|
| `/static/js/main.<hash>.js`, `/favicon.ico`, `/index.html` | real file |
| `/uploads/products/x.jpg` | proxied to `https://charupottery.onrender.com/uploads/products/x.jpg` (rule 1) |
| `/products/<slug>`, `/admin/orders`, `/my-orders`, `/orders/<id>`, `/reset-password/<token>` | `/index.html`; React Router renders the page (rule 2) |
| `/static/js/missing.chunk.js` | **404** (excluded from rule 2, so a stale chunk fails clearly instead of returning HTML) |
| `/api/...` | **404** on Vercel (excluded; real API calls go straight to Render via `REACT_APP_API_URL`) |
| `/api` (no slash) | `/index.html`, and the app redirects to `/`. Harmless |

- **No loops:** `/index.html` is a real file, so it's served directly. The rule-1 destination is an external host. No `redirects` are defined.
- **Verify on the first preview deploy:** that Vercel's Create React App preset doesn't add its own catch-all fallback ahead of these rules. Request a missing `/static/js/x.js` and a missing `/api/x`, and both should be 404. The local simulation can't prove the platform's behaviour.
- **Persistent media:** rule 1 only works while files survive on Render. Confirm a Persistent Disk is mounted at `/opt/render/project/src/Backend/uploads` (see render-backend-setup.md §3), or every backend deploy deletes uploaded images.

## 7. Post-deploy checks (frontend only)

- Open a deep link directly (e.g. `/products/<real-slug>`) and refresh → page loads.
- Product images load (Network tab: `/uploads/...` → 200 image, not HTML).
- No CORS errors in the console.
- Log in, wait more than `JWT_EXPIRE` (default 15 min), reload → still logged in.
