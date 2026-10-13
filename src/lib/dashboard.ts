import { db } from '@/core/db';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rollups older than this read "stale": the daily cron (vercel.json, `0 6 * * *`) plus 2 h slack (D-024). */
export const FRESH_WARN_MS = 26 * 3_600_000;

export type TrendQuery = { eventName: string; from: Date; to: Date; prop?: string; value?: string; asOf?: Date };
export type TrendPoint = { day: string; count: number | null };

/**
 * Daily counts from rollups only. With a property filter it reads `RollupDailyProp`, else `RollupDaily`.
 * A day with events but zero of this one is a real gap (0). A day after `asOf` (the rollup watermark) was
 * never rolled up at all and is `null` — plotting it as 0 reads as "traffic stopped," which it didn't.
 */
export async function trend(orgId: string, q: TrendQuery): Promise<TrendPoint[]> {
  const rows = q.prop
    ? await db.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char("day", 'YYYY-MM-DD') AS day, sum("count")::int AS n FROM "RollupDailyProp"
        WHERE "orgId" = ${orgId}::uuid AND "eventName" = ${q.eventName} AND "prop" = ${q.prop} AND "value" = ${q.value ?? ''}
          AND "day" >= ${q.from}::date AND "day" < ${q.to}::date GROUP BY "day"`
    : await db.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char("day", 'YYYY-MM-DD') AS day, "count" AS n FROM "RollupDaily"
        WHERE "orgId" = ${orgId}::uuid AND "eventName" = ${q.eventName}
          AND "day" >= ${q.from}::date AND "day" < ${q.to}::date`;
  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  const cutoff = q.asOf ? iso(q.asOf) : null;
  const out: TrendPoint[] = [];
  for (let t = q.from.getTime(); t < q.to.getTime(); t += DAY) {
    const day = iso(new Date(t));
    out.push({ day, count: cutoff && day > cutoff ? null : (byDay.get(day) ?? 0) });
  }
  return out;
}

/** Event names and property filter values, all from rollups (never a raw DISTINCT over `Event`). */
export async function filterOptions(orgId: string) {
  const [names, props] = await Promise.all([
    db.$queryRaw<{ eventName: string }[]>`SELECT DISTINCT "eventName" FROM "RollupDaily" WHERE "orgId" = ${orgId}::uuid ORDER BY 1`,
    db.$queryRaw<{ eventName: string; prop: string; value: string }[]>`
      SELECT DISTINCT "eventName", "prop", "value" FROM "RollupDailyProp" WHERE "orgId" = ${orgId}::uuid ORDER BY 1, 2, 3`,
  ]);
  return { eventNames: names.map((n) => n.eventName), props };
}

/** When the rollups last ran: every chart's "data as of". Null before the first run. */
export async function dataAsOf(orgId: string): Promise<Date | null> {
  return (await db.rollupWatermark.findUnique({ where: { orgId }, select: { ranAt: true } }))?.ranAt ?? null;
}
