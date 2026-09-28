# Pulseboard — write-up

Kept as the work happened, in the PRD's own phase order. Full measurement commands and
hardware are in the README's Performance table; this write-up quotes the numbers but the
README is the source of truth for re-running them.

## Core learning artifacts

1. **Ingestion** — one write-path statement, whatever the batch size, that never fails a
   batch for one bad row.
2. **Rollups** — idempotent recompute against a watermark, not incremental math.
3. **Funnels** — the one deliberate exception to "reads come from rollups," and why a
   rollup can't answer this question at all.
4. **Retention** — a first-seen cohort, read entirely from a rollup table.
5. **Dashboard + load harness** — the capstone: a load run streaming into a live-refreshing
   chart, and a design system built for it before it shipped.

---

## 1. Ingestion (P0-1)

**The problem.** A public write endpoint has to take whatever a client sends — malformed
rows, replayed batches, clocks that lie — without ever losing a good row because a
neighboring row in the same request was bad, and without a slow per-row round trip
eating into the throughput target.

**The design.** `/ingest` authenticates with a per-org write key (`Authorization: Bearer
pk_…`), stored only as its sha256 hash — no session, no rate limit, since a limiter would
fight the load target. Each row in the 1–500-row envelope is validated on its own with
zod; a bad row's *reason* goes to `DeadLetterEvent`, and validation of every other row in
the batch continues regardless. Good rows land in a single
`INSERT … SELECT FROM unnest(...) ON CONFLICT DO NOTHING` — one round trip per batch,
however many rows it holds. Dedup is that unique index on `(orgId, eventId)`, not an
application check, so a batch replayed twice (or an `event_id` repeated inside one batch)
is skipped by Postgres, not by code that has to remember to check.

