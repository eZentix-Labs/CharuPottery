# Rollback Plan

See also `docs/charu-pottery/release-and-rollback.md` for application-level release notes.

## Principles
- Every release goes out from a known commit on `main`. Record the commit SHA, Render deploy ID and Vercel deployment URL before each release.
- The frontend and backend roll back **independently**. The API is versioned (`/api/v1`), so a previous frontend works with the current backend unless a release notes otherwise.
- **The database is never rolled back automatically.** This codebase has no migrations. Any data fix must be a reviewed, explicitly approved script.

## Frontend (Vercel) — about 1 minute, no downtime
1. Vercel → Project → Deployments.
2. Pick the last good **Production** deployment → **⋯ → Promote to Production** (Instant Rollback).
3. Verify with the frontend section of `production-verification-checklist.md`.

Rolling back does **not** change environment variables. If a bad `REACT_APP_*` value caused the problem, fix the variable and redeploy instead.

## Backend (Render)
1. Render → Service → Events/Deploys → the last good deploy → **Rollback** (redeploys that build).
2. Or roll back in git: `git revert <bad-sha>` on `main` and push. Auto-deploy builds the revert.
3. Check `/api/v1/health` → 200 and watch the logs.

Notes:
- A Persistent Disk keeps `uploads/` across rollbacks. Files uploaded by the bad release stay, which is harmless.
- With a Persistent Disk there is a brief downtime on each deploy and rollback.
- Env-var changes are **not** versioned with deploys. Keep a private, out-of-repo record of what was changed and when.

## Configuration mistakes
| Symptom | Likely cause | Fix |
|---|---|---|
| Service won't start, `Missing required environment variables` | `MONGO_URI`/`JWT_*` unset | Set the var; Render restarts |
| Health 503 / `MongoServerSelectionError` | Atlas network access or credentials | Fix Atlas IP access list or user; no redeploy needed |
| Checkout returns 503 "replica set required" | `MONGO_URI` points at a standalone server | Use an Atlas (replica set) URI |
| Browser CORS errors | `CLIENT_URL` doesn't exactly match the origin | Correct the value (scheme+host, no trailing slash) |
| Users logged out after ~15 min | Storefront and API on different sites | Move to `www.`/`api.` on the same domain (B1) |
| Images 404 | Missing `vercel.json` `/uploads` rewrite, or no disk | See B2 |

## Secrets compromise
1. Rotate the affected secret at its source (Atlas user password, PhonePe, SMTP).
2. Update it on Render, which restarts the service.
3. Rotating **both** `JWT_SECRET` and `JWT_REFRESH_SECRET` logs out every user. That's acceptable during an incident.
4. If a secret was ever committed: rotate it first, then purge it from git history. The repo is public, so assume it has been copied.

## Data incidents
- Stop writes if needed: suspend the Render service (shows as an outage, but preserves the data).
- Restore from an Atlas backup or snapshot (M10+) into a **new** cluster, verify it, then switch `MONGO_URI`. Never restore over the live cluster without approval.
- M0/M2/M5 clusters have no automatic backups. Schedule `mongodump` exports before go-live.
