# NEXT

**Phase 1 done 2026-09-26:** clone bootstrap + `POST /ingest` (write key, per-row dead-letter, `event_id` dedupe,
future-timestamp clamp, 365-day floor). 8 integration tests; HTTP smoke-tested on :4500. Decisions D-001…D-008 in `docs/decisions.md`.

## Next item: Phase 2 — rollups + verify (PRD P0-2). Model: Opus (idempotency is correctness-critical).

1. Tables: `RollupDaily(orgId, day, eventName, count, uniques)` and `RollupDailyProp(orgId, day, eventName, prop, value, count)`,
   plus `RegisteredProperty(orgId, eventName?, prop)` and `RollupWatermark(orgId, receivedAt)`.
2. `rollups:run`: dirty days = `SELECT DISTINCT date(ts) … WHERE receivedAt > watermark` (D-008). Recompute each dirty
   day with DELETE + INSERT … SELECT in one transaction; advance the watermark to the max `receivedAt` seen. Add an index on
   `("orgId", "receivedAt")` and measure its write cost.
   Watch for: a row committed with an older `receivedAt` after the watermark read (clock skew between concurrent ingests).
   Consider a small overlap (re-scan watermark − 1 min); recompute is idempotent, so overlap is safe.
3. Wire it into `src/app/cron-jobs.ts` too (Vercel cron is hourly; the PRD target is fresh within 5 minutes — note the gap).
4. `rollups:verify`: rollup sums vs. raw counts per (org, day, event) → a test that fails on drift.
5. Tests first: a late event dirties its old day; re-running is a no-op; a replayed batch changes nothing.
6. Measure: rollup runtime for 100k new events (command + hardware in README).

Deferred on purpose: `load:run` and `seed:generate` are Phase 4 per the PRD, so P0-1's ≥1,000 events/sec criterion is still open.
