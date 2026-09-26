import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { now } from '@/core/clock';
import { ingest } from '@/lib/ingest';
import { funnel } from '@/lib/funnels';

// The crafted 50-user fixture (PRD P0-3). Each group's level is reasoned by hand in its comment; the expected
// step counts below are sums of those levels, not the engine's own output.
// Funnel: signup → activate → purchase. Entry range [day 0, day 10). Window 7 days, inclusive.

const DAY = 86_400_000;
const day0 = Math.floor(now().getTime() / DAY) * DAY - 30 * DAY;
const at = (days: number, ms = 12 * 3_600_000) => new Date(day0 + days * DAY + ms).toISOString();
const ev = (name: string, user: string, ts: string) => ({ event_name: name, user_id: user, timestamp: ts });
const S = ['signup', 'activate', 'purchase'];
const range = { from: new Date(day0), to: new Date(day0 + 10 * DAY) };

let orgId: string;
let otherOrg: string;

/** n users named `${g}${i}`, each firing `events(user)`. */
const group = (g: string, n: number, events: (u: string) => ReturnType<typeof ev>[]) =>
  Array.from({ length: n }, (_, i) => events(`${g}${i}`)).flat();

beforeAll(async () => {
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "RollupDaily", "RollupDailyProp", "RollupUserDay", "RegisteredProperty", "RollupWatermark", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'acme', name: 'Acme' } })).id;
  otherOrg = (await db.org.create({ data: { slug: 'other', name: 'Other' } })).id;

  const rows = [
    // A ×10, level 3: clean path, with unrelated 'view' noise between the steps.
    ...group('a', 10, (u) => [ev('signup', u, at(1)), ev('view', u, at(1, 13 * 3_600_000)), ev('activate', u, at(2)), ev('view', u, at(2, 20 * 3_600_000)), ev('purchase', u, at(3))]),
    // B ×6, level 2: stops after activate.
    ...group('b', 6, (u) => [ev('signup', u, at(1)), ev('activate', u, at(2))]),
    // C ×5, level 1: signs up only.
    ...group('c', 5, (u) => [ev('signup', u, at(4))]),
    // D ×4, level 1: out of order. activate (day 1) precedes signup (day 2); nothing activates after the signup,
    // so the later purchase cannot count either.
    ...group('d', 4, (u) => [ev('activate', u, at(1)), ev('signup', u, at(2)), ev('purchase', u, at(3))]),
    // E ×3, level 1: window expiry. activate + purchase land 8 days after signup, beyond 7.
    ...group('e', 3, (u) => [ev('signup', u, at(1)), ev('activate', u, at(9)), ev('purchase', u, at(9, 13 * 3_600_000))]),
    // F ×3, level 3: re-entry. The day-0 attempt goes nowhere; the day-8 signup converts, and its purchase on
    // day 10 counts although it is past the range end: only the entry must fall inside the range.
    ...group('f', 3, (u) => [ev('signup', u, at(0)), ev('signup', u, at(8)), ev('activate', u, at(9)), ev('purchase', u, at(10))]),
    // G ×2, level 3: repeated steps. Counted once per step, not once per event.
    ...group('g', 2, (u) => [ev('signup', u, at(1)), ev('signup', u, at(2)), ev('activate', u, at(3)), ev('activate', u, at(4)), ev('purchase', u, at(5))]),
    // H ×3, not in the funnel: entered two days before the range; the in-range activate/purchase do not make an entry.
    ...group('h', 3, (u) => [ev('signup', u, at(-2)), ev('activate', u, at(1)), ev('purchase', u, at(2))]),
    // I ×2, not in the funnel: entered at the range end, which is exclusive.
    ...group('i', 2, (u) => [ev('signup', u, at(10, 0)), ev('activate', u, at(10))]),
    // J1 ×2, level 3: purchase exactly 7 days after signup; the window is inclusive.
    ...group('j1_', 2, (u) => [ev('signup', u, at(2)), ev('activate', u, at(3)), ev('purchase', u, at(9))]),
    // J2 ×2, level 2: purchase 7 days + 1ms after signup.
    ...group('j2_', 2, (u) => [ev('signup', u, at(2)), ev('activate', u, at(3)), ev('purchase', u, at(9, 12 * 3_600_000 + 1))]),
    // M ×6, not in the funnel: never sign up.
    ...group('m', 6, (u) => [ev('view', u, at(1)), ev('activate', u, at(2)), ev('purchase', u, at(3))]),
  ];
  await ingest(orgId, rows);
  // K ×2, level 2: signup and activate share a timestamp. Ties break by arrival order, so two ingests make it certain.
  await ingest(orgId, group('k', 2, (u) => [ev('signup', u, at(5))]));
  await ingest(orgId, group('k', 2, (u) => [ev('activate', u, at(5))]));
  // Another org's full conversions must not leak in.
  await ingest(otherOrg, group('a', 5, (u) => [ev('signup', u, at(1)), ev('activate', u, at(2)), ev('purchase', u, at(3))]));
});
afterAll(() => db.$disconnect());

describe('funnel engine (50-user hand-computed fixture)', () => {
  it('fixture has 50 users', async () => {
    const [row] = await db.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT "userId")::int AS n FROM "Event" WHERE "orgId" = ${orgId}::uuid`;
    expect(row?.n).toBe(50);
  });

  it('7-day window: entrants A B C D E F G J1 J2 K; step 2 A B F G J1 J2 K; step 3 A F G J1', async () => {
    // step 1: 10+6+5+4+3+3+2+2+2+2 = 39; step 2: 10+6+3+2+2+2+2 = 27; step 3: 10+3+2+2 = 17
    expect(await funnel(orgId, { steps: S, ...range, windowMs: 7 * DAY })).toEqual([
      { eventName: 'signup', users: 39 },
      { eventName: 'activate', users: 27 },
      { eventName: 'purchase', users: 17 },
    ]);
  });

  it('14-day window: E and J2 now convert fully', async () => {
    // step 2: 27 + E3 = 30; step 3: 17 + E3 + J2 2 = 22
    expect((await funnel(orgId, { steps: S, ...range, windowMs: 14 * DAY })).map((s) => s.users)).toEqual([39, 30, 22]);
  });

  it('a repeated step needs a later event, not the same one', async () => {
    // signup → signup: F (day 0 then day 8, inside 14 days) and G (day 1 then day 2) have two signups. Everyone else has one.
    expect((await funnel(orgId, { steps: ['signup', 'signup'], ...range, windowMs: 14 * DAY })).map((s) => s.users)).toEqual([39, 5]);
  });

  it('rejects fewer than 2 or more than 10 steps', async () => {
    await expect(funnel(orgId, { steps: ['signup'], ...range, windowMs: DAY })).rejects.toThrow();
    await expect(funnel(orgId, { steps: Array(11).fill('x'), ...range, windowMs: DAY })).rejects.toThrow();
  });
});
