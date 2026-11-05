# pulseboard

> Cloned from saas-foundation v1.0.1. Port 4500. Upgrade with `npm run foundation:status`; template-owned paths are listed in the template's plan §3.2.

A Next.js 16 + Prisma 7 + Postgres template with the parts every multi-tenant app rebuilds: magic-link sign-in with TOTP,
orgs and roles, one authorization path, an append-only audit log, share links, cron, and optional billing (Stripe) and
notifications (SMS). Its safety rules are executable: `tests/invariants/` holds INV-01 to INV-28, and CI fails if one breaks.

Design and decisions: `FOUNDATION_SPEC.md`. Milestones and the sync model: `IMPLEMENTATION_PLAN.md`. Releases: `CHANGELOG.md`. Clones: `CLONES.md`.

## Quickstart (about 10 minutes)

Needs Node 22 and a local Postgres 17 you can create databases in (Homebrew `postgresql@17` works with no password).

```bash
git clone git@github.com:shanelabountyai/saas-foundation.git my-app
cd my-app
git remote rename origin template
git checkout -B main v1.0.0   # -B: a fresh clone already has a main
npm ci
npm run new-project -- my-app 4200   # name and port; rewrites package.json, CI, Playwright, README
npm run db:setup                     # creates my_app and my_app_test, writes .env.local and .env.test, migrates both
npm run seed:demo                    # two orgs, owner/admin/member each; owners and admins have TOTP
npm run dev                          # http://localhost:4200/demo
```

**Do not use GitHub's "Use this template" button.** It drops the shared history, so later fixes can't be merged.
Working on the template itself: `npm run dev:template` serves on :4100.

`db:setup` never overwrites an existing `.env.*` and never prints a value. It uses your OS user against `localhost:5432`;
set `PGUSER`/`PGPASSWORD` or `LOCAL_PG_URL_BASE` for a different Postgres. Real keys (Resend, Stripe, Twilio) are optional
and go in `.env.local`; without them email is captured in the database, billing uses a mock, and SMS is off.

## Commands

| Command | What it does |
|---|---|
| `npm test` | vitest against the local test database: unit, integration and all invariants |
| `npm run test:e2e` | Playwright against a production build (`E2E_DEV=1` runs the dev server for debugging one spec) |
| `npm run lint` / `typecheck` | ESLint (including the core-boundary rule) and `tsc` |
| `npm run db:migrate` | create a migration in dev; `db:migrate:test` applies to the test database |
| `npm run seed:demo` | idempotent demo accounts; refuses a cloud database |
| `npm run foundation:drift` | in a clone: fails if a template-owned file was edited |
| `npm run foundation:status` | in a clone: current vs latest release, and any `security:` changelog entries between |
| `npm run foundation:check-modules` | builds a scratch copy with both modules deleted (CI runs it) |
| `npm run key:create -- <orgSlug>` | mints a `/ingest` write key and prints it once |
| `npm run rollups:run` | rebuilds the UTC days dirtied since each org's watermark (also runs on the `/api/cron` tick) |
| `npm run rollups:verify` | rollup count/uniques vs. raw events per (org, day, event); exits 1 on drift |
| `npm run bench:rollups [-- N]` | ingests N events (default 100k) into a throwaway org, times ingest + one rollup run, verifies, deletes it |
| `npm run seed:generate [-- slug users]` | rebuilds org `demo`: ~1.03M events / 20k users / 90 days with shaped funnel dropoff and retention decay, rolls up, ANALYZEs (~4 min) |
| `npm run bench:queries [-- N]` | ingests N random events (default 1M, 20k users, 90 days) into a throwaway org, rolls up, times a 3-step funnel and the retention triangle (median of 3), deletes it |
| `npm run load:run [-- rate batch seconds]` | open-loop HTTP load on a running server (`npm run build && npm start`): fires `rate` ev/s as `batch`-event `/ingest` requests (default 1000, 50, 60s) into a throwaway org, prints sustained ev/s and p50/p95/p99 latency, checks stored rows = accepted and that a replayed batch is all duplicates, deletes the org. `BENCH_NO_INDEXES=1` drops the 3 Event query indexes for the run |

## Performance

Every number here names its command and hardware. Apple M4 (Mac16,13), 24 GB, Postgres 17.11 (Homebrew), local, 2026-09-26,
no other database load. Medians of 3.

| What | Command | Result |
|---|---|---|
| Rollup of 100k new events spread over 31 days (daily counts, uniques, 2 registered props) | `npm run bench:rollups` | **~0.83s** (800–863ms warm; 1.44s on the first, cold run); `rollups:verify` clean |
| Write cost of the `(orgId, ts)` + `(orgId, receivedAt)` Event indexes | `npm run bench:rollups` vs `BENCH_NO_INDEXES=1 npm run bench:rollups` | not measurable at 100k: ~72k vs ~70k ev/s, inside run-to-run noise (±5%). Re-measure at 1M rows in Phase 4 |
| 3-step funnel, 30-day range, 7-day window, over 1M events / 20k users / 90 days (uniform event names: every user re-enters, a worst case) | `npm run bench:queries` | **256–496ms** over 4 runs (median of 3 each). Without `Event(orgId, userId, eventName, ts, id)`: >9.5 min, cancelled (D-017) |
| Retention triangle, 13 weekly cohorts × 8 periods, same 1M events, from `RollupUserDay` | `npm run bench:queries` | **425–896ms** over 4 runs (median of 3 each; the slowest ran with 2M dead `Event` tuples from earlier bench deletes, before a VACUUM) |
| 3-step funnel and retention triangle over the seeded org (1.03M events, shaped dropoff: 20.0k → 14.9k → 4.9k users; measured 2026-09-26, before the 2026-09-28 seed changes, so re-measure on a quiet machine) | `BENCH_ORG=demo npm run bench:queries` (after `seed:generate`) | funnel **211–236ms**, retention **428–500ms** over 4 runs (median of 3 each) |

