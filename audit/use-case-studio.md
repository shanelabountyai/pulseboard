# use-case-studio

usecasestudiofiles/use-case-studio · live use-case-studio.vercel.app · Next 15, Drizzle, Auth.js DB sessions · frozen (D-6)

**Derived** on 2026-09-23 from the first audit pass (spec §3 and its agent reports), not a fresh audit. `?` = that pass did not assess this key. Fix items: see the repo's backlog → *Security findings* (`SEC-nn`).

| Key | Score | Evidence |
|---|---|---|
| K1 | ✗ Auth.js stores session tokens raw; magic link spent via GET callback | `src/auth.ts:9-26` |
| K2 | ✗ no MFA |  |
| K3 | ✔ every API route calls auth() | `src/middleware.ts:29-52` |
| K4 | ✔ owned(id, userId) on every handler | `api/use-cases/[id]/route.ts:10` |
| K5 | ✗ in-memory, per-instance limits (SEC-03) | `src/middleware.ts:4-27` |
| K6 | ✗ projection + headers ✔; tokens raw, no expiry (SEC-02) | `src/db/schema.ts:98-103; src/lib/sharing.ts:32-45` |
| K7 | ✗ headers only on /s |  |
| K8 | ✗ intake open when key unset; !== compares (SEC-01, SEC-04) | `src/app/api/intake/route.ts:76-80` |
| K9 | N/A no webhooks |  |
| K10 | ? not assessed |  |
| K11 | ✗ .env.example omits 6+ vars (SEC-05) | `.env.example` |
| K12 | ✗ integration tests run against a Neon branch | `vitest.integration.config.ts:4-16` |
| K13 | ? not assessed |  |
| K14 | ✗ port 3000 collides with storage; no ignoreCommand (OPS-01) | `package.json` |
