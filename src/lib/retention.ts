import { db } from '@/core/db';
import { now } from '@/core/clock';

export const PERIODS = 8;
const WEEK = 7 * 86_400_000;

export type RetentionQuery = { from: Date; to: Date; returnEvent?: string };
export type Cohort = { week: string; size: number; returned: (number | null)[] };

/**
 * Weekly retention from `RollupUserDay` (reads come from rollups; D-015). A user's cohort is the UTC Monday-start
 * week of their first event ever, over all time, not the query range, so membership only moves when a late
 * event with an earlier timestamp arrives. `returned[k-1]` counts cohort users active in week W+k (k = 1…8) on
 * any event, or on `returnEvent` only; weeks that have not started yet are null. Cohorts whose week starts in
 * [from, to) are returned; weeks with no new users are omitted.
 */
export async function retention(orgId: string, q: RetentionQuery): Promise<Cohort[]> {
  const rows = await db.$queryRaw<{ week: string; k: number; n: number }[]>`
    WITH cohort AS (
      SELECT "userId", date_trunc('week', min("day"))::date AS w FROM "RollupUserDay"
      WHERE "orgId" = ${orgId}::uuid GROUP BY "userId"
    ), picked AS (
      SELECT * FROM cohort
      WHERE w >= (${q.from}::timestamptz AT TIME ZONE 'UTC')::date AND w < (${q.to}::timestamptz AT TIME ZONE 'UTC')::date
    ), active AS (
      SELECT DISTINCT "userId", date_trunc('week', "day")::date AS w FROM "RollupUserDay"
      WHERE "orgId" = ${orgId}::uuid AND (${q.returnEvent ?? null}::text IS NULL OR "eventName" = ${q.returnEvent ?? null})
        AND "day" >= (${q.from}::timestamptz AT TIME ZONE 'UTC')::date
        AND "day" < (${q.to}::timestamptz AT TIME ZONE 'UTC')::date + ${(PERIODS + 1) * 7}::int
    )
    SELECT to_char(w, 'YYYY-MM-DD') AS week, 0 AS k, count(*)::int AS n FROM picked GROUP BY w
    UNION ALL
    SELECT to_char(p.w, 'YYYY-MM-DD'), (a.w - p.w) / 7, count(*)::int FROM picked p
    JOIN active a ON a."userId" = p."userId" AND a.w > p.w AND a.w <= p.w + ${PERIODS * 7}::int
    GROUP BY p.w, a.w
    ORDER BY 1, 2`;

  const out: Cohort[] = [];
  for (const r of rows) {
    if (r.k === 0) {
      const start = Date.parse(r.week);
      out.push({ week: r.week, size: r.n, returned: Array.from({ length: PERIODS }, (_, i) => (start + (i + 1) * WEEK > now().getTime() ? null : 0)) });
    } else out.at(-1)!.returned[r.k - 1] = r.n;
  }
  return out;
}
