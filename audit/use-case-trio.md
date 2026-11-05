# Use-case trio audit — grant-proposal-assembly, insurance-fnol-intake, support-ticket-deflection

**Paths:**
- /Users/shanelabounty/Projects/use-case-grant-proposal-assembly
- /Users/shanelabounty/Projects/use-case-insurance-fnol-intake
- /Users/shanelabounty/Projects/use-case-support-ticket-deflection

**Deployed?** No. No `.vercel/project.json` in any repo, no `vercel.json`, no deployed-URL mentions in any `.md`. All three are pre-build scaffolds.

**Stack (identical across all three):** Next.js 16.2.12 / React 19.2.4 monorepo, `next-auth@^5.0.0-beta.32` (declared, **not wired up**), Prisma 6.19 (`packages/db/prisma/schema.prisma` deliberately has zero models), npm workspaces (`apps/web`, `packages/core`, `packages/db`), Vitest 3.2.4 + Playwright 1.56.1, `dotenv-cli` for env loading.

**One-line exposure:** No attack surface — `apps/web/app/` contains only `layout.tsx` + `page.tsx` (a static "Scaffold only" placeholder page); no API routes, server actions, middleware, or auth wiring exist yet. The one live finding is operational, not code: `use-case-support-ticket-deflection/.env.local` holds a real Neon Postgres credential and a real `sk-ant-api03-...` Anthropic key on disk (not git-tracked).

This is confirmed identical shape across all three repos — `page.tsx` in each literally says "Scaffold only — no feature is built yet. The first milestone that needs a running app is where this stops being a placeholder." `packages/db/prisma/schema.prisma` in each says the same ("Deliberately empty of models... inventing them here would be exactly the kind of assumption this project's working rules forbid").

## Scorecard

Nearly every key is N/A because there is no running app, no auth, no routes, and no data model yet. Scored once for the trio; differences called out inline.

| Key | Score | Evidence file:line |
|---|---|---|
| K1 Sessions | N/A no auth built | `next-auth` is a dependency in `apps/web/package.json` but no `auth.ts`/`auth.config.ts`/route handler exists in any repo (verified via `find -iname "*auth*"` — zero hits outside `node_modules`) |
| K2 MFA for privileged users | N/A no roles/guards exist | same — no server code at all beyond `layout.tsx`/`page.tsx` |
| K3 Guard on every entry point | N/A no entry points | `apps/web/app/` has exactly `layout.tsx`, `page.tsx`, `globals.css` in each repo — no `api/`, no `actions.ts`, no `'use server'` |
| K4 Tenant/owner scoping | N/A no data model | `packages/db/prisma/schema.prisma` has `generator`/`datasource` blocks only, zero `model` definitions, in all three repos |
| K5 Rate limiting | N/A nothing to rate-limit | no route handlers or forms exist |
| K6 Capability links | N/A no token links | not built |
| K7 Security headers | N/A no server | `apps/web/next.config.mjs` has only `transpilePackages`, no `headers()` |
| K8 Secret handling | ✗ live secrets at rest (ticket-deflection only) | `use-case-support-ticket-deflection/.env.local:9-10,14` — real Neon `DATABASE_URL`/`DIRECT_URL` with password, and real `ANTHROPIC_API_KEY=sk-ant-api03-...`, sitting in plaintext. Not git-tracked (`git ls-files` and `git status --porcelain` both clean); grant-proposal and fnol-intake repos have no `.env.local` at all |
| K9 Webhooks | N/A no webhooks | not built |
| K10 Message/log safety | N/A nothing logs yet | no server code |
| K11 Env validation | ✗ no schema validation | no `env.ts`/zod schema found in any repo; `.env.example` in all three documents names only (verified, no values) and is the only env file tracked in git (`git ls-files \| grep -i env` → `.env.example` only, all three repos) |
| K12 Test DB discipline | ✔ (by convention, unexercised) | `.env.test` in all three points at `postgresql://…@localhost:5432/<project>_test` (e.g. `use-case-grant-proposal-assembly/.env.test:1`); `playwright.config.ts` webServer runs `npm run dev:test` not `dev`, with a comment explaining the split-brain risk of using the cloud DB; `package.json` has `db:migrate:all`/`db:status` targets. No code-level guard yet refusing a cloud `DATABASE_URL` (nothing to guard — no app code touches the DB) |
| K13 Audit trail | N/A no privileged changes exist | no models, no writes |
| K14 Deploy hygiene | ✗ not yet configured | no `vercel.json`/`ignoreCommand` in any repo; no port configured anywhere (`next.config.mjs`, `package.json`, `playwright.config.ts` all default to `localhost:3000`, which the global CLAUDE.md port table already assigns to "storage business") |

## Gaps

| ID | Sev | Finding | Fix | Acceptance |
|---|---|---|---|---|
| SEC-01 | MED | `use-case-support-ticket-deflection/.env.local:9-14` has live production-capable secrets (Neon DB URL with password, real Anthropic API key) sitting in plaintext for a project that has zero application code — the CLAUDE.md's own Phase-0 language elsewhere in the trio (grant-proposal's `.env.example`) explicitly gates populating `ANTHROPIC_API_KEY` until a data-handling decision is recorded, but this repo's key is already live. Not git-tracked, so no leak has occurred, but it's an unnecessary standing exposure (laptop backup, screen share, any tool that globs `.env*`) for work that hasn't started. | Remove the populated values from `.env.local` until Phase-0 gate (P0-AC-10/11 per `docs/phase-0/README.md:57-58`) is actually cleared, or rotate the key/credential once it is genuinely needed and keep it scoped to when dev work begins. | `.env.local` contains no populated secret until the corresponding milestone is reached, or the repo's docs record why an early provision was deliberate. |
| OPS-01 | LOW | No port assigned in `next.config.mjs`/`package.json`/`playwright.config.ts` for any of the three repos — all default to `:3000`, already claimed by "storage business" per the global port table. | Add explicit `-p <port>` to `dev`/`start` scripts and `baseURL` in `playwright.config.ts` for each repo, claiming three new ports from the free block (4100+), before first `npm run dev`. | Each repo's config hardcodes a unique port; table in `~/.claude/CLAUDE.md` updated in the same commit. |
| OPS-02 | LOW | No `vercel.json`/`ignoreCommand` in any of the three repos, though each is already a git repo with a defined structure. | Add `ignoreCommand` per the standard recipe when each repo gets its first Vercel project (not urgent pre-deploy, but should land in the same commit as the Vercel project creation). | `vercel.json` with `ignoreCommand` exists before first deploy. |

## Notes on differences between the three repos
- `use-case-support-ticket-deflection` is further along in planning (has `scripts/retrieval-report.ts`, `scripts/draft-demo.mts`, `scripts/agreement.mts`, and `docs/phase-0/` calibration material) but **zero difference in application code** — same bare scaffold.
- Sensitivity labels differ by design (`internal` for grant-proposal, `regulated` for fnol-intake, `pii` for ticket-deflection), each with its own Neon project called out in `.env.example` — consistent with the "no shared infra between builds" rule in each `CLAUDE.md`.
- `use-case-support-ticket-deflection/SETUP 2.md` has restrictive `600` permissions and was checked for secrets — none found (it's a setup walkthrough, no real values).
