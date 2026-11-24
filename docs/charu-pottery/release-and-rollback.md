# Release, rollback and operations

**Nothing has been deployed.** This is documentation only. Production deployment needs the owner's explicit go-ahead.

## Security changes made

| Area | Change |
|---|---|
| Payments | Removed the path that marked non-COD orders paid without payment. Stripe isolated and disabled. COD paid only on recorded collection. PhonePe verified server-to-server |
| Money and stock | Integer paise, server repricing, transactions, conditional updates, ledger, idempotency keys, exactly-once restock |
| Admin abuse | No free-form status edits for Cancelled/Refunded/Paid. Explicit audited actions |
| Auth | Access token default 15 min. Refresh revocation (`tokenVersion`) on logout and password change. Stronger password policy for new passwords. Credential-endpoint rate limit. Forgot-password no longer reveals accounts. Deactivated users fully blocked. Email regex fixed (modern TLDs) |
| Input | Product list filters whitelisted (previously any field, e.g. `isActive=false`, could be queried) and page size capped. Regex escaping. Address and quantity validation. JSON body 20 kB |
| Uploads | Real type checked by file signature. The extension is no longer taken from the client filename (previously an `.html` upload could be stored and served). Random names, size limits, `nosniff`. Unsafe image URLs stripped |
| CORS | Exact allow-list from `CLIENT_URL` + `ADMIN_URL` |
| Errors and logs | No stack traces outside development. Structured logs without personal data |
| Seeder | Refuses non-local databases (it deletes products) |
| Frontend | Removed the fake newsletter "subscribed" message and false payment badges. Checkout shows server totals only. Honest order-success states |

No PCI DSS or other certification is claimed.

## Production environment checklist

- [ ] MongoDB is a **replica set** (Atlas is). Check `GET /api/v1/health` → `transactions: "supported"`. Otherwise checkout returns 503.
- [ ] A fresh DB backup has been taken and its restore tested.
- [ ] Backend env: `NODE_ENV=production`, `MONGO_URI`, strong `JWT_SECRET`/`JWT_REFRESH_SECRET`, `CLIENT_URL` (+ `ADMIN_URL`), `PUBLIC_STOREFRONT_URL`, SMTP settings, `COD_ENABLED=true`, `PHONEPE_ENABLED=false`.
- [ ] Frontend env: `REACT_APP_API_URL=https://<api-host>/api/v1`, `REACT_APP_APP_TARGET`.
- [ ] Persistent storage for `/uploads` (or Cloudinary), or images are lost on redeploy.
- [ ] Static host rewrites: SPA fallback to `index.html`. If the API is on another host, proxy `/uploads/*` to the API or switch to absolute media URLs.
- [ ] Shipping, tax and Prime values confirmed by the client (DEC-04/05/11).
- [ ] An admin account exists (created manually; the seeder is local-only).

## Deployment steps (for the owner)

1. Back up the production DB (Atlas snapshot or `mongodump`).
2. Deploy the **backend first**. Changes are additive and old documents stay valid.
3. Check `/api/v1/health`.
4. Deploy the **frontend in the same window**. The old frontend cannot check out against the new API: it sends no `Idempotency-Key`, so it gets a clear 400, never a false "paid" order.
5. Optional, approved, after the backup: run `scripts/backfill-inventory-opening.js` (dry run, then `--apply`).
6. Smoke test: register, add to cart, COD checkout, admin fulfil, record cash, check the dashboard.

## Rollback

- **Code:** redeploy the previous backend and frontend builds. The new collections and fields are ignored by the old code.
- **Data:** no destructive migration was made, so rollback needs no data changes. Note that orders placed on the new version carry `orderStatus: AwaitingPayment|Expired` only for online payments (disabled). COD orders use existing statuses, so the old code can still read them.
- If necessary, restore the pre-deploy backup. That loses orders placed since, so treat it as a last resort.

## Backup and restore

- Atlas: enable continuous backup or scheduled snapshots. Test a restore into a separate cluster monthly.
- Self-hosted: `mongodump --uri "$MONGO_URI" --out backup-$(date +%F)` and `mongorestore --uri "$TARGET_URI" backup-…/`. Store backups off-server and encrypted.
- `/uploads`: back up the disk or bucket with the same frequency.

## Monitoring recommendations

- Uptime check on `/api/v1/health` (alert on non-200 or `transactions != supported`).
- Alert on log lines `payment.mismatch`, `refund.failed`, `reservation.expire_failed`, `phonepe.callback_processing_failed`, `db.transactions_unavailable`.
- Review the dashboard daily for "payments needing review", "refunds outstanding" and "COD awaiting cash".
