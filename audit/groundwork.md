# groundwork

groundwork · no live URL found · Next 16, Prisma 7, custom magic link

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ✗ hashed + POST-spend ✔; portal sessions survive a contact change (SEC-01) | `app/dispatch/properties/actions.ts:41-48` |
| K2 | ✗ no MFA for dispatchers |  |
| K3 | ✔ every page, action and route guarded | `src/session.ts:86-102` |
| K4 | ✔ ownership checked in each domain function | `src/visits/status.ts:49,89` |
| K5 | ✗ per-account cooldown only (SEC-04) | `src/session.ts:46` |
| K6 | N/A no public token links; portal is session-gated |  |
| K7 | ✗ no headers (SEC-03) | `next.config.ts:3-9` |
| K8 | ✔ no hardcoded secrets; webhook refuses an empty secret | `src/billing/stripe.ts:73` |
| K9 | ✔ raw-body HMAC, replay window, event claim in the same transaction | `src/billing/stripe.ts:64-82; invoice.ts:184-219` |
| K10 | ✗ sign-in links logged in prod when a channel is unconfigured (SEC-02) | `src/notifications/provider.ts:46-52` |
| K11 | ✗ no env schema | `src/db.ts:4-10` |
| K12 | ✔ cloud-DB guard in app and Prisma config; prod-build e2e | `prisma.config.ts:10-19` |
| K13 | ? not assessed |  |
| K14 | ✔ ignoreCommand, port 3900, no crons | `vercel.json:4` |
