# Render — Backend Web Service Setup

Status: **draft, not yet applied.** Resolve blockers B1–B5 in `deployment-audit.md` first.

## 1. Prerequisites

1. **MongoDB Atlas cluster** (must be a replica set; every Atlas tier including M0 is).
   - Create a database user with readWrite on the app database only. Do not use an Atlas admin user.
   - Network Access: Render's free/standard instances do not have fixed outbound IPs. Either allow `0.0.0.0/0` (protected by a strong password + TLS) or use Render's static outbound IPs (paid) and allow-list those.
   - Copy the `mongodb+srv://` connection string and include the database name, e.g. `.../charu_pottery?retryWrites=true&w=majority`.
2. Decide the API domain. **Recommended: `api.<your-domain>`**, on the same registrable domain as the storefront (fixes B1).
3. Repo access: Render must be authorised for `eZentix-Labs/CharuPottery`.

## 2. Service settings

| Setting | Value |
|---|---|
| Service type | Web Service |
| Repository / branch | `eZentix-Labs/CharuPottery` / `main` |
| **Root Directory** | `Backend` (capital B) |
| Runtime | Node |
| **Build Command** | `npm ci --omit=dev` (needs the committed `Backend/package-lock.json`; until it is pushed, use `npm install --omit=dev`) |
| **Start Command** | `npm start` (runs `node server.js`) |
| Node version | Env var `NODE_VERSION=22` (tests verified on 22.x; `engines` allows ≥18) |
| Instance type | A **paid instance** if you use a Persistent Disk (B2). Free instances sleep after inactivity (cold starts ~30–60 s) and cannot have disks |
| **Health Check Path** | `/api/v1/health` (returns 503 while the DB is down, so Render won't route traffic to a broken instance) |
| Auto-deploy | On commit to `main` (or manual, until the team is comfortable) |
| Instances | **1** while using a Persistent Disk (disks attach to a single instance) |

## 3. Persistent Disk (until media moves to object storage)

| Setting | Value |
|---|---|
| Mount path | `/opt/render/project/src/Backend/uploads` |
| Size | Start with 1–5 GB (images ≤ 8 MB, review videos ≤ 25 MB) |

Without the disk, **every deploy deletes all uploaded product images, review media and avatars.** Note that services with a disk get a short downtime on each deploy (no zero-downtime deploys).

## 4. Port and binding

- Do **not** set `PORT`. Render injects it, and `server.js` uses `process.env.PORT || 5000`.
- `app.listen(PORT)` binds all interfaces, which is what Render needs.
- `trust proxy` is already `1`, so rate limiting and `secure` cookies work behind Render's proxy.

## 5. Environment variables

Set these in **Render → Service → Environment**. Full descriptions are in `environment-variables-reference.md`.

**Required (server refuses to start without the first three):**
`MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CLIENT_URL`, `NODE_VERSION=22`

**Strongly recommended:**
`PUBLIC_STOREFRONT_URL`, `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, `JWT_COOKIE_EXPIRE`, `COD_ENABLED`

**Only if used:** `ADMIN_URL` (separate admin deployment), `SMTP_HOST`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD`, `FROM_NAME`, `FROM_EMAIL` (password-reset email), `PHONEPE_*` (only after PhonePe production approval), `CLOUDINARY_*` (not used by the current UI), commerce tuning (`TAX_RATE_BPS`, `SHIPPING_FLAT_PAISE`, `FREE_SHIPPING_ABOVE_PAISE`, `ONLINE_RESERVATION_MINUTES`, `PRIME_PURCHASES_PER_REWARD`, `PRIME_MIN_ORDER_PAISE`, `MAX_QTY_PER_LINE`, `MAX_LINES_PER_ORDER`)

**Never set on Render:** `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `DEV_DEMO_CATALOG`, `LOG_IN_TESTS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Stripe is retired).

Generate the JWT secrets as two **different** long random values, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, run locally. Never commit or paste them into docs or chat.

## 6. CORS for Vercel

`CLIENT_URL` must exactly match the storefront origin: scheme + host, no path, no trailing slash. A comma-separated list is allowed:

```
CLIENT_URL=https://www.<your-domain>,https://<your-domain>
```

- Requests from any origin not on the list get no CORS headers and are blocked by the browser.
- Vercel **preview** deployments (`*-<team>.vercel.app`) are *not* allowed unless listed exactly. There is no wildcard support, by design.
- If both `CLIENT_URL` and `ADMIN_URL` are empty, the API only allows `http://localhost:3000`. That's a safe failure, but production will be broken.

## 7. First admin account (B5) — `scripts/promote-admin.js`

`npm run seed` refuses to run against Atlas. This is intentional; do **not** bypass it. Use the promotion script instead. **It is never run automatically.** It is not part of the build or start command, and only a person can run it.

### What it does and refuses
- Changes **one existing, active** user from `user` → `admin`. `--revert` changes `admin` → `user`. It cannot set any other role: `--role` is rejected, and `artisan` accounts are refused.
- Updates the single matching document (matched by `_id` and its current role) and writes an `AuditLog` entry (`user.role.promote` / `user.role.revert`, with reason and operator) in **one majority-acknowledged transaction**. Needs a replica set (Atlas is one) and refuses otherwise.
- Never creates or deletes users, never sets passwords, and never prints `MONGO_URI`, credentials or tokens. Emails are masked in output.
- Revert also increments `tokenVersion`, which signs that user out everywhere, and refuses to remove the **last** active admin.
- Default is a **dry run**. Applying requires `--apply`, `--confirm-email=<same email>`, `--reason="..."`, and for any non-localhost database `--i-understand-target=<exact host>`. On a dry run, the script prints the host it expects.

### Execution
1. The owner registers a normal account on the live storefront, using a strong, unique password they choose. No default password exists.
2. Open a shell that already has the production `MONGO_URI`:
   - **Render Shell** (Service → Shell, paid instances): working directory is the repo root, so `cd Backend`.
   - Or locally: put `MONGO_URI` in `Backend/.env`, which is git-ignored. Don't type it on the command line, where it would be saved in shell history. Remove it again afterwards.
3. Dry run:
   ```
   node scripts/promote-admin.js --email=<owner-email>
   ```
   The first run against Atlas stops and prints `--i-understand-target=<host>`. Check that the host is the production cluster, then repeat with that flag. Expected: `WOULD change ow***@... (id ...): user -> admin`.
4. Apply:
   ```
   node scripts/promote-admin.js --email=<owner-email> --i-understand-target=<host> \
     --apply --confirm-email=<owner-email> --reason="First production admin, approved by <name>"
   ```
   Expected: `DONE: ... user -> admin. Audit entry written`.
5. Log in at `/admin` and confirm access. Running it again prints `No change` and is safe.

### Rollback
```
node scripts/promote-admin.js --email=<owner-email> --i-understand-target=<host> \
  --revert --apply --confirm-email=<owner-email> --reason="Rollback: <why>"
```
This refuses if that account is the only active admin; promote a replacement first. Both actions remain visible in the `auditlogs` collection (filter `entity: "User"`). Audit entries are append-only and are not deleted by rollback.

Manual alternative (no audit entry, not preferred): Atlas → Data Explorer → `users` → edit that one document's `role`.

## 8. Post-deploy checks (backend only)

- `GET https://<api-host>/api/v1/health` → `200` with `"database":"connected"` and `"transactions":"supported"`.
- Logs must **not** show `db.transactions_unavailable` or `Missing required environment variables`.
- `GET https://<api-host>/api/v1/products` → `200` JSON.
