# Environment Variables Reference

These names come from the source code (`process.env.*`) and the `.env.example` files. **No values or secrets are recorded here.** Configure backend variables in **Render → Environment** and frontend variables in **Vercel → Settings → Environment Variables**. Never commit `.env` files (they are git-ignored).

Legend: **R** = required · **Rec** = recommended · **O** = optional · **✕** = do not set in production

## Backend (Render)

### Core / runtime
| Name | Need | Purpose | Default if unset |
|---|---|---|---|
| `NODE_ENV` | R | Must be `production`: secure cookies, PhonePe production guard, no dev logging/stack traces | `development` behaviour |
| `PORT` | ✕ (Render injects) | HTTP port | 5000 |
| `NODE_VERSION` | Rec | Render build/runtime Node version (Render setting, not read by app code) | Render default |
| `MONGO_URI` | **R** (startup check) | MongoDB connection string. Must point at a **replica set** (Atlas) | server exits |

### URLs and CORS
| Name | Need | Purpose |
|---|---|---|
| `CLIENT_URL` | **R** | Storefront origin(s), comma-separated, exact match, no trailing slash. CORS allow-list, and the base for password-reset links |
| `ADMIN_URL` | O | Extra allowed origin(s) for a separately hosted admin app |
| `PUBLIC_STOREFRONT_URL` | Rec | Public storefront base used for payment redirect URLs (required before PhonePe can be enabled) |

### Authentication
| Name | Need | Purpose | Default |
|---|---|---|---|
| `JWT_SECRET` | **R** (startup check) | Signs access tokens. Long random secret | server exits |
| `JWT_REFRESH_SECRET` | **R** (startup check) | Signs refresh tokens. Different from `JWT_SECRET` | server exits |
| `JWT_EXPIRE` | Rec | Access-token lifetime (e.g. `15m`) | `15m` |
| `JWT_REFRESH_EXPIRE` | Rec | Refresh-token lifetime | `30d` |
| `JWT_COOKIE_EXPIRE` | Rec | Access-token cookie lifetime, in days | `7` |

### Commerce rules (see `Backend/config/commerce.js`; business values need client approval)
| Name | Need | Purpose |
|---|---|---|
| `TAX_RATE_BPS` | O | Tax rate in basis points |
| `SHIPPING_FLAT_PAISE` | O | Flat shipping charge (paise) |
| `FREE_SHIPPING_ABOVE_PAISE` | O | Free-shipping threshold (paise) |
| `ONLINE_RESERVATION_MINUTES` | O | Stock hold time for pending online payments |
| `MAX_QTY_PER_LINE` | O | Cart/order line quantity cap |
| `MAX_LINES_PER_ORDER` | O | Order line-count cap |
| `PRIME_PURCHASES_PER_REWARD` | O | Prime Collection loyalty threshold |
| `PRIME_MIN_ORDER_PAISE` | O | Minimum order value counted for loyalty |
| `COD_ENABLED` | Rec | Cash on delivery on/off (`true` if unset) |

### Payments — PhonePe (keep disabled until production approval)
| Name | Need | Purpose |
|---|---|---|
| `PHONEPE_ENABLED` | O | Master switch |
| `PHONEPE_ENV` | O | `sandbox` / `production`. Production requires `production` |
| `PHONEPE_CLIENT_ID` | O (secret) | PhonePe credential |
| `PHONEPE_CLIENT_SECRET` | O (secret) | PhonePe credential |
| `PHONEPE_CLIENT_VERSION` | O | PhonePe credential version |
| `PHONEPE_CALLBACK_USERNAME` | O (secret) | Verifies PhonePe server callbacks |
| `PHONEPE_CALLBACK_PASSWORD` | O (secret) | Verifies PhonePe server callbacks |
| `PHONEPE_PRODUCTION_APPROVED` | O | Must be `true` to allow production payments (deliberate safety gate) |

See `docs/charu-pottery/phonepe-activation.md`.

### Email (password reset)
| Name | Need | Purpose |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT` | O | SMTP server |
| `SMTP_EMAIL`, `SMTP_PASSWORD` | O (secret) | SMTP login |
| `FROM_NAME`, `FROM_EMAIL` | O | Sender identity |

Without these, "forgot password" emails fail.

### Media / messaging
| Name | Need | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | O (secret) | Only used by `POST /api/v1/upload/products`, which the current UI does not call. Product/review/avatar uploads go to local disk |
| `WHATSAPP_PROVIDER` | ✕ for now | No adapter is implemented, so messaging stays disabled |

### Development / test only — never set on Render
`DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `DEV_DEMO_CATALOG` (used only by `scripts/dev-memory-server.js`), `LOG_IN_TESTS` (Jest), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Stripe retired; present in local `.env` only, not referenced by live code).

## Frontend (Vercel) — build-time and public

| Name | Need | Purpose |
|---|---|---|
| `REACT_APP_API_URL` | **R** | Full API base, e.g. `https://api.<domain>/api/v1` |
| `REACT_APP_APP_TARGET` | Rec | `all` (default) / `storefront` / `admin` |
| `REACT_APP_ADMIN_URL` | O | Admin URL for `storefront`-only builds |
| `REACT_APP_STOREFRONT_URL` | O | Storefront URL for `admin`-only builds |

All `REACT_APP_*` values are embedded in the public JS bundle. Never put secrets in them. Changing one requires a redeploy.
