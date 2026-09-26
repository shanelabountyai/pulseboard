# NEXT

**Phase 2 done 2026-09-26:** rollups + verify (PRD P0-2). `RollupDaily`, `RollupDailyProp`, `RegisteredProperty`,
`RollupWatermark`; `rollups:run` / `rollups:verify` / `bench:rollups`; wired into `/api/cron`. 5 integration tests
(hand-computed fixture, late event, re-run + replay no-op, clock-skew overlap, verify drift/pending). D-009…D-014.
Measured: 100k events → rollup ~0.83s on an M4 (README → Performance).

## Next item: Phase 3 — funnels + retention (PRD P0-3/P0-4). Model: Opus (TDD engines, correctness-critical).

1. Hand-computed fixtures FIRST (CLAUDE.md rule 6): funnel steps with ordering, conversion window, repeated steps,
   a user who does step 2 before step 1; retention cohorts across a UTC day boundary.
2. Funnels read raw `Event` (the documented exemption); the `(orgId, ts)` index exists — consider `(orgId, userId, ts)` with a measurement.
3. Retention reads rollups — decide which rollup answers it (per-user activity per day is NOT in RollupDaily; a
   `RollupUserDay(orgId, day, userId)` table may be needed — record the decision).
4. Only then optimize; "interactive time on a 1M-event seed" needs `seed:generate` (Phase 4) — note or pull forward.

Open, carried: rollups ride the hourly cron vs PRD's 5-minute freshness (D-013); registering a property does not backfill (D-012);
index write cost re-measure at 1M rows (D-011); P0-1's ≥1,000 events/sec over HTTP (`load:run`, Phase 4).
