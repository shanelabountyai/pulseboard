import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { now } from '@/core/clock';
import { ingest } from '@/lib/ingest';
import { funnel } from '@/lib/funnels';

// A 5-step funnel A → B → C → D → E, hand-computed. The 50-user fixture (funnels.test.ts) stops at 3 steps, so the
// LATERAL chain past x3 (each step seeking after the one before it, not after the entry) is only exercised here.
// Entry range [day 0, day 10). Window 7 days from the entry, inclusive. Every event at 12:00 UTC unless noted.

const DAY = 86_400_000;
const day0 = Math.floor(now().getTime() / DAY) * DAY - 30 * DAY;
const at = (days: number) => new Date(day0 + days * DAY + 12 * 3_600_000).toISOString();
const path = (user: string, ...steps: [string, number][]) => steps.map(([name, d]) => ({ event_name: name, user_id: user, timestamp: at(d) }));
const range = { from: new Date(day0), to: new Date(day0 + 10 * DAY), windowMs: 7 * DAY };

let orgId: string;

beforeAll(async () => {
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "RollupDaily", "RollupDailyProp", "RollupUserDay", "RegisteredProperty", "RollupWatermark", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'test-org', name: 'Test Org' } })).id;
  const other = (await db.org.create({ data: { slug: 'other', name: 'Other' } })).id;
  await ingest(orgId, [
    // p1a, p1b: level 5, the clean path.
    ...path('p1a', ['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5]),
    ...path('p1b', ['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5]),
    // p2: level 4, stops before E.
    ...path('p2', ['A', 1], ['B', 2], ['C', 3], ['D', 4]),
    // p3: level 3. D (day 3) comes before the only C (day 4), and nothing after C is a D.
    ...path('p3', ['A', 1], ['B', 2], ['D', 3], ['C', 4]),
    // p4: level 4. The day-2 C precedes B (day 3) so it is skipped; C day 4, D day 5; E on day 9 is 8 days after entry.
    ...path('p4', ['A', 1], ['C', 2], ['B', 3], ['C', 4], ['D', 5], ['E', 9]),
    // p5: level 5 by re-entry. From the day-1 entry, E (day 12) is past day 8. From the day-5 entry, B 6, C 7, D 8 and
    // E 12 (exactly 7 days, inclusive) all fit; E lies past `to`, which only bounds the entry.
    ...path('p5', ['A', 1], ['B', 2], ['A', 5], ['B', 6], ['C', 7], ['D', 8], ['E', 12]),
    // p6: level 1, every step in reverse.
    ...path('p6', ['E', 1], ['D', 2], ['C', 3], ['B', 4], ['A', 5]),
  ]);
  await ingest(other, path('x', ['A', 1], ['B', 2], ['C', 3], ['D', 4], ['E', 5])); // must not leak in
});
afterAll(() => db.$disconnect());

describe('funnel engine, 4 and 5 steps (hand-computed)', () => {
  it('5 steps: A 7 (all), B 6 (not p6), C 6, D 5 (not p3), E 3 (p1a p1b p5)', async () => {
    expect((await funnel(orgId, { steps: ['A', 'B', 'C', 'D', 'E'], ...range })).map((s) => s.users)).toEqual([7, 6, 6, 5, 3]);
  });

  it('4 steps: the same users through D', async () => {
    expect(await funnel(orgId, { steps: ['A', 'B', 'C', 'D'], ...range })).toEqual([
      { eventName: 'A', users: 7 }, { eventName: 'B', users: 6 }, { eventName: 'C', users: 6 }, { eventName: 'D', users: 5 },
    ]);
  });

  it('a 6-day window drops p5 at E (exactly 7 days) and nothing earlier', async () => {
    expect((await funnel(orgId, { steps: ['A', 'B', 'C', 'D', 'E'], ...range, windowMs: 6 * DAY })).map((s) => s.users)).toEqual([7, 6, 6, 5, 2]);
  });

  it('counts a step name it has never seen as zero from that step on', async () => {
    expect((await funnel(orgId, { steps: ['A', 'B', 'nope', 'D'], ...range })).map((s) => s.users)).toEqual([7, 6, 0, 0]);
  });

  it('treats step names as data: SQL metacharacters match nothing and change nothing', async () => {
    const evil = `A' OR '1'='1`;
    expect((await funnel(orgId, { steps: [evil, `"; DROP TABLE "Event"; --`], ...range })).map((s) => s.users)).toEqual([0, 0]);
    expect(await db.event.count({ where: { orgId } })).toBeGreaterThan(0);
  });

  it('rejects an empty or inverted range and a non-positive window', async () => {
    const steps = ['A', 'B'];
    await expect(funnel(orgId, { steps, from: range.to, to: range.to, windowMs: DAY })).rejects.toThrow(/range or window/);
    await expect(funnel(orgId, { steps, from: range.to, to: range.from, windowMs: DAY })).rejects.toThrow(/range or window/);
    await expect(funnel(orgId, { steps, ...range, windowMs: 0 })).rejects.toThrow(/range or window/);
    await expect(funnel(orgId, { steps, ...range, windowMs: Number.NaN })).rejects.toThrow(/range or window/);
  });
});
