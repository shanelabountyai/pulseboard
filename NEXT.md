# NEXT

**Every item:** run `gh run list --limit 3` before starting and after pushing. If CI is red, fixing it is the item, ahead of the queue.

## Closure status (2026-09-28)

| Deliverable | State |
|---|---|
| WRITEUP.md | done (all phases, funnel exemption, persona-review defects) |
| docs/DEMO.md | done, every command run once |
| Exec brief | done: **Pulseboard in Brief** https://claude.ai/artifact/8i6b88qePxaCTg1PU83L5N (private; share before linking anywhere) |
| LinkedIn posts → Lab Intelligence Ledger | **not started** |
| Cost review | **not started** (nothing deployed; list what would bill if it were, and record keep/slow/off in docs/decisions.md) |

Other artifacts: design system https://claude.ai/artifact/7D65arDGpQEq88bpyT6eWa (D-020; not yet reviewed by Shane on the live page).

## Next item: cost review (Sonnet), then LinkedIn posts (Opus or Sonnet, `linkedin-personal-brand-shane` skill)

Foundation merged to **v1.2.0** 2026-09-28 (covers v1.1.0, the `security:` v1.1.1, and F-03); template `CLONES.md` row bumped.
Clone-side changes: `/ingest` carries `// public:` for the FR-06 guard check; `FOUNDATION_PATCHES.md` is empty. Locally,
the invariant controls timed out at 20s under load 30+ (same control 1.9s vs 19.98s across runs); CI run 36494953585 green (ci + modules-removed).
Not done: pulseboard's `OrgNav.tsx` Billing link has no `{/* billing */}` marker, so `check-modules` would leave a dead link
after billing removal. Harmless while billing stays; mark it if the module is ever dropped.

## Open, carried

- **Rollup overlap re-scan after bulk loads (found 2026-09-28, not fixed).** `runRollupsForOrg` always re-scans
  `receivedAt > watermark − 60s` (D-010). After `seed:generate`, the last 60s of inserts carry `ts` values across all 90 days,
  so every later run on an idle seeded org rebuilds 91 days (26s quiet, 530s under load) until new events arrive. Idempotent
  and correct, just wasteful; a customer's historical import would hit it too. Likely fix: skip the overlap when the previous
  run started more than `OVERLAP_MS` after the watermark (rows at or below it have all committed by then, same ceiling as today).
- **Re-measure `BENCH_ORG=demo npm run bench:queries` on a quiet machine.** The README row is from the 2026-09-26 seed; the seed
  changed 2026-09-28 (calendar-week alignment, weekend-spike fix, demo owner). Still ~1.03M events.
- Persona reviewers' remaining polish, not fixed: the funnel panel's footnote is engineer-facing wording; the template's
  Billing / Delete org nav items show on the dashboard.
- Rollups ride the hourly cron vs the PRD's 5-minute freshness (D-013). Registering a property does not backfill (D-012).
- Bench org deletes leave millions of dead `Event` tuples: VACUUM between runs.
- Local test DB can end a sweep with `Org` "Acme" instead of "Acme Studio" (test files share `slug: 'acme'`), breaking
  `e2e/demo.spec.ts` locally only. `TRUNCATE "Org" CASCADE` and rerun. CI unaffected.
- `tests/invariants/inv-09-rate-limits.test.ts` hit one Postgres deadlock in `resetAuthTables` while another project's
  18-worker sweep was running; clean on rerun. If it recurs on a quiet machine, look at it then.
- This laptop runs other projects' sweeps concurrently (load avg up to 35 on 2026-09-28). Before trusting any timing, check
  `uptime` and `ps aux | grep -c "[v]itest"`.

## Demo sign-in

`npm run seed:generate`, then `/demo` → `owner@demo.seed.test` (demo-flagged, TOTP-enrolled, created by the seed).
