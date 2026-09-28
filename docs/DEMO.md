# Pulseboard — demo script

Every command below was run once against a real checkout before this shipped (Apple M4, 24 GB,
Postgres 17.11, 2026-09-28). If a step behaves differently for you, it's the environment, not the
script — check Troubleshooting before assuming the product broke.

## Before the audience arrives (5–10 minutes)

```bash
npm ci
npm run db:setup            # creates the dev + test databases, writes .env.local/.env.test, migrates both
npm run seed:generate       # rebuilds org "demo": 20k users, ~1.1M events, 90 days, shaped funnel + retention. ~4 min.
npm run dev                 # http://localhost:4500
```

`seed:generate` prints `Sign in at /demo (DEMO_MODE=1) as owner@demo.seed.test to view the dashboard.`
when it finishes — that's the account you'll use. `DEMO_MODE=1` is already set in `.env.local`
(that flag is what makes `/demo` exist at all; it 404s otherwise).

**Do this right before you present, not the night before:** if it's been more than 90 minutes since
`seed:generate` last ran, every chart's freshness pill will say "stale," which is accurate but
reads as broken on a stranger's first glance. Thirty seconds fixes it:

```bash
npm run rollups:run         # brings the watermark up to now; charts flip back to "data as of <now>"
```

## Screen 1 — sign in (no email, no password)

Go to `http://localhost:4500/demo` and click **owner@demo.seed.test**. This is a seeded,
demo-flagged account — the real product uses magic-link + TOTP sign-in, but `/demo` exists
specifically so a demo doesn't depend on an inbox. You land on "Your orgs"; click **demo (seed)**.

**Say:** "One product is one org here — Pulseboard doesn't try to be a multi-tenant analytics
platform you'd resell, it's the analytics layer for a single product." (Concede this before anyone
asks — see below.)

## Screen 2 — the trend chart

The top panel: daily counts for a chosen event, with a date range and a property filter (`plan`,
`platform`). Every panel prints **exactly when its data was last refreshed** — top right, "data as
of `<timestamp>`," turning amber past 90 minutes.

**Say:** "This reads from a pre-aggregated rollup table, never the raw event log — that's true of
every chart except the funnel, and I can show you why that one's different." Point out that a day
past the last rollup run is left blank, not drawn as zero — that distinction (measured-zero vs.
not-yet-measured) is a real bug three independent reviewers caught in this exact chart before it
shipped; worth mentioning if asked how this was tested.

## Screen 3 — the funnel

`signup → view → purchase`, 7-day conversion window. Demo numbers: roughly 20,000 signups, ~74%
reach `view`, ~25% of entrants reach `purchase`.

