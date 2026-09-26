@AGENTS.md

# Pulseboard — mini product analytics (ingest → rollups → funnels/retention → dashboard)

Spec: `docs/prd-pulseboard-analytics.md`. Decisions: `docs/decisions.md`. Handoff: `NEXT.md` (read it first).
Base: clone of **SaaS foundation v1.0.1** (`template` remote). Port **4500**. A product is an org.

## Hard rules (this project)

1. **Reads come from rollups.** Trends, filters and retention read rollup tables, never raw `Event`.
   Funnels are the one exemption: they are ordered per-user sequences, which a daily count cannot answer (documented in WRITEUP.md).
2. **Every performance claim in WRITEUP.md or the README carries its measurement command** and the hardware it ran on.
3. **Timestamps are client-supplied and untrusted.** Future ones clamp to receipt time; late ones are accepted as sent;
   ones older than 365 days are dead-lettered. Rollups find late events by `receivedAt`, not `ts`.
4. **Ingest never fails a batch for one bad row.** Bad rows go to `DeadLetterEvent` with a reason; good rows land.
   Dedupe is the `(orgId, eventId)` unique index with `ON CONFLICT DO NOTHING`, not an application check.
5. **Hot paths are raw SQL** (`db.$executeRaw` / `$queryRaw`); every one scopes by `orgId`. Prisma models own the schema.
6. **TDD the funnel and retention engines against hand-computed fixtures before any optimization.**

## Template rules (inherited)

- Never edit template-owned paths (`src/core`, `src/modules`, `tests/invariants`, security routes). `npm run foundation:drift` checks this.
  The only allowed `core.prisma` edit is an Org back-relation line ending `// app`.
- Clone tables live in `prisma/schema/pulseboard.prisma` with their own migrations. Clone code lives in `src/lib`.
- Guard first (`requireOrg` / `requireUser`) in pages and actions. `/ingest` is the exception: it is authenticated by a hashed write key.

## Commands

`npm test` (local Postgres `pulseboard_test`) · `npm run test:e2e` (prod build) · `npm run lint` · `npm run typecheck` ·
`npm run dev` → :4500 · `npm run key:create -- <orgSlug>` (mints a write key, prints it once)
