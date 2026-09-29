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
Build log row (`analytics`) set to shipped with repo, write-up, brief and demo links, 2026-09-29.

## Next item (cross-project, not pulseboard code): Vercel auto-deploy off everywhere — Sonnet fits (mechanical config)

**Decided by Shane 2026-09-29:** hold the Vercel spend cap; turn off per-push deploys on **every** Vercel project; deploy deliberately.
Why: usage run-rate is $25–30/mo against the $20 Pro allocation (Sep 1–29: $25.34 usage + $19.12 seat; crossed $20 on 9/23;
storage $10.26, rental $7.35, clearpath $2.12, handhold $1.63, countertop $1.57; 97%+ build minutes; ignoreCommands verified working,
no failed builds; storage 85 real builds/week, rental 61). Accepted cost: a live demo lags main until deployed.

Plan, per project (`vercel project ls --scope shanelabountyai-8212s-projects` for the list):
1. Add `"git": {"deploymentEnabled": false}` to the root `vercel.json` (countertop-reserve: repo-root one, Root Directory stays `.`). Keep the `ignoreCommand`.
2. Create a Deploy Hook (Project → Settings → Git) for `main` as the deliberate path; verify it still triggers with deploymentEnabled off
   before relying on it. Never deploy with `vercel --prod` from a working tree (conventions.md).
3. Record the decision + restore note (delete the `git` key to restore; trigger: a project needing continuous preview/prod) in each repo's decisions log, and once in `~/.claude/docs/conventions.md` → Vercel.
4. Commit + push each. **CI is blocked account-wide until GitHub billing is fixed** (see below), so expect 5-second CI failures that aren't code.

**Blocked on Shane:** GitHub Actions account lockout since 2026-09-28 ~23:35 UTC ("recent account payments have failed or your spending
limit needs to be increased") — fix at github.com/settings/billing. Pulseboard run 36582801249 failed in 5s from it. After that, cheap
Actions fixes: `concurrency: {group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true}` on all 6 CI workflows; path filters
on handhold's 4 parallel jobs (1,131 min / 50 runs, the top consumer); `paths-ignore` docs skip for event-toolkit.

Pulseboard itself: nothing queued — pick from "Open, carried" if reopened.

Context from the last build item:

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