**Say:** "This is computed from raw events, not rollups — and that's the one deliberate exception
in the whole system. A funnel needs 'did B happen after A, for this specific user,' and a daily
count table has already thrown that ordering away. There's no rollup that answers this question."
(The footnote on the panel says the same thing in one line, if you'd rather point than narrate.)

## Screen 4 — weekly retention

The classic triangle: cohort week down the side, weeks-since-joining across the top, colored by
percent returned. The bottom-right corner is intentionally sparse — a cohort's later weeks haven't
happened yet, and those cells are blank, not 0%. (Same distinction as Screen 2's trend line, same
underlying fix.)

**Say:** "Cohort membership is the calendar week of a user's *first event ever*, not the week you
happen to be looking at — so which cohort someone's in doesn't shift depending on the date range."

## Screen 5 — the capstone: throughput, live in the terminal

In a second terminal, with the server still running:

```bash
npm run load:run             # 1,000 events/sec, 60s, against a throwaway org
```

Narrate the printed summary as it lands: sustained rate, p95 latency (~15ms), and the two
correctness checks at the bottom — stored row count matches accepted exactly, and replaying one
batch comes back 100% duplicates, 0 accepted.

**Concede up front:** this does *not* animate on the dashboard you were just showing — `load:run`
targets a fresh, disposable org each time (and deletes it when done), and the dashboard has no
auto-refresh/polling. The "live" part is this terminal output next to an already-open dashboard,
not the trend line climbing while you watch. Say this before someone asks why the chart isn't
moving; it lands as an engineering choice (no unnecessary client polling) rather than a gap, if you
name it first.

For the fully accurate numbers (dev server under-reports slightly), run against a production build
instead: `npm run build && npm start`, then `npm run load:run` in the second terminal.

## Accounts and where credentials live

| What | Where | Notes |
|---|---|---|
| Demo sign-in | `/demo`, click a name | Only exists when `DEMO_MODE=1` (`.env.local`) |
| `owner@demo.seed.test` | created by `seed:generate` | Owner of the seeded `demo` org — the one to use |
| `owner@acme.demo.test`, etc. | created by `npm run seed:demo` | Template's own demo accounts (Acme Studio / Globex Labs) — no event data, not needed for this demo |
| `/ingest` write key | `npm run key:create -- <orgSlug>` | Printed once, stored only as a hash. Don't mint one against `demo` for a live ingest demo — it'll add real rows to the shaped dataset. Use a scratch slug if you want to show `curl`-level ingestion live. |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/demo` 404s | `DEMO_MODE` isn't `1` | Check `.env.local`; restart `npm run dev` after changing it |
| No accounts listed on `/demo` | `seed:generate` (or `seed:demo`) hasn't run | Run `npm run seed:generate`; wait for the ~4 min to finish |
| Dashboard says "No events have been rolled up for this org yet" | Signed in, but events haven't been rolled up | `npm run rollups:run`, then reload |
| Every chart says "stale" | Last rollup run was >90 min ago | `npm run rollups:run` right before presenting |
| Trend line has a hard drop to 0 at the right edge | You're on an old build — this exact bug was fixed and tested (see WRITEUP.md, Screen 2) | `git pull`, rerun `npm run dev` |
| Retention's newest week shows "0%" everywhere | Same class of bug as above, in the retention grid | Same fix, already shipped — pull latest |
| `npm run load:run` errors "start the server" | No server listening on port 4500 (or `LOAD_URL`) | `npm run dev` (or `npm run build && npm start`) in another terminal first |
| Port 4500 already in use | An old dev server from a previous session | `lsof -ti :4500 \| xargs kill -9` |
| `rollups:verify` reports drift on an org you didn't seed today | Leftover manual/smoke-test data from an earlier session, predating a schema change | Not a product bug if it's on an old, unmanaged org; delete the stray rows or ignore that org. `demo` (from `seed:generate`) should always verify clean |
| Local Postgres isn't running | — | `brew services start postgresql@17` (or however your install runs it) |

## What to concede before you're asked

- **One org per deployment.** This is a single product's analytics layer, not a resellable
  multi-tenant SaaS — that's a different project's lesson (see the PRD's own non-goals).
- **Hourly freshness, not real-time.** Rollups ride an existing hourly cron; the PRD's 5-minute
  target is a known, documented gap (D-013), not something that quietly slipped.
- **All the funnel/retention numbers on screen are synthetic.** `seed:generate` shapes a
  believable dropoff and decay curve on purpose, so the charts aren't empty or uniform noise — it's
  not a claim about any real product's actual numbers.
- **No CSV export, no saved reports, no anomaly alerts, no client SDK.** All P1/non-goals in the
  PRD, not discovered gaps. `/ingest`'s HTTP contract is documented; there's no drop-in tracking
  snippet yet.
- **The load-test ceiling is a range, not a number** (roughly 28k–70k events/sec), because pushing
  past it saturates Postgres in a way that isn't cleanly reproducible run to run. The 1,000 ev/s
  target the PRD actually asks for is solid and repeatable at p95 15ms — that's the number to stand
  behind, not the saturation range.
- **Registering a new event property doesn't backfill history** — only days rolled up after
  registration pick it up (D-012).
