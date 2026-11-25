# Vercel — Frontend Setup

Status: **draft, not yet applied.** Requires `Frontend/vercel.json` (proposal in `deployment-audit.md` §7) for media and deep links.

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

## 2. Environment variables

This is **Create React App, not Vite** — use the `REACT_APP_` prefix. `VITE_` variables would be ignored.

CRA inlines these at **build time**. After changing one, you must **redeploy**; a restart doesn't pick it up. They are public: anyone can read them in the browser bundle, so never put secrets here.

| Name | Production value | Notes |
|---|---|---|
| `REACT_APP_API_URL` | `https://api.<your-domain>/api/v1` | **Required.** Without it, requests go to `/api/v1` on the Vercel domain and fail. No trailing slash |
| `REACT_APP_APP_TARGET` | `all` | `all` = storefront `/` + admin `/admin` in one deployment (simplest). `storefront` / `admin` for split deployments |
| `REACT_APP_ADMIN_URL` | *(only with `storefront`)* | Where `/admin` redirects on a storefront-only build |
| `REACT_APP_STOREFRONT_URL` | *(only with `admin`)* | "Back to store" link in the admin layout; defaults to `/` |

Set them for the **Production** environment. For **Preview** deployments, either point them at a staging API or accept that previews can't call the production API (CORS blocks unlisted origins).

## 3. Production API URL — avoiding localhost

- `package.json` `"proxy": "http://localhost:5000"` is a **dev-server-only** setting and is not used by `react-scripts build`.
- The only API base is `process.env.REACT_APP_API_URL || '/api/v1'`. A test build with the variable set contained **no** `localhost` strings.
- **Verify after deploy:** browser DevTools → Network: all API calls go to `https://api.<your-domain>/api/v1/...`.

## 4. Domains and cookies (blocker B1)

Login uses an httpOnly refresh cookie set with `SameSite=Strict`. It only reaches the API when the storefront and API are on the **same site**:

| Storefront | API | Sessions |
|---|---|---|
| `www.<domain>` | `api.<domain>` | ✅ work |
| `<project>.vercel.app` | `<service>.onrender.com` | ❌ users logged out ~15 min after login |

Add the custom domain in Vercel → Project → Domains, and the API subdomain on Render.

## 5. SPA routing and media (proposed `Frontend/vercel.json`)

```json
{
  "rewrites": [
    { "source": "/uploads/:path*", "destination": "https://<RENDER_API_HOST>/uploads/:path*" },
    { "source": "/((?!static/|uploads/|api/).*)", "destination": "/index.html" }
  ]
}
```

- **Rule 1:** product, review and avatar images are stored as `/uploads/...` paths. This rule proxies them to the backend. Without it, every uploaded image 404s on the storefront.
- **Rule 2:** deep links such as `/products/<slug>`, `/my-orders`, `/admin/orders` load the React app instead of a 404. Real files in `build/` are served first.

- `api/` is excluded so a misconfigured build (missing `REACT_APP_API_URL`) gets a clear 404, not HTML with status 200. `static/` is excluded so a stale hashed chunk returns 404 and doesn't trigger a confusing `ChunkLoadError`.
- **No loops:** `/index.html` is a real file, so it's served directly. The `/uploads` destination is an external host. No redirects are defined.

Approved. It will be created once the exact production Render API URL is provided.

## 6. Post-deploy checks (frontend only)

- Open a deep link directly (e.g. `/products/<real-slug>`) and refresh → page loads.
- Product images load (Network tab: `/uploads/...` → 200 image, not HTML).
- No CORS errors in the console.
- Log in, wait more than `JWT_EXPIRE` (default 15 min), reload → still logged in.
