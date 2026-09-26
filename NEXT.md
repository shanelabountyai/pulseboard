# NEXT

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

## Next item: Phase 4c: `load:run`, >=1,000 events/sec over HTTP `/ingest` (P0-1). Model: Opus.

Open, carried: rollups ride the hourly cron vs PRD's 5-minute freshness (D-013); registering a property does not backfill (D-012);
index write cost at 1M rows (D-011, now three query indexes: A/B it in `load:run`, `bench:queries` ingest rate is too noisy — 55–63k ev/s);
the benches' org deletes leave millions of dead `Event` tuples, so VACUUM between runs; WRITEUP.md not started (funnel exemption goes there).
