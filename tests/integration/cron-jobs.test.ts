import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { now } from '@/core/clock';
import { ingest } from '@/lib/ingest';
import { verifyRollups } from '@/lib/rollups';
import { cronJobs } from '@/app/cron-jobs';
import { resetAuthTables } from '../helpers/auth';

beforeEach(resetAuthTables);

// /api/cron's own auth is an invariant (INV-10/11/16). This pins the clone's half: the tick rolls up every org.
describe('cronJobs', () => {
  it('rolls up every org on the tick and reports the days rebuilt', async () => {
    const DAY = 86_400_000;
    const a = await db.org.create({ data: { slug: 'cron-a', name: 'A' } });
    const b = await db.org.create({ data: { slug: 'cron-b', name: 'B' } });
    const ts = (d: number) => new Date(now().getTime() - d * DAY).toISOString();
    await ingest(a.id, [{ event_name: 'view', user_id: 'u1', timestamp: ts(1) }, { event_name: 'view', user_id: 'u1', timestamp: ts(3) }]);
    await ingest(b.id, [{ event_name: 'view', user_id: 'u2', timestamp: ts(1) }]);

    const jobs = await cronJobs();
    expect(jobs.rollups).toBe(3); // a: 2 days, b: 1 day
    expect(await db.rollupDaily.count()).toBe(3);
    expect(await db.rollupWatermark.count()).toBe(2);
    expect(await verifyRollups()).toEqual([]);
  });
});
