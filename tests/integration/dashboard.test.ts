import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { ingest } from '@/lib/ingest';
import { runRollupsForOrg } from '@/lib/rollups';
import { dataAsOf, filterOptions, trend } from '@/lib/dashboard';

let orgId: string;
let otherId: string;

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "RollupDaily", "RollupDailyProp", "RollupUserDay", "RegisteredProperty", "RollupWatermark", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'acme', name: 'Acme' } })).id;
  otherId = (await db.org.create({ data: { slug: 'other', name: 'Other' } })).id;
});
afterAll(() => db.$disconnect());

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ev = (user: string, ts: string, properties: Record<string, unknown> = {}) =>
  ({ event_name: 'view', user_id: user, timestamp: `${ts}T12:00:00Z`, properties });

describe('dashboard reads', () => {
  it('trend fills gap days, filters by registered property, and never leaks another org', async () => {
    await db.registeredProperty.create({ data: { orgId, eventName: null, prop: 'plan' } });
    await ingest(orgId, [ev('u1', '2026-09-01', { plan: 'pro' }), ev('u2', '2026-09-01', { plan: 'free' }), ev('u1', '2026-09-03', { plan: 'pro' })]);
    await ingest(otherId, [ev('x', '2026-09-01')]);
    await runRollupsForOrg(orgId);

    const q = { eventName: 'view', from: d('2026-09-01'), to: d('2026-09-05') };
    expect((await trend(orgId, q)).map((p) => p.count)).toEqual([2, 0, 1, 0]); // 'to' exclusive, gaps are 0
    expect((await trend(orgId, { ...q, prop: 'plan', value: 'pro' })).map((p) => p.count)).toEqual([1, 0, 1, 0]);
    expect((await filterOptions(orgId)).props.map((p) => p.value)).toEqual(['free', 'pro']);
    expect((await filterOptions(orgId)).eventNames).toEqual(['view']);
  });

  it('dataAsOf is null before the first rollup and the watermark time after', async () => {
    expect(await dataAsOf(orgId)).toBeNull();
    await ingest(orgId, [ev('u1', '2026-09-01')]);
    await runRollupsForOrg(orgId);
    expect(await dataAsOf(orgId)).toBeInstanceOf(Date);
  });
});