The `bench:queries` ingest rate calls `ingest()` in process: it prices the SQL, not HTTP. Over HTTP, `load:run`
(2026-09-28, same M4, production build `next start`, load client on the same machine, other sessions' background
load avg 4–13). Open loop: latency counts from each request's scheduled send time, so falling behind shows as latency.
Every run below stored exactly the accepted rows, and a replayed batch came back 100% duplicates.

| What | Command | Result |
|---|---|---|
| **P0-1 target: 1,000 ev/s for 60s**, 50 events/request (20 req/s) | `npm run load:run` | **1,000 ev/s sustained, p95 15ms** (p50 10, p99 28, max 106), 0 failures |
| 1,000 ev/s for 60s, **1 event/request** (1,000 req/s) | `npm run load:run -- 1000 1 60` | 1,000 ev/s, p95 6ms (p99 23, max 76), 0 failures |
| Headroom, 50/request, 30s at 5k / 10k / 20k and 20s at 40k ev/s | `npm run load:run -- <rate> 50 <s>` | all sustained on schedule; p95 14 / 10 / 8 / 7ms, 0 failures |
| Saturation, 80k ev/s target | `npm run load:run -- 80000 50 20` / `80000 500 20` | **61k ev/s** (50/req) and **70k ev/s** (500/req) on a quieter machine, matching the in-process 55–63k: Postgres, not HTTP, is the ceiling. Repeats later fell to 28–42k with client-side `fetch failed` as >10k requests queued: overload numbers are not reproducible, so the ceiling is quoted as a range |
| Write cost of the 3 Event query indexes (D-011), 40k ev/s × 20s, alternating 3 pairs | `load:run -- 40000 50 20` vs `BENCH_NO_INDEXES=1 …` | throughput identical (all on schedule); tail latency consistently worse with them: p95 **26 / 141 / 2,312ms** with vs **22 / 15 / 693ms** without. Both drift upward run to run (table growth, background load), so the direction is real and the size is not. Irrelevant at the 1,000 ev/s target |

## Layout

- `src/core/`: env, db, auth, tenancy, authz, audit, tokens, email, share links, cron. Never imports from `src/modules` or `src/app` (lint-enforced).
- `src/modules/{billing,notifications}/`: optional, deletable.
- `src/app/`: routes. `src/app/cron-jobs.ts` is where a clone adds its own cron work. `src/app/org-hooks.ts` holds the
  clone's org hooks: `beforeOrgDelete` (runs before an org is deleted; throwing stops it) and `filterListedOrgs` (which of a
  user's orgs `/onboarding` and `/demo` list; default all, and it can only hide, never add — D-22).
- `prisma/schema/`: `core.prisma` plus one file per module. A clone's tables get their own file and migrations.
- `tests/invariants/`: the security rules as tests. `tests/fixtures/app.ts` holds a clone's harness rows.

## Removing a module

Delete the paths listed for it in `scripts/foundation-modules.ts`, and the lines marked `// billing` or `// notifications`
(`{/* billing */}` in `layout.tsx`) in `prisma/schema/core.prisma`, `src/app/cron-jobs.ts` and `src/app/o/[org]/layout.tsx` —
that includes the module's nav link, so it goes with the rest.
`foundation:check-modules` does exactly this in a scratch copy and requires validate, typecheck, build and drift to pass.
The module's tables stay in the migration history; drop them with a clone migration if you want them gone.

If your own code imports a module outside the marked lines (a clone's own routes or lib files, not just
`cron-jobs.ts`/`org-hooks.ts`), list it in `src/app/required-modules.ts`. `check-modules` leaves a required module in
place and still removes the rest.

## Staying current

Template-owned paths (core, modules, invariants, security routes) are never edited in a clone, so `git merge vX.Y.Z` is clean.
An urgent local patch goes in `FOUNDATION_PATCHES.md` as `` `path` `hash` — reason `` (drift prints the hash to paste in) and moves upstream at the next release. The excuse stops matching, and drift fails again, once that path changes further.
Upgrade steps and versioning rules: `IMPLEMENTATION_PLAN.md` §3.3.

## Not included

Legal pages are stubs (`/legal/privacy`, `/legal/terms`) and are not legal advice. There is no audit-log viewer and no
`/o/[org]/settings/security` page yet.

No cookie banner: the foundation sets only strictly necessary cookies (`session`, `totp_pending`), and those need no consent.
If you add analytics, ads or any other non-essential tracker, you need consent first (spec D-20).
