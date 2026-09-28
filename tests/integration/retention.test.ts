import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { advanceClock, now } from '@/core/clock';
import { ingest } from '@/lib/ingest';
import { runRollups } from '@/lib/rollups';
import { retention } from '@/lib/retention';

// Weekly cohorts (PRD P0-4): a user's cohort is the UTC Monday-start week of their first event ever; period k
// counts cohort users active in week W+k, k = 1…8. Expected rows are hand-computed in the comments.

const DAY = 86_400_000;
const WEEK = 7 * DAY;
// Epoch day 4 (1970-01-05) was a Monday. W(0) is the Monday ten weeks before this week's, so W(10) is the current week.
const thisMonday = Math.floor((now().getTime() - 4 * DAY) / WEEK) * WEEK + 4 * DAY;
const W = (w: number, ms = 12 * 3_600_000) => new Date(thisMonday + (w - 10) * WEEK + ms).toISOString();
const iso = (w: number) => W(w, 0).slice(0, 10);
const ev = (name: string, user: string, ts: string) => ({ event_name: name, user_id: user, timestamp: ts });
const range = { from: new Date(W(0, 0)), to: new Date(W(7, 0)) };

let orgId: string;

beforeAll(async () => {
  advanceClock(0);
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "RollupDaily", "RollupDailyProp", "RollupUserDay", "RegisteredProperty", "RollupWatermark", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'acme', name: 'Acme' } })).id;
  const other = (await db.org.create({ data: { slug: 'other', name: 'Other' } })).id;

  await ingest(orgId, [
    // Cohort W0, 5 users.
    ev('signup', 'r1', W(0)), ev('purchase', 'r1', W(1)), ev('view', 'r1', W(2)), ev('view', 'r1', W(9)), // k1, k2; W9 is k9, past the table
    ev('signup', 'r2', W(0)), ev('view', 'r2', W(3)), // k3 only: gaps are not carried forward
    ev('signup', 'r3', W(0)), ev('view', 'r3', W(0, 13 * 3_600_000)), ev('view', 'r3', W(1)), ev('view', 'r3', W(1, DAY)), // same week is not a return; two W1 events count once
    ev('signup', 'r4', W(0)), // never returns
    ev('signup', 'r5', W(1, -1)), ev('view', 'r5', W(1, 0)), // Sunday 23:59:59.999 is W0; Monday 00:00 is W1 → k1
    // Cohort W1.
    ev('signup', 'r6', W(1, 0)), ev('view', 'r6', W(2)), // Monday 00:00 starts W1
    // r7 is first seen in W2 for now; a late event below moves it to W1.
    ev('view', 'r7', W(2)),
    // Before the range: excluded, and its W0/W1 activity must not make it a W0 member.
    ev('signup', 'r8', W(-1)), ev('view', 'r8', W(0)), ev('view', 'r8', W(1)),
    // Cohort W6: W7…W10 have started (W10 is this week), W11+ have not → null.
    ev('signup', 'r9', W(6)), ev('view', 'r9', W(10, 0)),
  ]);
  await ingest(other, [ev('signup', 'x', W(0)), ev('view', 'x', W(1))]);
  await runRollups();
});
afterAll(() => db.$disconnect());

describe('retention cohorts (hand-computed)', () => {
  it('first-seen cohort × any-event return, before the late event', async () => {
    expect(await retention(orgId, range)).toEqual([
      // W0: r1 r2 r3 r4 r5. k1 = r1 r3 r5, k2 = r1, k3 = r2.
      { week: iso(0), size: 5, returned: [3, 1, 1, 0, 0, 0, 0, 0] },
      // W1: r6. k1 = r6.
      { week: iso(1), size: 1, returned: [1, 0, 0, 0, 0, 0, 0, 0] },
      // W2: r7 alone, no return yet.
      { week: iso(2), size: 1, returned: [0, 0, 0, 0, 0, 0, 0, 0] },
      // W6: r9. k4 = W10 = r9; W11+ not started.
      { week: iso(6), size: 1, returned: [0, 0, 0, 1, null, null, null, null] },
    ]);
  });

  it('asOf, not the wall clock, decides which periods are null (a stale rollup must not read as zero return)', async () => {
    // asOf = W(3): only W0's k1-k3 (weeks W1-W3) have occurred as of that watermark; k4-k8 are unmeasured, not zero.
    const rows = await retention(orgId, { ...range, asOf: new Date(W(3, 0)) });
    expect(rows.find((r) => r.week === iso(0))!.returned).toEqual([3, 1, 1, null, null, null, null, null]);
  });

  it('a specific return event: only purchase counts as a return; cohorts stay first-seen on any event', async () => {
    expect(await retention(orgId, { ...range, returnEvent: 'purchase' })).toEqual([
      { week: iso(0), size: 5, returned: [1, 0, 0, 0, 0, 0, 0, 0] }, // r1's W1 purchase
      { week: iso(1), size: 1, returned: [0, 0, 0, 0, 0, 0, 0, 0] },
      { week: iso(2), size: 1, returned: [0, 0, 0, 0, 0, 0, 0, 0] },
      { week: iso(6), size: 1, returned: [0, 0, 0, 0, null, null, null, null] },
    ]);
  });

  it('a late event with an earlier timestamp moves the user to the earlier cohort after the next rollup', async () => {
    advanceClock(3_600_000);
    await ingest(orgId, [ev('signup', 'r7', W(1))]);
    await runRollups();
    const rows = await retention(orgId, range);
    // W1: r6 r7; both active in W2 → k1 = 2. W2 is empty and drops out.
    expect(rows.map((r) => [r.week, r.size, r.returned[0]])).toEqual([[iso(0), 5, 3], [iso(1), 2, 2], [iso(6), 1, 0]]);
  });
});
