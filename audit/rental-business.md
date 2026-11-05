# rental-business

rental business · live rent.labintelligence.co · Next 16, Prisma 6, Auth.js v5 JWT + watermark

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ? JWT + sessionsValidFrom revocation ✔, tokens hashed ✔; whether links are spent by GET not checked | `apps/web/auth.ts:245-311; packages/core/auth/tokens.ts:18-60` |
| K2 | ✔ staff password → single-use MFA challenge → TOTP | `apps/web/auth.ts:75-150` |
| K3 | ✗ unguarded 'use server' exports (SEC-01) | `lib/notices/actions.ts:524 and 3 more` |
| K4 | ✗ addLeaseTenant tenant unscoped; write actions scoped by read permission (SEC-02, SEC-03) | `lib/leases/actions.ts:1079-1084; lib/scope/current-scope.ts:40` |
| K5 | ✔ Postgres limiter on login, MFA, reset, magic link, inquiries | `lib/auth/store.ts:45-75` |
| K6 | ✗ hashed, expiring tokens ✔; no Referrer-Policy; publicListing returns full row | `lib/listings/queries.ts:44-56` |
| K7 | ✗ nonce CSP ✔, no Referrer-Policy (SEC-06) | `proxy.ts; next.config.ts:3-26` |
| K8 | ✗ inbound secret accepted in query string (SEC-05) | `app/api/email/inbound/route.ts:113` |
| K9 | ✗ Stripe ✔; Resend has no replay window (SEC-04) | `packages/core/comms/webhook-signature.ts:96-136` |
| K10 | ✔ logging adapter local/CI only; kill switch + sandbox | `lib/notifications/config.ts:57-58` |
| K11 | ✗ no env schema | `.env.example` |
| K12 | ✔ local PG, prod-build e2e, demo DB guard | `packages/db/prisma/demo-database-guard.mts` |
| K13 | ? write-once trigger on notice delivery; a general audit log was not assessed |  |
| K14 | ✔ ignoreCommand, port 3100, constant-time cron | `apps/web/vercel.json; lib/cron/authorize.ts` |
