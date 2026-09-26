import { Prisma } from '@/generated/prisma/client';
import { db } from '@/core/db';

export type FunnelQuery = { steps: string[]; from: Date; to: Date; windowMs: number };
export type FunnelStep = { eventName: string; users: number };

/**
 * Ordered funnel over raw `Event` (the documented rollup exemption: an ordered per-user sequence is not a daily count).
 *
 * An entry is any step-1 event with ts in [from, to). From each entry, each later step takes the user's earliest
 * matching event strictly after the previous step, ordered by (ts, id) so ties break by arrival, and within
 * `windowMs` of the entry (inclusive). Later steps may fall past `to`. A user's level is the best over all their
 * entries, so re-entry can convert; a user counts once per step reached (D-016).
 *
 * Earliest-next is optimal for a fixed entry: every constraint is "after the previous step" or "before the window
 * closes", so the earliest match leaves the most room for the steps after it.
 */
export async function funnel(orgId: string, q: FunnelQuery): Promise<FunnelStep[]> {
  const { steps, from, to, windowMs } = q;
  if (steps.length < 2 || steps.length > 10) throw new Error('a funnel has 2–10 steps');
  if (!(windowMs > 0) || !(from < to)) throw new Error('bad funnel range or window');

  const window = Prisma.sql`s1."ts" + ${windowMs / 1000}::float8 * interval '1 second'`;
  // One LATERAL per step after the first: the earliest match after the step before it. A missing step leaves
  // its row NULL, and every step after compares against NULL and stays NULL.
  const laterals = steps.slice(1).map((name, i) => {
    const prev = i === 0 ? Prisma.raw('s1') : Prisma.raw(`x${i + 1}`);
    const x = Prisma.raw(`x${i + 2}`);
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT e."ts", e."id" FROM "Event" e
        WHERE e."orgId" = ${orgId}::uuid AND e."userId" = s1."userId" AND e."eventName" = ${name}
          AND (e."ts", e."id") > (${prev}."ts", ${prev}."id") AND e."ts" <= ${window}
        ORDER BY e."ts", e."id" LIMIT 1
      ) ${x} ON true`;
  });
  const level = Prisma.join(steps.slice(1).map((_, i) => Prisma.raw(`(x${i + 2}."id" IS NOT NULL)::int`)), ' + ');

  const rows = await db.$queryRaw<{ level: number; users: number }[]>`
    SELECT level, count(*)::int AS users FROM (
      SELECT s1."userId", max(1 + ${level}) AS level
      FROM "Event" s1 ${Prisma.join(laterals, ' ')}
      WHERE s1."orgId" = ${orgId}::uuid AND s1."eventName" = ${steps[0]} AND s1."ts" >= ${from} AND s1."ts" < ${to}
      GROUP BY s1."userId"
    ) u GROUP BY level`;

  // Users reaching step k = users whose best level is at least k.
  return steps.map((eventName, k) => ({
    eventName,
    users: rows.filter((r) => r.level > k).reduce((n, r) => n + r.users, 0),
  }));
}
