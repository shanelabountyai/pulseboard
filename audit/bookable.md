# bookable

apptbasedservice (Bookable) · live appt.labintelligence.co · Next 16, Prisma 6, custom HMAC session

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ✔ signed exp; staff re-read each request; manage tokens hashed | `packages/core/auth/session.ts:72-141` |
| K2 | ✗ no MFA |  |
| K3 | ✔ all 24 staff pages and actions guarded | `apps/web/lib/auth/session.ts:129-208` |
| K4 | ✗ cross-business IDORs on settings and appointment writes (SEC-01, SEC-02), latent while single-tenant | `packages/db/settings/resources.ts:135-137; appointments/transition.ts:162-164` |
| K5 | ✗ DB limiter on login and manage links ✔; public booking unthrottled (SEC-03) | `lib/booking/public-actions.ts:341-380` |
| K6 | ✔ hashed, expiry, no-referrer, select projection | `packages/core/auth/manage-token.ts:22-60; next.config.ts:13-20` |
| K7 | ✗ headers only on /manage |  |
| K8 | ✗ cron secret compared with !== (SEC-05) | `app/api/jobs/reminders/route.ts:38` |
| K9 | N/A no webhooks |  |
| K10 | ✔ logging adapter + kill switch + sandbox (no real provider) | `packages/core/notifications/` |
| K11 | ✗ no env schema | `.env.example` |
| K12 | ? local PG + prod-build e2e ✔; code-level cloud guard not assessed | `apps/web/playwright.config.ts:34-35` |
| K13 | ? not assessed |  |
| K14 | ✗ no ignoreCommand (OPS-01); port 3300 ✔; cron fail-closed ✔ | `vercel.json` |
