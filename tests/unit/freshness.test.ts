import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRESH_WARN_MS } from '@/lib/dashboard';

// The freshness pill warns when rollups are older than FRESH_WARN_MS. If that is
// shorter than the cron interval, every dashboard reads "stale" for most of the day
// (it did: 90 min against a daily cron). Pin the threshold to vercel.json's schedule.
describe('freshness threshold follows the rollup cron', () => {
  it('is longer than one cron interval and shorter than two', () => {
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
    const [minute, hour, ...rest] = crons.find((c) => c.path === '/api/cron')!.schedule.split(' ');
    expect(rest).toEqual(['*', '*', '*']); // only "every hour" and "once a day" shapes are understood here
    expect(minute).toMatch(/^\d+$/);
    const interval = hour === '*' ? 3_600_000 : 86_400_000;
    expect(FRESH_WARN_MS).toBeGreaterThan(interval);
    expect(FRESH_WARN_MS).toBeLessThan(2 * interval);
  });
});
