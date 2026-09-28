# NEXT

> **Foundation upgrade waiting (2026-09-27): `v1.0.2`** — FR-01 outbox fix (send no longer inside the claim tx; a slow provider
> was delivered but never recorded, then re-sent every cron run). `git fetch template --tags && git merge v1.0.2`, no migration;
> re-run your outbox tests (a clone that wraps `drainOutbox` or its transports may conflict).
> **Then `v1.0.3` (security, take within 7 days)** — FR-02..05: pending-MFA 10-min TTL + daily wrong-code cap, invite send caps,
> org bound to one Stripe subscription (checkout refused while live), org deletion cancels the subscription first.
> `git merge v1.0.3`, then **`npm run db:migrate`** (adds `BillingAccount.stripeSubscriptionId`; deployed clones: migrate prod too).
> New clone-owned `src/app/org-hooks.ts`; a custom `PaymentProvider` needs `cancel()`. v1.1.0 (FR-06..11) follows.

**Phase 3 done 2026-09-26:** funnels + retention (PRD P0-3/P0-4). `src/lib/funnels.ts` (raw `Event`, the documented
exemption) and `src/lib/retention.ts` (reads the new `RollupUserDay` rollup, covered by `rollups:verify`).
Fixtures: 50-user funnel set (re-entry, out-of-order, window expiry, inclusive boundary, ties, repeated steps, org
isolation) and hand-computed retention cohorts (UTC week boundary, late event moving a cohort, specific return event,
un-started weeks null). Mutation-checked: each engine rule flipped fails a fixture. D-015…D-018.
Measured at 1M events (`npm run bench:queries`): funnel 256–496ms, retention 425–896ms. First-touch table not needed.

**Phase 4a done 2026-09-26:** `seed:generate` (org `demo`, 1.03M events, funnel 20.0k → 14.9k → 4.9k, retention decays to a floor;
rebuilds the org each run, ~4 min, ANALYZEs at the end: without it retention ran >10 min on stale stats). `BENCH_ORG=demo npm run bench:queries`
times the seed: funnel 211–236ms, retention 428–500ms (README row added). Demo org has registered props `plan`, `platform`.

**Phase 4b done 2026-09-26:** dashboard at `/o/[org]` (`src/app/o/[org]/page.tsx`, reads in `src/lib/dashboard.ts`). Trend (inline SVG,
RollupDaily / RollupDailyProp), signup → view → purchase funnel (7d window), retention triangle with "no new users" rows filled (D-018),
GET-form date range + event + property filter, "data as of" = `RollupWatermark.ranAt` on every chart. Filter values come from `RollupDailyProp`.
`tests/integration/dashboard.test.ts` covers trend/gap-fill/filter/org isolation. **Not yet eyeballed in a browser** (sign in as a demo-org member
after `seed:generate`; check chart shapes, and that the default 90d range is fast).

**Phase 4c done 2026-09-28:** `load:run` (open-loop HTTP load, `scripts/load-run.ts`). P0-1 met: 1,000 ev/s × 60s, p95 15ms
(50/request) and p95 6ms at 1 event/request; sustained on schedule up to 40k ev/s; saturation 28–70k ev/s (Postgres-bound, not
reproducible under overload). D-011 index A/B: no throughput cost, worse tail near saturation, kept. README → Performance.
Measure only on a quiet machine: other sessions' vitest sweeps pushed load avg to 48 and made the first runs read p95 2.3s.

## Next item: foundation upgrade `v1.0.2` then `v1.0.3` (security, due by 2026-10-04; notice above). Model: Opus.

Then **Phase 4d: design system** (D-019; artifact first, via Artifact quickstart), then **4e: apply it** to `/o/[org]` (also fix the "SaaS Foundation" title).
Then WRITEUP.md (funnel exemption goes there) and closure deliverables.

Open, carried: rollups ride the hourly cron vs PRD's 5-minute freshness (D-013); registering a property does not backfill (D-012);
the benches' org deletes leave millions of dead `Event` tuples, so VACUUM between runs; WRITEUP.md not started.