Timestamps are the untrusted part: a future timestamp clamps to the server's own receipt
time rather than being trusted forward; one older than 365 days is dead-lettered outright
(a stray 1970 clock shouldn't get to open a rollup day nobody else is querying); anything
in between is accepted as sent, because "late" is a real and expected case the rollup has
to handle, not ingestion's problem to solve.

**What it deliberately does not do.** No per-client rate limiting, no synchronous
validation against registered properties, no batching/retry logic on the client side (a
JS SDK stub is a P1).

**Measured** (Apple M4, 24 GB, Postgres 17.11, local, `npm run load:run`): the P0-1
target — 1,000 events/sec for 60s, 50 events/request — sustained at **p95 15ms** (p50
10ms, p99 28ms, max 106ms), 0 failures, every accepted row stored exactly once and a
replayed batch coming back 100% duplicates. At 1 event/request (1,000 req/s) p95 is 6ms.
Headroom was checked up to 40k ev/s sustained on schedule; saturation is Postgres-bound
somewhere in the 28–70k ev/s range depending on machine load at the time (`README.md` →
Performance has the full table and why that range isn't tighter).

---

## 2. Rollups (P0-2)

**The problem.** Pre-aggregation only pays for itself if re-running it is free of
surprises: a re-run of the same window has to produce the same numbers, and a late event
has to land in the day it actually belongs to, not the day the rollup happened to be
running on.

**The design.** Recompute, not increment. Each org's watermark (the newest `receivedAt`
seen) drives a scan for UTC days touched since then; every dirty day is rebuilt with
`DELETE` + `INSERT … SELECT` inside one transaction per org, and the watermark advances in
that same transaction — a re-run of a window and a replayed batch are exact by
construction because nothing is ever added to an existing number, only replaced. The scan
looks 60 seconds behind the watermark on every run (`OVERLAP_MS`), because `receivedAt` is
stamped by the app before its insert commits, so a slow commit can make a row visible
*after* a run has already advanced past it; the overlap costs re-running the latest day
again, never a double count. (`ponytail:` that window is fixed at 60s — real skew or
commit latency beyond it drops a late row until its day is dirtied again by a later
event.) The watermark row's own lock (`SELECT … FOR UPDATE`) serializes two runs for the
same org, so there's no separate locking mechanism to get wrong.

`rollups:verify` reconciles `RollupDaily` and `RollupUserDay` against the same aggregate
computed fresh from raw `Event` rows, per (org, day, event) — drift is a failing check,
not a manual spot-check. Days holding an event newer than the last run are skipped, since
those are pending, not drifted (counting them would fail verify between every ingest and
the next scheduled run).

**What it deliberately does not do.** No per-org timezones (everything is UTC days), no
backfill when a property is newly registered — only days rolled up afterward pick it up
(D-012, carried open).

**Measured**: 100k new events spread over 31 days, daily counts + uniques + 2 registered
properties — **~0.83s warm** (`npm run bench:rollups`), `rollups:verify` clean. The two
`Event` query indexes this needs (`(orgId, ts)`, `(orgId, receivedAt)`) showed no
measurable write cost at 100k and none at 40k ev/s sustained over HTTP either (`load:run`,
D-011) — the only cost is worse tail latency near saturation, irrelevant at the 1,000 ev/s
target.

---

## 3. Funnels — the rollup exemption (P0-3)

CLAUDE.md's hard rule is "reads come from rollups," with one named exception: funnels.
This is why, in enough detail to check the claim rather than take it on faith.

**Why a rollup can't answer this.** A rollup's whole value is that it's already thrown
away the information a daily count doesn't need: `RollupDaily` knows "47 users fired
`signup` on March 3," and that's exactly the shape that makes a trend chart a single index
scan. A funnel's actual question is different in kind, not just in grain: *for this
specific user, did `view` happen strictly after their `signup`, and within 7 days of it?*
Answering that needs the ordered sequence of one user's own events, compared pairwise
against each other — information that was already summed away the moment it went into a
per-day, per-event count. There's no coarser rollup that preserves per-user event order
without becoming, in effect, a second copy of the raw event stream. That's not a missing
index; it's the aggregation itself being lossy in exactly the dimension the query needs.

**The design.** An entry is any step-1 event with `ts` in `[from, to)`. Each later step
takes the user's *earliest* matching event strictly after the previous step, ordered by
`(ts, id)` so a same-timestamp tie breaks by arrival order and a repeated step can't reuse
one event for two steps. Later steps may land past `to`, as long as they're within the
funnel's conversion window measured from the *entry*. A user's level is the best over all
of their entries — so a user who first tries the funnel, drops off, and re-enters later
still converts on the later attempt (D-016; this is the standard "greedy earliest match"
approach used by Amplitude/ClickHouse `windowFunnel`, and it's provably optimal for a
fixed entry, since every constraint is "after the step before it" or "before the window
closes" — the earliest match always leaves the most room for what comes after).

Each step after the first is a `LEFT JOIN LATERAL` chained off the previous step's match;
a missing step leaves `NULL` and every step after it stays `NULL`. This needed one new
index, `Event(orgId, userId, eventName, ts, id)`, added specifically for this seek pattern
— without it, a 3-step funnel over 1M events ran past 9.5 minutes and was cancelled; with
it, 256–496ms (D-017; the PRD's own sanctioned escalation, a first-touch table, only
kicks in above 2s, so it was never needed).

**Test approach.** TDD'd against a hand-computed 50-user fixture set before any of the
optimization above: re-entry, out-of-order events, window expiry, an inclusive boundary,
timestamp ties, repeated steps, and org isolation. Each engine rule (strict ordering,
window inclusivity, best-over-entries) is mutation-checked — flip the rule and a fixture
fails — so the fixture set isn't just checking today's answer, it's checking that changing
the logic would be caught.

**What it deliberately does not do.** No first-touch materialization (not needed at this
scale), no funnels over rollup-only data as a fallback for orgs with huge event volumes —
if that's ever needed it's a new, separate design, not a bend in this one.

---

## 4. Retention (P0-4)

**The problem.** "Weekly cohort × return activity" sounds like a simple GROUP BY, but
cohort membership has to be a genuinely stable fact — a user's cohort shouldn't wobble
depending on what date range someone happens to be looking at.

**The design.** Retention reads a new rollup, `RollupUserDay(orgId, day, eventName,
userId)` (D-015) — day-grain, one row per user/day/event they were active — rebuilt
alongside `RollupDaily` on every dirty-day recompute, so this stays inside the "reads come
from rollups" rule that funnels are the sole exception to. A cohort is the UTC
Monday-start week of a user's *first event ever*, computed over all time rather than
scoped to the query range, so membership is independent of what window someone's viewing
— the only thing that can move a user's cohort after the fact is a late event with a
timestamp *earlier* than anything seen for them so far, which is correct: that really is
new information about when they first showed up. Weeks that haven't started yet render as
`null` rather than 0, so an incomplete week doesn't look like total drop-off. Both "any
event" and "a specific named event" are supported as the return signal, from the same
table.

**Test approach.** Same discipline as funnels: hand-computed cohorts fixture, mutation
checked, covering the UTC week boundary, a late event moving a cohort backward, a specific
return-event filter, and un-started weeks reading null instead of zero.

**Measured**: the retention triangle over 1M events / 13 weekly cohorts × 8 periods —
**425–896ms** (`npm run bench:queries`; the high end of that range was a run with ~2M dead
`Event` tuples left over from earlier bench-org deletes, before a `VACUUM` — a reminder
that a demo environment where orgs get created and deleted repeatedly needs its own
housekeeping, separate from the read path being measured).

---

## 5. Dashboard (P0-5)

`/o/[org]` renders a trend chart (inline SVG, no charting library), a signup → view →
purchase funnel with a 7-day window, and the retention triangle, plus a GET-form date
range, event, and property filter. Every chart carries "data as of" pulled from
`RollupWatermark.ranAt`, so a viewer always knows how stale the numbers in front of them
are — the design system's freshness indicator treats anything within 90 minutes (the
hourly cron plus slack, D-013/D-020) as current. Filter values — which events exist, which
property values are worth filtering on — come from `RollupDailyProp`, never a raw
`DISTINCT` over `Event`; that keeps a filter dropdown itself off the hot path it's meant
to help query.

**Defects found applying the design system (D-021).** Two real rendering bugs surfaced
only once the seeded `demo` org (1M events, real funnel dropoff) was actually eyeballed in
a browser, not just asserted against in a test:
- **Trend chart's y-axis gridlines** were `max / 3` of an arbitrary ceiling, which produces
  values like `6.666666666666667k` — a repeating decimal that overflowed the page's left
  edge in real data, though it never showed up against round numbers in test fixtures.
  Fixed with a "nice" step (a power of ten scaled by ×1/2/3) instead of a blind division.
- **Funnel bars collapsed** under about 400px wide: the CSS grid gave the caption column
  `auto` width, which claims however much space the unwrapped caption text needs before the
  bar's `1fr` track gets anything — on a narrow phone width the bar shrank to invisible.
  Fixed by capping the caption column.

Both fixes were pushed back into the published design-system artifact, not just patched
locally, so the next consumer of either component doesn't hit them fresh.

**Defects found by persona review (2026-09-28).** Three AI role-play reviewers (a Director of
Marketing Analytics, a CMO and a VP of Marketing, each an Opus subagent given only a screenshot and
the spec, not each other's notes) independently flagged the same things:
- **"Not rolled up yet" rendered as zero.** A range past the rollup watermark drew the trend line
  plunging to 0, and unstarted-in-data retention weeks showed 0%. Both are correct arithmetic and
  wrong communication. `trend()` and `retention()` now take `asOf` (the watermark): days after it are
  `null` and drawn as a gap; retention periods not covered by it are blank. A day that was rolled up
  with no events still draws as 0. Tests pin both branches.
- **The seed flattered the product.** `seed-generate.ts` scheduled each user's activity by weeks
  since their own signup, while retention (correctly, D-018) buckets by UTC calendar week, so
  week-0 activity spilled over the Monday boundary and W+1 read 98%. Aligned to the cohort's
  calendar week; W+1 is now 55–61%. That first fix packed each newcomer's full first week into the
  days before Sunday and gave the trend a 3x weekend spike, fixed by scaling the partial week's
  event count to its length. My fixture tests could not catch either, because they check the
  engines against my definitions, not the sample data against the engines.
- Found alongside, not by the reviewers: the seeded `demo` org had no members, so nothing could
  sign in to view it. `seed:generate` now creates a demo-flagged, TOTP-enrolled owner
  (`owner@<slug>.seed.test`).

**A test-vs-product distinction worth recording**, not a product defect: an onboarding
e2e spec asserted the template's original empty-state heading ("Nothing here yet"), which
this dashboard's real empty state ("No events have been rolled up for this org yet…")
correctly replaced. The spec was wrong, not the dashboard; it was updated to match the
dashboard's actual, correct behavior.

**What it deliberately does not do.** No saved reports, no CSV export, no anomaly
flagging (all P1). No live-refresh polling on the dashboard itself — the capstone's "live"
element is the load run's own progress output, not the chart auto-refreshing.

---

## 6. Load harness (P0-6) and the capstone

`seed:generate` builds a 1.03M-event, ~20k-user, 90-day org with a shaped funnel dropoff
(20.0k → 14.9k → 5.0k across the three steps) and retention that actually decays toward a
floor, so the dashboard shows recognizable product shapes rather than uniform noise.
`load:run` is the other half: an open-loop HTTP load generator against a real running
build (`next build && next start`), not the dev server, that fires a configurable
events/sec rate as `/ingest` requests, verifies stored rows equal accepted rows, and
verifies a replayed batch comes back all duplicates. The capstone demo (per the PRD's
phasing) is these two pieces together: the load run streaming events in while the seeded,
styled dashboard is open, showing a trend line accumulate in something close to real time
against the actual 1,000 ev/s target the PRD set as its headline number.

All the load numbers are in §1 above and in `README.md` → Performance, each with its exact
command and the hardware it ran on (Apple M4, 24 GB, Postgres 17.11, 2026-09-28), per this
project's own rule that a performance claim without a reproduction command isn't a
measurement.

---

## What's not built (PRD non-goals and open P1s)

- Real-time/sub-5-minute freshness — rollups still ride the existing hourly cron (D-013,
  open; the job is idempotent so any cadence is safe to change later without a redesign).
- Sampling or approximate counts (HyperLogLog etc.) — exact counts only at this scale, by
  design; the PRD explicitly notes this as a seam for a future, much larger dataset.
- A real client SDK — the HTTP contract is documented and tested; there's no batching/retry
  JS snippet yet.
- Multi-project tenancy beyond one product = one org (deliberately out of scope; that's a
  different project's lesson).
- Saved reports, CSV export, a property-management UI, anomaly flagging on the trend chart
  — all P1 nice-to-haves, none built.
- Registering a new property doesn't backfill days already rolled up (D-012, open) — only
  days rebuilt after registration pick it up.
