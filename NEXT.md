# NEXT

**Foundation v1.0.3 merged 2026-09-28** (v1.0.2 FR-01 outbox + v1.0.3 security FR-02..05); local dev + test migrated; 156/156, drift clean.
Template defect found: its v1.0.2/v1.0.3 tags left `FOUNDATION_VERSION` at `v1.0.1`, so the pin is set here and excused in
`FOUNDATION_PATCHES.md` (remove that entry at the v1.1.0 merge). **Still to do in the template repo:** bump this clone's `CLONES.md` row to v1.0.3.
**v1.1.0 (FR-06..11) is tagged**, not security; take it before closure.

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

**Phase 4d done 2026-09-28:** design system published: https://claude.ai/artifact/7D65arDGpQEq88bpyT6eWa (D-020). Tokens light/dark,
Plex type scale, validated chart palette, 9 components (AppBar, Button, FilterBar, Freshness, Notice, Panel, TrendChart, FunnelChart,
RetentionGrid) as `.pb-*` CSS class recipes, cover. Not yet reviewed by Shane on the live page.

## Next item: Phase 4e: apply the design system to `/o/[org]`. Model: Sonnet (spec-following, no new logic).

Read the artifact's `project/README.md` ("Using it in the app" section), then `tokens.css` (generated on the page) + `components/bundle.css`
→ `src/app/globals.css`; Plex via `next/font/google`; `pb-root` on body; restyle `src/app/o/[org]/layout.tsx` (AppBar) and `page.tsx`
(FilterBar, Panels, TrendChart per its README: y ticks, x dates, endpoint label, `<title>` hit rects; FunnelChart bars; RetentionGrid buckets;
Freshness state from `ranAt`). Fix the "SaaS Foundation" title. Then eyeball in a browser against the seeded `demo` org (still owed from 4b).

Then WRITEUP.md (funnel exemption goes there) and closure deliverables.

Open, carried: rollups ride the hourly cron vs PRD's 5-minute freshness (D-013); registering a property does not backfill (D-012);
the benches' org deletes leave millions of dead `Event` tuples, so VACUUM between runs; WRITEUP.md not started.
