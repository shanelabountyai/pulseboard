import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { now } from '@/core/clock';
import { ingest, MAX_BATCH } from '@/lib/ingest';
import { runRollupsForOrg, verifyRollups } from '@/lib/rollups';

// `npm run bench:rollups [-- <events>]`: ingests N events (default 100k) into a throwaway org, times the ingest
// and one rollups:run over them, verifies, then deletes the org. BENCH_NO_INDEXES=1 drops the two Phase 2
// Event indexes for the ingest and rebuilds them before the rollup, to price their write cost.
const n = Number(process.argv[2] ?? 100_000);
const noIdx = process.env.BENCH_NO_INDEXES === '1';
const org = await db.org.create({ data: { slug: `bench-${Date.now()}`, name: 'bench' } });
await db.registeredProperty.createMany({ data: [{ orgId: org.id, prop: 'plan' }, { orgId: org.id, eventName: 'view', prop: 'page' }] });
const names = ['signup', 'view', 'click', 'purchase', 'invite', 'search', 'share', 'logout'];
const t0 = now().getTime() - 30 * 86_400_000;
const rand = (k: number) => Math.floor(Math.random() * k);

try {
  if (noIdx) await db.$executeRaw`DROP INDEX "Event_orgId_ts_idx", "Event_orgId_receivedAt_idx"`;
  let t = performance.now();
  for (let i = 0; i < n; i += MAX_BATCH) {
    await ingest(org.id, Array.from({ length: Math.min(MAX_BATCH, n - i) }, () => ({
      event_name: names[rand(names.length)], user_id: `u${rand(5_000)}`,
      timestamp: new Date(t0 + rand(30 * 86_400_000)).toISOString(),
      properties: { plan: ['free', 'pro', 'team'][rand(3)], page: `/p${rand(50)}` },
    })));
  }
  const ingestMs = performance.now() - t;
  if (noIdx) {
    await db.$executeRaw`CREATE INDEX "Event_orgId_ts_idx" ON "Event"("orgId", "ts")`;
    await db.$executeRaw`CREATE INDEX "Event_orgId_receivedAt_idx" ON "Event"("orgId", "receivedAt")`;
  }
  t = performance.now();
  const r = await runRollupsForOrg(org.id);
  const rollupMs = performance.now() - t;
  const drift = (await verifyRollups()).filter((d) => d.orgId === org.id);
  console.log(`${n} events, indexes ${noIdx ? 'OFF' : 'on'} during ingest: ingest ${ingestMs.toFixed(0)}ms (${(n / ingestMs * 1000).toFixed(0)} ev/s), ` +
    `rollup ${rollupMs.toFixed(0)}ms over ${r.days} days, drift ${drift.length}`);
  if (drift.length) process.exitCode = 1;
} finally {
  await db.org.delete({ where: { id: org.id } });
  await db.$disconnect();
}
