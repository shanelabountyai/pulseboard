# Decisions

| ID | Date | Decision | Why |
|---|---|---|---|
| D-001 | 2026-09-26 | Clone SaaS foundation v1.0.1 rather than build standalone (Shane). A product = an org. | Sign-in for the dashboard, cron for `rollups:run`, CI and prod-build e2e come ready, and Askboard gets a host. Cost: we use tenancy as a single org. |
| D-002 | 2026-09-26 | Stack and port: Next 16 + Prisma 7 + local Postgres 17, port 4500. | House stack; 4500 was the next free hundred. |
| D-003 | 2026-09-26 | `/ingest` authenticates with a per-org write key (`Authorization: Bearer pk_…`), stored as a sha256 hash. | A public write endpoint needs a credential; hashing follows INV-07. No session, no rate limit (it would fight the load target). |
| D-004 | 2026-09-26 | Envelope `{ "events": [...] }`, 1–500 rows, body ≤ 1MB. Whole-request problems → 4xx; per-row problems → 200 with `rejected[{index, reason}]` and a `DeadLetterEvent` row. | PRD P0-1: valid rows in a bad batch still land. |
| D-005 | 2026-09-26 | Timestamps: ISO 8601 with offset. Future → clamped to `receivedAt`. Older than 365 days → dead-lettered. | PRD build note (clamp future, accept late); the 365-day floor keeps a 1970 clock from polluting rollups. |
| D-006 | 2026-09-26 | One `INSERT … SELECT FROM unnest(arrays) ON CONFLICT DO NOTHING` per batch. `accepted` = rows inserted, `duplicates` = valid − inserted. | One round trip per batch whatever its size; dedupe is the index's job, including repeats inside one batch. |
| D-007 | 2026-09-26 | `Event` carries only the pk and the dedupe index for now. Query indexes are added in Phases 2–3 with a measurement. | Every index taxes the write path; add them when a query needs them. |
| D-008 | 2026-09-26 | Late events are found by `receivedAt > watermark` (Phase 2), so ingest does no dirty-window bookkeeping. | Keeps the write path to one statement. |
