import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { advanceClock, now } from '@/core/clock';
import { ingest } from '@/lib/ingest';
import { runRollups, runRollupsForOrg, verifyRollups } from '@/lib/rollups';

let orgId: string;

beforeEach(async () => {
  advanceClock(0);
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "RollupDaily", "RollupDailyProp", "RollupUserDay", "RegisteredProperty", "RollupWatermark", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'test-org', name: 'Test Org' } })).id;
});
afterAll(() => db.$disconnect());

// A fixed UTC midnight ten days back, so day boundaries in the fixtures do not depend on when the test runs.
const DAY = 86_400_000;
const day0 = Math.floor(now().getTime() / DAY) * DAY - 10 * DAY;
const at = (days: number, ms = 12 * 3_600_000) => new Date(day0 + days * DAY + ms).toISOString();
const iso = (days: number) => at(days, 0).slice(0, 10);
const ev = (name: string, user: string, ts: string, properties: Record<string, unknown> = {}, event_id?: string) =>
  ({ event_name: name, user_id: user, timestamp: ts, properties, ...(event_id ? { event_id } : {}) });

const daily = async () =>
  (await db.rollupDaily.findMany({ where: { orgId }, orderBy: [{ day: 'asc' }, { eventName: 'asc' }] }))
    .map((r) => [r.day.toISOString().slice(0, 10), r.eventName, r.count, r.uniques]);
const props = async () =>
  (await db.rollupDailyProp.findMany({ where: { orgId }, orderBy: [{ day: 'asc' }, { eventName: 'asc' }, { prop: 'asc' }, { value: 'asc' }] }))
    .map((r) => [r.day.toISOString().slice(0, 10), r.eventName, r.prop, r.value, r.count]);

describe('rollups', () => {
  it('rolls up daily counts, uniques and registered property values (hand-computed)', async () => {
    await db.registeredProperty.createMany({ data: [
      { orgId, eventName: null, prop: 'plan' },
      { orgId, eventName: 'signup', prop: 'plan' }, // also global: must not double count
      { orgId, eventName: 'view', prop: 'page' },
    ] });
    await ingest(orgId, [
      ev('signup', 'u1', at(0), { plan: 'free' }),
      ev('signup', 'u2', at(0), { plan: 'pro' }),
      ev('signup', 'u2', at(0), { plan: 'pro' }),
      ev('view', 'u1', at(0), { page: '/a', plan: 'free', ignored: 'x' }),
      ev('view', 'u1', at(0, DAY - 1), { page: '/a' }), // 23:59:59.999 is still day 0
      ev('view', 'u1', at(1, 0), { page: '/b' }), // 00:00 is day 1
      ev('view', 'u3', at(1), {}), // no value: counted in RollupDaily, absent from props
    ]);
    await runRollups();

    expect(await daily()).toEqual([
      [iso(0), 'signup', 3, 2],
      [iso(0), 'view', 2, 1],
      [iso(1), 'view', 2, 2],
    ]);
    expect(await props()).toEqual([
      [iso(0), 'signup', 'plan', 'free', 1],
      [iso(0), 'signup', 'plan', 'pro', 2],
      [iso(0), 'view', 'page', '/a', 2],
      [iso(0), 'view', 'plan', 'free', 1],
      [iso(1), 'view', 'page', '/b', 1],
    ]);
    expect(await verifyRollups()).toEqual([]);
  });

  it('a late event dirties its old day on the next run', async () => {
    await ingest(orgId, [ev('signup', 'u1', at(0)), ev('signup', 'u1', at(5))]);
    expect((await runRollupsForOrg(orgId)).days).toBe(2);

    advanceClock(2 * 3_600_000);
    await ingest(orgId, [ev('signup', 'u2', at(0))]); // arrives hours later, timestamped five days back
    const r = await runRollupsForOrg(orgId);
    expect(r.days).toBe(2); // day 0 for the late row, day 5 again from the overlap window
    expect(await daily()).toEqual([[iso(0), 'signup', 2, 2], [iso(5), 'signup', 1, 1]]);
    expect(await verifyRollups()).toEqual([]);
  });

  it('re-running is a no-op, and a replayed batch changes nothing', async () => {
    await db.registeredProperty.create({ data: { orgId, prop: 'plan' } });
    const batch = [ev('signup', 'u1', at(0), { plan: 'free' }, 'a'), ev('signup', 'u2', at(1), { plan: 'pro' }, 'b')];
    await ingest(orgId, batch);
    await runRollups();
    const before = [await daily(), await props()];

    await runRollups();
    expect([await daily(), await props()]).toEqual(before);

    advanceClock(3_600_000);
    await ingest(orgId, batch);
    await runRollups();
    expect([await daily(), await props()]).toEqual(before);
  });

  it('picks up a row that commits after the run with a receivedAt behind the watermark (clock skew)', async () => {
    await ingest(orgId, [ev('signup', 'u1', at(3))]);
    const { watermark } = await runRollupsForOrg(orgId);
    // Another app instance, 30s behind, commits a row the first run could not have seen.
    await db.event.create({ data: { orgId, eventName: 'signup', userId: 'u2', ts: at(0), receivedAt: new Date(watermark.getTime() - 30_000) } });
    await runRollupsForOrg(orgId);
    expect(await daily()).toEqual([[iso(0), 'signup', 1, 1], [iso(3), 'signup', 1, 1]]);
  });

  it('an idle org stops re-scanning once a run has started past the overlap window', async () => {
    await ingest(orgId, [ev('signup', 'u1', at(0)), ev('signup', 'u1', at(5))]); // a bulk load spanning days
    expect((await runRollupsForOrg(orgId)).days).toBe(2);
    advanceClock(2 * 60_000);
    expect((await runRollupsForOrg(orgId)).days).toBe(2); // started too close to the load to trust it saw every commit
    advanceClock(2 * 60_000);
    expect((await runRollupsForOrg(orgId)).days).toBe(0); // the previous run started > OVERLAP_MS after the watermark
    expect(await verifyRollups()).toEqual([]);
  });

  it('verify reports drift, and treats not-yet-rolled-up days as pending rather than drift', async () => {
    await ingest(orgId, [ev('signup', 'u1', at(0)), ev('signup', 'u2', at(0))]);
    expect(await verifyRollups()).toEqual([]); // nothing rolled up yet: pending
    await runRollups();
    await db.rollupDaily.updateMany({ where: { orgId }, data: { count: 5 } });
    expect(await verifyRollups()).toEqual([{ orgId, day: iso(0), eventName: 'signup', raw: [2, 2], rollup: [5, 2], userDays: 2 }]);
    await db.rollupDaily.deleteMany({ where: { orgId } });
    expect(await verifyRollups()).toEqual([{ orgId, day: iso(0), eventName: 'signup', raw: [2, 2], rollup: [0, 0], userDays: 2 }]);
    await runRollups(); // nothing new since the watermark except the overlap: day 0 is rebuilt clean
    await db.rollupUserDay.deleteMany({ where: { orgId, userId: 'u2' } });
    expect(await verifyRollups()).toEqual([{ orgId, day: iso(0), eventName: 'signup', raw: [2, 2], rollup: [2, 2], userDays: 1 }]);
  });
});

