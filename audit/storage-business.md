# storage-business

storage business · live storage.labintelligence.co · Next 16, Prisma 6, Auth.js v5 JWT, Stripe

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ✗ tenant JWT not revocable (SEC-03); magic link spent on GET (SEC-08) | `apps/web/lib/rbac/session.ts:29; app/(auth)/login/magic/route.ts:13-35` |
| K2 | ✗ staff TOTP enforced only by the admin layout (SEC-07) | `app/admin/layout.tsx:48` |
| K3 | ✔ all 29 routes and 63 action files guarded (dotted paths self-check) | `proxy.ts:267-271; admin/impersonation.csv/route.ts:12-15` |
| K4 | ✗ rate-change echo reads another facility's lease (SEC-02) | `app/admin/rate-increases/actions.ts:58-69,225-228` |
| K5 | ✗ login limited in DB; checkout, magic link and reset are not (SEC-04, SEC-05) | `lib/auth/rate-limit.ts:5-60; (public)/…/rent/route.ts:9-50` |
| K6 | ✗ pay links hashed, 7-day, revocable; no Referrer-Policy / no-store headers | `lib/portal/pay-links.ts:37-46,116-133` |
| K7 | ✗ no global headers (SEC-06) | `apps/web/next.config.ts` |
| K8 | ✔ timingSafeEqual cron, fail closed, no secret public vars | `app/api/cron/route.ts:39-54` |
| K9 | ✗ failed Stripe events never re-applied (SEC-01) | `app/api/stripe/webhook/route.ts:44-52` |
| K10 | ✔ real sends gated on VERCEL_ENV; kill switch | `lib/comms/provider.ts:190-275` |
| K11 | ✗ no env schema (~60 raw process.env reads) | `.env.example` |
| K12 | ? local PG + prod-build e2e ✔; runtime cloud-DB guard not checked (seed guard only) | `playwright.config.ts:27-72; scripts/seed-demo.mts:1161-1170` |
| K13 | ? not assessed |  |
| K14 | ✗ no ignoreCommand (OPS-01); port 3000 incumbent; cron ✔ | `vercel.json` |
