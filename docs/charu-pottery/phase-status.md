# Charu Pottery — Phase Status

_Last updated: 2026-11-24_

| Phase | Status |
|---|---|
| 0 — Audit, requirements, decisions | ✅ **Done.** `CLAUDE.md` and the client PDF have been read and reconciled |
| 1A — Payment, order and inventory integrity, plus tests | ✅ **Done 2026-11-24** (environment unblocked; see below). Payment direction changed by the owner: COD active, PhonePe prepared and disabled, Stripe removed from the flow |
| 1B–11 | ✅/🟡 Implemented in the same session per the owner's master brief. Backend tested; UI compile-verified, **not browser-tested**. Detailed status in `implementation-progress.md` |

## Documents

| File | State |
|---|---|
| `requirements-traceability.md` | Created. Requirement IDs taken from the PDF; the Code and Tests columns fill in as phases land |
| `client-decisions.md` | Created. D1–D4 plus DEC-01a…DEC-19 |
| `implementation-roadmap.md` | Created, including the detailed Phase 1A plan |
| `architecture.md`, `data-model.md`, `api-contracts.md`, `testing-and-acceptance.md`, `release-and-rollback.md`, `phonepe-activation.md`, `implementation-progress.md` | Created 2026-11-24 and describe the implemented design |

## Working-tree state (verified 2026-11-24)

- `Backend/`: `main` @ `634e62f`, clean.
- `Frontend/`: `main` @ `870a77e`. The only change is the approved API-URL fix in `src/api/axios.js` (D2). I re-checked it after `CLAUDE.md` and the PDF were added, and it is intact.
- Root (not a git repo): `CLAUDE.md` and `docs/client-requirements/…pdf` were added by the owner. `docs/charu-pottery/*` was written by me.
- Nothing committed, pushed or deployed. No database touched.

## Environment facts

- Node v22.22.1, npm 10.9.4.
- **MongoDB is not installed and not running locally** (`ECONNREFUSED 127.0.0.1:27017`). The backend `.env` points at local `charu_pottery`. The production database (Render) has not been inspected.
- Stripe key in `Backend/.env`: **test mode**. `Frontend/.env` is empty, so there is no publishable key.
- Stripe is **invite-only in India** (since May 2024; video KYC required from 1 Jan 2026). See DEC-01a.

## Phase 1A log

**Approvals (2026-11-24):**
- DEC-18, DEC-02, DEC-03, DEC-06, DEC-16: APPROVED.
- DEC-15: use MongoMemoryReplSet for tests only; no local MongoDB install and no Atlas without discussion.
- DEC-01a: Stripe test mode; live use is conditional.
- DEC-01b: deferred.
- DEC-17: NOT APPROVED, so no production DB access of any kind.

**Steps taken:**
1. Re-verified the repos. `Backend/` was clean; `Frontend/` had only the approved `axios.js` change.
2. Installed dev dependencies `jest@^29.7.0`, `supertest@^7.1.4` and `mongodb-memory-server@^10.1.4`. The changes are in `Backend/package.json` `devDependencies`. npm also reformatted the `keywords` array onto several lines (cosmetic). `package-lock.json` is git-ignored in this repo.
3. Ran the in-memory replica-set smoke test, and it **failed**: `mongod` hit `fassert() failure` with its default data path on C:.
   - I moved the data path to `Backend/node_modules/.cache/mms-tmp` (on D:, git-ignored) and retried. It still failed (`ECONNRESET`).
   - I could not read the diagnostic logs, because the tool output capture lives on C: and every write there fails with "No space left on device".

**Blocker:** C: has **0 GB free** (D: has 108.75 GB). Nothing was deleted to make room.

**No application source code has been changed for Phase 1A yet.**

## Audit reconciliation with the client PDF

- **What the PDF does not mention:** payments, COD, tax, shipping and refunds. These are `RECOMMENDED` items under the client's "if you think that some other features are needed so add them". Their business rules are tracked as decisions, not assumed.
- **What the PDF does confirm:**
  - The separate admin panel (supports D4).
  - Packaging stock and "additional sections" (CP-ADMIN-020/021).
  - WhatsApp offers "mainly" (DEC-07: login ≠ consent).
  - The Prime Collection 5 → 6th-order gift, plus an undefined "some entertainment" (DEC-11).
  - "how many orders … from where" (DEC-14).
- **How the four critical issues were reassessed:** all are confirmed. C1 is worse than first reported: the frontend never runs a Stripe payment, so every card or UPI order is marked paid. New defects were found: double restock on concurrent cancels (C3b), admin stock overwrite (C3c), admin status changes that skip restock and refund (C3d), and stale cart prices (C5). Details are in `implementation-roadmap.md`.

## Session 2 log (2026-11-24, owner master brief)

**Environment:** TEMP/TMP → `D:\claude-tmp`. The C: drive is still full (1.4 MB free); nothing was deleted. The earlier `fassert()` happened because mongod's data path was on C:. Tests now use `os.tmpdir()`. The earlier `ECONNRESET` is benign shutdown noise; a smoke test confirmed transactions on the in-memory replica set.

**Results:**
- Backend: **98/98 tests pass (10 suites)**.
- Frontend: production build passes (CI lint rules). The storefront-only build excludes all admin code.
- E2E API smoke against a running server: **21/21**.
- Browser UI walkthrough: **not done**.

**Git:** no commits, no staging. Backend `main` @ `634e62f`, Frontend `main` @ `870a77e`, with working-tree changes only. The pre-existing approved changes (`Frontend/src/api/axios.js`, Backend dev deps) are preserved.

**Production:** not touched. No deployment, no DB access, no real payments or messages.
