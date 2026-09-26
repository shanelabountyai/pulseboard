# NEXT

**Phase 3 done 2026-09-26:** funnels + retention (PRD P0-3/P0-4). `src/lib/funnels.ts` (raw `Event`, the documented
exemption) and `src/lib/retention.ts` (reads the new `RollupUserDay` rollup, covered by `rollups:verify`).
Fixtures: 50-user funnel set (re-entry, out-of-order, window expiry, inclusive boundary, ties, repeated steps, org
isolation) and hand-computed retention cohorts (UTC week boundary, late event moving a cohort, specific return event,
un-started weeks null). Mutation-checked: each engine rule flipped fails a fixture. D-015…D-018.
Measured at 1M events (`npm run bench:queries`): funnel 256–496ms, retention 425–896ms. First-touch table not needed.

## Next item: Phase 4 — dashboard + load harness (PRD P0-5, P0-1 load, seed). Model: Sonnet for UI wiring; Opus for `load:run`.

1. `seed:generate`: 1M events / ~20k users / 90 days with shaped funnel dropoff and retention decay (PRD §seed).
   Re-run `bench:queries` against it and add a README row (the current numbers are the uniform worst case).
2. Dashboard (P0-5): trends (RollupDaily, property filter from RollupDailyProp values), one saved funnel,
   retention triangle, date-range picker, "data as of" = `RollupWatermark.ranAt` on every chart.
   Retention omits weeks with no new users (D-018) — the UI fills them or says so.
3. `load:run`: ≥1,000 events/sec over HTTP `/ingest` (P0-1).

Open, carried: rollups ride the hourly cron vs PRD's 5-minute freshness (D-013); registering a property does not backfill (D-012);
index write cost at 1M rows (D-011, now three query indexes: A/B it in `load:run`, `bench:queries` ingest rate is too noisy — 55–63k ev/s);
the benches' org deletes leave millions of dead `Event` tuples, so VACUUM between runs; WRITEUP.md not started (funnel exemption goes there).