describe('rollups: property values, isolation, concurrency', () => {
  const userDays = async (org = orgId) =>
    (await db.rollupUserDay.findMany({ where: { orgId: org }, orderBy: [{ day: 'asc' }, { eventName: 'asc' }, { userId: 'asc' }] }))
      .map((r) => [r.day.toISOString().slice(0, 10), r.eventName, r.userId]);

  it('rolls up non-string property values as their JSON text, truncates at 200 chars, and skips JSON null', async () => {
    await db.registeredProperty.create({ data: { orgId, prop: 'v' } });
    await ingest(orgId, [
      ev('e', 'u1', at(0), { v: 42 }),
      ev('e', 'u1', at(0), { v: true }),
      ev('e', 'u1', at(0), { v: { a: 1 } }),
      ev('e', 'u1', at(0), { v: null }), // not rolled up (D-012)
      ev('e', 'u1', at(0), { v: 'x'.repeat(250) }),
      ev('e', 'u2', at(0), { v: `${'x'.repeat(200)}-different-tail` }), // same first 200 chars: one bucket
    ]);
    await runRollups();
    // ORDER BY value follows the database collation (C locally, en_US in CI), so compare in code-unit order
    const byValue = (a: unknown[], b: unknown[]) => (String(a[3]) < String(b[3]) ? -1 : String(a[3]) > String(b[3]) ? 1 : 0);
    expect((await props()).sort(byValue)).toEqual([
      [iso(0), 'e', 'v', '42', 1],
      [iso(0), 'e', 'v', 'true', 1],
      [iso(0), 'e', 'v', 'x'.repeat(200), 2],
      [iso(0), 'e', 'v', '{"a": 1}', 1],
    ]);
    expect(await daily()).toEqual([[iso(0), 'e', 6, 2]]);
  });

  it('applies an event-scoped registration only to that event', async () => {
    await db.registeredProperty.create({ data: { orgId, eventName: 'signup', prop: 'plan' } });
    await ingest(orgId, [ev('signup', 'u1', at(0), { plan: 'pro' }), ev('view', 'u1', at(0), { plan: 'pro' })]);
    await runRollups();
    expect(await props()).toEqual([[iso(0), 'signup', 'plan', 'pro', 1]]);
  });

  it('writes one RollupUserDay row per (day, event, user), however many events that user fired', async () => {
    await ingest(orgId, [
      ev('view', 'u1', at(0)), ev('view', 'u1', at(0, 13 * 3_600_000)), ev('view', 'u2', at(0)),
      ev('signup', 'u1', at(0)), ev('view', 'u1', at(1)),
    ]);
    await runRollups();
    expect(await userDays()).toEqual([
      [iso(0), 'signup', 'u1'], [iso(0), 'view', 'u1'], [iso(0), 'view', 'u2'], [iso(1), 'view', 'u1'],
    ]);
  });

  it('keeps every org\'s rollups, registrations and watermark to itself', async () => {
    const other = (await db.org.create({ data: { slug: 'other', name: 'Other' } })).id;
    await db.registeredProperty.create({ data: { orgId: other, prop: 'plan' } }); // registered in the other org only
    await ingest(orgId, [ev('signup', 'u1', at(0), { plan: 'pro' })]);
    await ingest(other, [ev('signup', 'x1', at(0), { plan: 'free' }), ev('signup', 'x2', at(0), { plan: 'free' })]);
    const results = await runRollups();
    expect(results.map((r) => [r.orgId, r.days]).sort()).toEqual([[orgId, 1], [other, 1]].sort());

    expect(await daily()).toEqual([[iso(0), 'signup', 1, 1]]);
    expect(await props()).toEqual([]); // orgId registered nothing
    expect(await userDays()).toEqual([[iso(0), 'signup', 'u1']]);
    expect(await userDays(other)).toEqual([[iso(0), 'signup', 'x1'], [iso(0), 'signup', 'x2']]);
    expect((await db.rollupDailyProp.findMany({ where: { orgId: other } })).map((r) => [r.value, r.count])).toEqual([['free', 2]]);
    expect(await verifyRollups()).toEqual([]);
  });

  it('a first run with no events creates the watermark at epoch and rebuilds nothing', async () => {
    const r = await runRollupsForOrg(orgId);
    expect(r).toEqual({ orgId, days: 0, watermark: new Date(0) });
    expect((await db.rollupWatermark.findUniqueOrThrow({ where: { orgId } })).ranAt.getTime()).toBeGreaterThan(0);
  });

  it('two concurrent runs for one org serialize on the watermark lock and leave exact rollups', async () => {
    await db.registeredProperty.create({ data: { orgId, prop: 'plan' } });
    await ingest(orgId, Array.from({ length: 200 }, (_, i) => ev('view', `u${i % 37}`, at(i % 5, (i * 997) % DAY), { plan: i % 2 ? 'pro' : 'free' })));
    const [a, b] = await Promise.all([runRollupsForOrg(orgId), runRollupsForOrg(orgId)]);
    expect(a.watermark).toEqual(b.watermark);
    expect(await verifyRollups()).toEqual([]);
    const total = (await db.rollupDaily.findMany({ where: { orgId } })).reduce((n, r) => n + r.count, 0);
    expect(total).toBe(200);
    const propTotal = (await db.rollupDailyProp.findMany({ where: { orgId } })).reduce((n, r) => n + r.count, 0);
    expect(propTotal).toBe(200);
  });

  it('an event moved out of a day by a later run leaves no stale row for that event behind', async () => {
    // A day is rebuilt whole: if a day's only 'signup' row disappears from raw (here: an org's events deleted and
    // re-sent under another name), the next run's DELETE removes the old rollup row rather than keeping it.
    await ingest(orgId, [ev('signup', 'u1', at(0))]);
    await runRollups();
    await db.$executeRaw`DELETE FROM "Event" WHERE "orgId" = ${orgId}::uuid`;
    advanceClock(3_600_000);
    await ingest(orgId, [ev('view', 'u1', at(0))]);
    await runRollups();
    expect(await daily()).toEqual([[iso(0), 'view', 1, 1]]);
    expect(await userDays()).toEqual([[iso(0), 'view', 'u1']]);
  });
});

