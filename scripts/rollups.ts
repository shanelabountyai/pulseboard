import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { runRollups, verifyRollups } from '@/lib/rollups';

// `npm run rollups:run` rebuilds dirty days; `npm run rollups:verify` exits 1 on any rollup/raw drift.
const cmd = process.argv[2];
if (cmd === 'run') {
  const t = performance.now();
  const results = await runRollups();
  for (const r of results) console.log(`${r.orgId}: ${r.days} day(s) rebuilt, watermark ${r.watermark.toISOString()}`);
  console.log(`rollups:run ${(performance.now() - t).toFixed(0)}ms`);
} else if (cmd === 'verify') {
  const drift = await verifyRollups();
  for (const d of drift) console.log(`DRIFT ${d.orgId} ${d.day} ${d.eventName}: raw ${d.raw.join('/')} vs rollup ${d.rollup.join('/')} (count/uniques)`);
  console.log(drift.length ? `rollups:verify ${drift.length} drifted row(s)` : 'rollups:verify clean');
  process.exitCode = drift.length ? 1 : 0;
} else throw new Error('usage: tsx scripts/rollups.ts run|verify');
await db.$disconnect();
