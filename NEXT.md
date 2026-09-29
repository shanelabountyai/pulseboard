# NEXT

**Every item:** run `gh run list --limit 3` before starting and after pushing. If CI is red, fixing it is the item, ahead of the queue.

## Closure status (2026-09-29): all five deliverables done — project closed

| Deliverable | State |
|---|---|
| WRITEUP.md | done (all phases, funnel exemption, persona-review defects) |
| docs/DEMO.md | done, every command run once |
| Exec brief | done: **Pulseboard in Brief** https://claude.ai/artifact/8i6b88qePxaCTg1PU83L5N (private; share before linking anywhere) |
| LinkedIn posts → Lab Intelligence Ledger | done 2026-09-29: #82 "98% demo retention" and #83 "blank vs zero", both Impact, in https://claude.ai/artifact/Ai5xKScgT2sWtqXRQ1ZA8i. Harvested but not drafted: funnel ≠ daily ratio (MarTech), measured-didn't-build (Scale). #83 partly overlaps #21's "—, not 0%" paragraph |
| Cost review | done: D-022 (baseline $0, nothing deployed; cron → daily if ever deployed, restore note in D-022) |

Other artifacts: design system https://claude.ai/artifact/7D65arDGpQEq88bpyT6eWa (D-020; not yet reviewed by Shane on the live page).

## Next item: nothing queued

Last done (2026-09-29): rollup overlap re-scan after bulk loads, D-023. Pick from "Open, carried" if reopened.

## Cross-project leftovers (from the 2026-09-29 Vercel/Actions sweep, recorded in `~/.claude/docs/conventions.md`)

- 3 Vercel projects (`use-case-studio`, `labintelligence-site`, `labintelligence`) have no matching repo under `~/Projects` and are
  still on auto-deploy. Needs Shane to point at them.
- Handhold's 4 split, path-filtered workflows are registered but unverified until a push touches `backend/`, `site/`, `frontend/` or `admin-frontend/`.
- Local `alongside` (handhold) checkout has substantial uncommitted companion-feature work on `main`. Local `onsitestaffing`
  (callboard) is mid-feature on `s3-stage-buttons`. Both sweeps pushed via targeted commits/worktrees and left that work alone.

## Open, carried

- **Re-measure `BENCH_ORG=demo npm run bench:queries` on a quiet machine.** The README row is from the 2026-09-26 seed; the seed
  changed 2026-09-28 (calendar-week alignment, weekend-spike fix, demo owner). Still ~1.03M events.
- Persona reviewers' remaining polish, not fixed: the funnel panel's footnote is engineer-facing wording; the template's
  Billing / Delete org nav items show on the dashboard.
- `OrgNav.tsx` Billing link has no `{/* billing */}` marker, so `check-modules` would leave a dead link after billing removal.
- Rollups ride the hourly cron vs the PRD's 5-minute freshness (D-013). Registering a property does not backfill (D-012).
- Bench org deletes leave millions of dead `Event` tuples: VACUUM between runs.
- Local test DB can end a sweep with `Org` "Acme" instead of "Acme Studio" (test files share `slug: 'acme'`), breaking
  `e2e/demo.spec.ts` locally only. `TRUNCATE "Org" CASCADE` and rerun. CI unaffected.
- `tests/invariants/inv-09-rate-limits.test.ts` hit one Postgres deadlock in `resetAuthTables` while another project's
  18-worker sweep was running; clean on rerun. If it recurs on a quiet machine, look at it then.
- This laptop runs other projects' sweeps concurrently (load avg up to 45 on 2026-09-29). Before trusting any timing, check
  `uptime` and `ps aux | grep -c "[v]itest"`.

## Demo sign-in

`npm run seed:generate`, then `/demo` → `owner@demo.seed.test` (demo-flagged, TOTP-enrolled, created by the seed).
