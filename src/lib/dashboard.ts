import { db } from '@/core/db';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type TrendQuery = { eventName: string; from: Date; to: Date; prop?: string; value?: string };
export type TrendPoint = { day: string; count: number };

/** Daily counts from rollups only. With a property filter it reads `RollupDailyProp`, else `RollupDaily`. Gap days are 0. */
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
  const out: TrendPoint[] = [];
  for (let t = q.from.getTime(); t < q.to.getTime(); t += DAY) out.push({ day: iso(new Date(t)), count: byDay.get(iso(new Date(t))) ?? 0 });
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
