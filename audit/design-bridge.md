# Design bridge audit

**Path:** /Users/shanelabounty/Projects/design bridge

**Deployed?** UNVERIFIED. Has a `.vercel/project.json` (`projectId: prj_pgXDYnwjuX3d3TkDj2QD6KbDC7Mv`, `projectName: design-bridge`), so `vercel link` has been run, but no deployment alias/URL was found in the repo (`README.md`, `docs/`) and no live-URL evidence — cannot confirm from the filesystem alone whether it has ever been pushed to production.

**Stack:** Next.js 16.3.4 / React 19.2.8, no ORM/database wired up (file/JSON-based storage — `data/*.json` for the fabric corpus, `data/decisions.jsonl` append-only for specialist verdicts, room photos written to `public/rooms/`+`public/crops/`). `@anthropic-ai/sdk` for room-image extraction. No auth library installed or referenced.

**One-line exposure:** Real application code exists (unlike the use-case trio) but ships with zero auth anywhere — the `/console` internal review tool is reachable by anyone who finds the URL, and the home page's photo-upload Server Action is an unauthenticated write that calls a paid Anthropic vision API with no rate limit.

## Scorecard

| Key | Score | Evidence file:line |
|---|---|---|
| K1 Sessions | N/A no auth built yet | No `next-auth`/auth library dependency in `package.json`; `src/app/page.tsx:9` "No account needed" is the deliberate current-phase design. Real plan exists in `docs/prd/PRD-007-identity-roles-and-access.md` (rent-auth-own-authz) but is unimplemented |
| K2 MFA for privileged users | ✗ no privilege model, and the one privileged surface (`/console`) has no gate at all | `src/app/console/page.tsx` — the entire file has no session check, no header check, nothing before rendering specialist review data and accepting `decide()` POSTs |
| K3 Guard on every entry point | ✗ `/console` unguarded | `src/app/console/page.tsx:37-50` (`decide` server action) and the whole page component have no auth check; grep for `'use server'` finds only `page.tsx:44` and `console/page.tsx:38`, neither guarded |
| K4 Tenant/owner scoping | N/A no tenants exist yet | Single-tenant file storage, no org/user model implemented (PRD-007 defines one, not built) |
| K5 Rate limiting | ✗ unauthenticated write with no limiter | `src/app/page.tsx:44-70` `startDesign` accepts an anonymous file upload and calls `extractSlots` (Anthropic vision API) with no rate limiting of any kind — repeated submissions cost real API spend with no throttle |
| K6 Capability links | N/A none exist | project results are reached via `?project=<slug>` query params, not signed/expiring tokens — slugs are guessable-ish (`filename-slug-timestamp36`) but this is a "no capability link" design, not a broken one; N/A rather than a K6 finding since no token-based sharing feature exists |
| K7 Security headers | ✗ none configured | `next.config.ts` has only `experimental.serverActions.bodySizeLimit`; no `headers()` block; no `middleware.ts` in `src/` (confirmed via `find -iname middleware*` → no results) |
| K8 Secret handling | ✔ | `.env.local` (real `ANTHROPIC_API_KEY` + Vercel-CLI-written `VERCEL_OIDC_TOKEN`) is git-ignored and not tracked (`git ls-files \| grep -i env` → `.env.example` only); no `NEXT_PUBLIC_`-prefixed secret vars found; no hardcoded key/token literals found in `src/` or `scripts/` |
| K9 Webhooks | N/A none exist | no webhook receivers in the codebase |
| K10 Message/log safety | ? not fully checked | `scripts/extract.ts:65-102` logs slot counts and error messages to console, not image bytes or API keys — looks safe on inspection, but no systematic grep of every `console.*` call across `src/lib` was done (proportional to repo size) |
| K11 Env validation | ✗ none | No zod/schema validation found (`grep -rl "zod\|envSchema"` → no hits); a missing `ANTHROPIC_API_KEY` is caught only at request time via `hasEnvKey()` in `src/app/page.tsx:141-144`, not at boot |
| K12 Test DB discipline | N/A no database | `.env.example` documents a `DATABASE_URL` with the local-Postgres-only comment for future use, but nothing in `src/` or `scripts/` reads it — the app currently runs on flat files only |
| K13 Audit trail | ✗ append-only file, not DB-enforced | `src/lib/review/decisions.ts:8-11,31-33` — explicitly `ponytail:`-flagged as "append-only file, no database, no migration... Move it when a second reviewer needs to see the first one's decisions live." Reasonable for current single-specialist phase, but not append-only-enforced (a filesystem write is trivially editable, unlike a DB constraint) |
| K14 Deploy hygiene | ✗ partial | Port is correctly fixed: `package.json` `dev`/`start` use `-p 3600` (matches the port table). No `vercel.json`/`ignoreCommand` exists despite the project already being linked to Vercel (`.vercel/project.json` present) — every push risks a billed build with no skip guard |

## Gaps

| ID | Sev | Finding | Fix | Acceptance |
|---|---|---|---|---|
| SEC-01 | HIGH | `/console` (`src/app/console/page.tsx`) — the internal specialist review tool — has no authentication or authorization check of any kind. If this app is ever deployed, anyone with the URL can view all project/room data and submit approve/reject verdicts that become training data (`decide()`, lines 37-50). | Add a minimal guard (shared-secret header, basic auth via middleware, or the PRD-007 identity work) before `/console` renders anything, even as a stopgap ahead of full PRD-007 auth. | `/console` returns 401/redirect for an unauthenticated request; verified with a fresh session. |
| SEC-02 | MED | `startDesign` (`src/app/page.tsx:44-70`) is an unauthenticated Server Action that accepts a file upload and calls the Anthropic vision API with no rate limiting — a scripted flood of submissions runs up real API cost with no defense. | Add a shared-store rate limiter (even a simple per-IP counter in the JSONL/file layer, or Vercel's built-in edge rate limiting) ahead of the extraction call. | Repeated submissions from one source are throttled; verified by scripted burst test. |
| OPS-01 | LOW | No `vercel.json`/`ignoreCommand`, though the project is already linked (`.vercel/project.json`). Per the build-cost convention, every push currently triggers a full billed build. | Add the standard `ignoreCommand` recipe. | `vercel.json` present with the anchored, previous-SHA-based ignore command. |
| OPS-02 | LOW | No security headers (`Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `nosniff`, HSTS) configured anywhere. | Add a `headers()` block in `next.config.ts` (global) before any real deployment. | Response headers include the standard set; verified with `curl -I`. |

## Notes
- No database is currently used despite `.env.example` documenting `DATABASE_URL` — confirmed by `grep` finding zero references to `DATABASE_URL` in `src/` or `scripts/`. Storage is flat JSON/JSONL files under `data/` and images under `public/`. This is a deliberate current-phase simplification (see the `ponytail:` comment in `src/lib/review/decisions.ts`), not an oversight — but it means K12/K13 don't have a DB layer to score against yet.
- `docs/prd/PRD-007-identity-roles-and-access.md` lays out a real, thought-through auth/org/role model (rent authentication, own authorization) — none of it is built. The gap above (SEC-01) exists precisely because the app shipped ahead of that PRD.
