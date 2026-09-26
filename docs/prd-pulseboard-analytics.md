# PRD: Pulseboard — Mini Product Analytics Platform

**Sample business:** "Pulseboard," self-hosted event analytics for small products (a mini Mixpanel/Amplitude)
**Status:** Draft v1.0 — PM + analytics-practitioner review baked in
**Learning objectives:** write-heavy ingestion, idempotent pre-aggregation (rollups), funnel and retention query engines, dashboarding — the portfolio's performance-engineering project

**Positioning note:** this is the project 15 years of marketing ops lets you evaluate expertly — you know what a real funnel report must get right. It's also the designated host for the Askboard AI layer (separate PRD).

---

## Problem Statement

Product teams need to know what users do — but raw event streams are write-heavy, and every useful question (conversion, retention, trends) is an aggregation that's too slow to compute from raw rows at read time. The builder lesson: systems that take thousands of writes cheaply and answer analytical reads instantly do it by *pre-computing* — the ingestion → rollup → query pipeline is the architecture, and nothing else in the portfolio teaches performance as the primary constraint.

## Goals

1. An ingestion endpoint accepts batched events at high volume with validation that never blocks the write path.
2. Rollup jobs pre-aggregate events into query-ready tables, idempotently and incrementally.
3. Funnel and retention queries answer from rollups in interactive time on a 1M-event seed.
4. A dashboard renders trends, funnels, and cohort retention with date-range and property filters.
5. **(Builder goal)** Ingestion design, pre-aggregation, analytical query construction, and measuring performance instead of guessing.

## Non-Goals

- Real-time streaming/sub-second freshness (rollups run on a schedule; "fresh within 5 minutes" is the target)
- Sampling, approximate algorithms (HyperLogLog etc.) — exact counts at this scale; note the seam
- Client SDKs beyond a minimal JS snippet stub and a documented HTTP contract
- Multi-project/multi-tenant (that's Tradepost's lesson) — one product, many users
- Session replay, heatmaps, A/B testing engine

## Requirements — Must-Have (P0)

**P0-1: Event ingestion API** *(core learning artifact #1)*
`POST /ingest` accepts 1–500 events per request: `{event_name, user_id, timestamp, properties{}}`.
- [ ] Validation is cheap and non-blocking: malformed events are rejected per-row into a dead-letter table with reasons; valid rows in the same batch still land
- [ ] Duplicate delivery is expected: an optional client `event_id` dedupes (unique index); a batch replayed twice stores each event once
- [ ] Load test is an acceptance criterion, not a hope: a scripted run sustains ≥1,000 events/sec on dev hardware for 60s with p95 request latency recorded in the README (measure and report honestly, whatever the number is)
- [ ] Late-arriving events (timestamp hours old) are accepted and land in the correct rollup window on the next run

**P0-2: Rollup engine** *(core learning artifact #2)*
Scheduled job (`rollups:run`) aggregates raw events into: daily counts per event, daily uniques per event, daily counts per (event, property value) for registered properties.
- [ ] Idempotent and incremental: re-running a window recomputes it exactly; a watermark tracks progress; late events dirty their window for recompute
- [ ] Rollup totals reconcile against raw-table counts in a verification command (`rollups:verify`) — drift is a failing test
- [ ] Rollup runtime for 100k new events is measured and reported

**P0-3: Funnel query engine** *(core learning artifact #3)*
Ordered N-step funnels (default 3–5 steps) over a date range with a conversion window (e.g., complete within 7 days), computed per user from raw events (funnels resist pre-aggregation — teaching *why* is part of the lesson).
- [ ] Step counts are strictly ordered per user: a user firing step 2 before step 1 does not convert
- [ ] Results match hand-computed fixtures on a crafted 50-user dataset covering re-entry, out-of-order, and window-expiry cases
- [ ] Query time on the 1M-event seed is measured and reported; if >2s, an intermediate per-user-first-touch table is the sanctioned optimization

**P0-4: Retention cohorts**
Weekly cohorts (users first seen in week W) × return activity in weeks W+1…W+8, rendered as the classic triangle table.
- [ ] Cohort membership is first-seen-based and stable; fixtures hand-verified
- [ ] Any event vs. a specific return-event are both supported

**P0-5: Dashboard**
Trends (line, per event, with property filter), one saved funnel, retention triangle, date-range picker; reads only from rollups except funnels.
- [ ] Every chart states its data freshness (last rollup time)
- [ ] Property filter values populate from the registered-property rollups, not a raw DISTINCT

**P0-6: Seed + load harness**
`seed:generate` builds 1M events / ~20k users / 90 days with realistic funnel dropoff and retention decay baked in, so the charts show recognizable shapes; `load:run` drives P0-1's target.

## Nice-to-Have (P1)

Saved reports · CSV export · registered-property management UI · simple anomaly flag (day > N σ from trailing mean, flagged on the trend chart) · JS snippet stub that batches and retries.

## Success Metrics

- Correctness: rollup reconciliation clean; funnel + retention fixtures 100%
- Performance: ingestion and query numbers measured, recorded in README with hardware noted — the deliverable is honest measurement, not a vanity benchmark
- Dedupe: replayed batches produce zero duplicates
- Demo: seed → rollup → dashboard shows plausible product-analytics shapes in one command chain

## Phasing

1. Ingestion + dedupe + dead-letter — 2. Rollups + verify — 3. Funnels + retention (fixtures first) — 4. Dashboard + load harness + P1. Capstone demo: the load run streaming into a live-refreshing dashboard.

## Build Notes for Claude Code

CLAUDE.md: house conventions + **reads come from rollups (funnels exempted, documented why)**, **every performance claim in WRITEUP.md carries its measurement command**, **timestamps are client-supplied and untrusted — clamp future timestamps, accept late ones**. TDD the funnel engine against the crafted fixture set before any optimization. The WRITEUP.md "hardest bug" candidate is almost certainly a rollup-idempotency or late-event case — instrument for it early.
