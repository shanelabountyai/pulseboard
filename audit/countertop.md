# countertop

Restaurant ordering (Countertop) · live ordering.labintelligence.co · Next 16, Prisma 6, shared staff passcode

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ✗ deterministic passcode-hash cookie; per-device revocation impossible (SEC-03) | `apps/web/lib/staff-auth.ts:35,54-58` |
| K2 | ✗ shared passcode, no second factor |  |
| K3 | ✗ kitchen actions protected by middleware matcher only (SEC-04) | `apps/web/middleware.ts:9-13` |
| K4 | N/A single restaurant |  |
| K5 | ✗ no limiter anywhere; passcode unthrottled (SEC-02) | `apps/web/app/kitchen/login/actions.ts:16-29` |
| K6 | ✗ status token 192-bit but raw, no expiry/revocation, no Referrer-Policy (SEC-05) | `packages/db/placement.ts:243` |
| K7 | ✗ no headers | `apps/web/next.config.ts` |
| K8 | ✔ unset means locked; constant-time compare | `apps/web/lib/staff-auth.ts:37-45` |
| K9 | N/A mock payment provider |  |
| K10 | ✗ SMS stub returns the code to the browser (SEC-01) | `packages/db/verification.ts:59` |
| K11 | ✗ no env schema | `.env.example` |
| K12 | ✔ local PG, prod-build e2e, localhost guard on destructive scripts | `packages/db/local-guard.ts` |
| K13 | ? not assessed |  |
| K14 | ✗ no ignoreCommand (OPS-01); port 3400 ✔ | `apps/web/vercel.json` |
