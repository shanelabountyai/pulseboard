import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { now } from '@/core/clock';
import { ingest, MAX_BATCH } from '@/lib/ingest';
import { runRollupsForOrg } from '@/lib/rollups';
import { funnel } from '@/lib/funnels';
import { retention } from '@/lib/retention';

// `npm run bench:queries [-- <events>]`: ingests N uniformly random events (default 1M, 20k users, 90 days, 8 event
// names) into a throwaway org, rolls up, then times a 3-step funnel over the last 30 days and the retention triangle
// over all 13 weeks, median of 3 each. Uniform names make every user re-enter the funnel many times, so the funnel
// number is a worst case, not the seed's shaped dropoff (Phase 4's seed:generate). Deletes the org after.
const n = Number(process.argv[2] ?? 1_000_000);
const org = await db.org.create({ data: { slug: `bench-${Date.now()}`, name: 'bench' } });
const names = ['signup', 'view', 'click', 'purchase', 'invite', 'search', 'share', 'logout'];
const DAY = 86_400_000;
const end = now().getTime();
const rand = (k: number) => Math.floor(Math.random() * k);
const median = async (f: () => Promise<unknown>) => {
  const ms: number[] = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); await f(); ms.push(performance.now() - t); }
  return ms.sort((a, b) => a - b)[1]!.toFixed(0);
};

try {
  const t0 = performance.now();
  for (let i = 0; i < n; i += MAX_BATCH) {
    await ingest(org.id, Array.from({ length: Math.min(MAX_BATCH, n - i) }, () => ({
      event_name: names[rand(names.length)], user_id: `u${rand(20_000)}`,
      timestamp: new Date(end - rand(90 * DAY)).toISOString(),
    })));
  }
  const ingestMs = performance.now() - t0;
  await runRollupsForOrg(org.id);
  await db.$executeRaw`ANALYZE "Event"`;
  await db.$executeRaw`ANALYZE "RollupUserDay"`;
  const f = await median(() => funnel(org.id, { steps: ['signup', 'view', 'purchase'], from: new Date(end - 30 * DAY), to: new Date(end), windowMs: 7 * DAY }));
  const r = await median(() => retention(org.id, { from: new Date(end - 91 * DAY), to: new Date(end) }));
  console.log(`${n} events: ingest ${(n / ingestMs * 1000).toFixed(0)} ev/s, funnel(3 steps, 30 days, 7d window) ${f}ms, retention(13 weeks) ${r}ms`);
} finally {
  await db.org.delete({ where: { id: org.id } });
  await db.$disconnect();
}
