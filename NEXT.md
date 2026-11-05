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

Last done (2026-09-29): integration tests moved off the seed's `acme` slug to `test-org`, so a local sweep no longer
leaves "Acme" for `e2e/demo.spec.ts` (the seed upserts with `update: {}` and never renamed it). Before that: persona polish. Funnel footnote reworded for readers; org admin links (Members, Billing,
Delete org) moved to the right edge beside Account; the Billing prop now carries the `// billing` marker in `layout.tsx`
(a MARKED_FILE), so removing the billing module drops the link. Before that: rollup overlap re-scan, D-023. Pick from "Open, carried" if reopened.

## Cross-project leftovers (from the 2026-09-29 Vercel/Actions sweep, recorded in `~/.claude/docs/conventions.md`)

- ~~3 Vercel projects on auto-deploy~~ resolved 2026-09-29: `use-case-studio` off (8cb6285, no deploy hook yet), the two `labintelligence*` projects have no Git link, so nothing to turn off.
- Handhold's 4 split, path-filtered workflows are registered but unverified until a push touches `backend/`, `site/`, `frontend/` or `admin-frontend/`.
- Local `alongside` (handhold) checkout has substantial uncommitted companion-feature work on `main`. Local `onsitestaffing`
  (callboard) is mid-feature on `s3-stage-buttons`. Both sweeps pushed via targeted commits/worktrees and left that work alone.

## Open, carried

- **Re-measure `BENCH_ORG=demo npm run bench:queries` on a quiet machine.** The README row is from the 2026-09-26 seed; the seed
  changed 2026-09-28 (calendar-week alignment, weekend-spike fix, demo owner). Still ~1.03M events.
- Rollups ride the hourly cron vs the PRD's 5-minute freshness (D-013). Registering a property does not backfill (D-012).
- Bench org deletes leave millions of dead `Event` tuples: VACUUM between runs.
- `tests/invariants/inv-09-rate-limits.test.ts` hit one Postgres deadlock in `resetAuthTables` while another project's
  18-worker sweep was running; clean on rerun. If it recurs on a quiet machine, look at it then.
- This laptop runs other projects' sweeps concurrently (load avg up to 45 on 2026-09-29). Before trusting any timing, check
  `uptime` and `ps aux | grep -c "[v]itest"`.

## Demo sign-in

`npm run seed:generate`, then `/demo` → `owner@demo.seed.test` (demo-flagged, TOTP-enrolled, created by the seed).

## Foundation upgrade (2026-11-04)

saas-foundation v1.3.0 → v1.4.0 (includes v1.3.1, `security:` next/eslint-config-next 16.3.6 → 16.3.8, due 2026-10-27, late)
is on branch `foundation-v1.4.0`, awaiting merge. v1.4.0 adds `filterListedOrgs` to `src/app/org-hooks.ts`; pulseboard keeps
the template default (`return orgs`): it hides no orgs. No migration. Conflicts: only `CLONES.md` and `NEXT.md` (template-only
docs), kept as pulseboard's. Gate: typecheck, lint, 234/234 tests, `foundation:drift` clean against v1.4.0, `npm run build`.
After merge: update pulseboard's row in the template's `CLONES.md`. (v1.3.0 merged 2026-10-19, PR #1.)
2026-11-04: v1.4.1 (`security:` next 16.4.5, zod 4.6.7, prisma 7.10.1) added to the same branch; `npm audit --omit=dev` 0, gate green, 234/234 tests.
