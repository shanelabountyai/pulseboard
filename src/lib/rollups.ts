import { now } from '@/core/clock';
import { db } from '@/core/db';

// Re-scan this far behind the watermark each run. An ingest stamps receivedAt from its own clock before its
// insert commits, so a row can become visible after a run has already advanced past it (a slow commit, or two
// app instances whose clocks disagree). Recompute is idempotent, so the overlap costs a re-run, never a double count.
// ponytail: fixed 1-minute window; skew or commit latency beyond it drops a late row until its day is dirtied again.
export const OVERLAP_MS = 60_000;

export type RollupResult = { orgId: string; days: number; watermark: Date };

/** Rolls up every org. Each org is one transaction, so one failing org does not roll back the rest. */
export async function runRollups(): Promise<RollupResult[]> {
  const orgs = await db.org.findMany({ select: { id: true } });
  const out: RollupResult[] = [];
  for (const { id } of orgs) out.push(await runRollupsForOrg(id));
  return out;
}

/**
 * Finds the UTC days touched by events received since the watermark (D-008: by receivedAt, so a late event
 * dirties its old day), rebuilds those days from raw rows with DELETE + INSERT … SELECT, then advances the
 * watermark to the newest receivedAt seen, all in one transaction. The watermark row lock serializes
 * concurrent runs for the same org.
 */
export async function runRollupsForOrg(orgId: string): Promise<RollupResult> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "RollupWatermark" ("orgId", "receivedAt", "ranAt") VALUES (${orgId}::uuid, 'epoch', ${now()})
      ON CONFLICT DO NOTHING`;
    const [mark] = await tx.$queryRaw<{ receivedAt: Date }[]>`
      SELECT "receivedAt" FROM "RollupWatermark" WHERE "orgId" = ${orgId}::uuid FOR UPDATE`;
    const since = new Date(mark!.receivedAt.getTime() - OVERLAP_MS);

    const [scan] = await tx.$queryRaw<{ days: string[] | null; max: Date | null }[]>`
      SELECT array_agg(DISTINCT to_char("ts" AT TIME ZONE 'UTC', 'YYYY-MM-DD')) AS days, max("receivedAt") AS max
      FROM "Event" WHERE "orgId" = ${orgId}::uuid AND "receivedAt" > ${since}`;
    const days = scan?.days ?? [];

    if (days.length) {
      await tx.$executeRaw`DELETE FROM "RollupDaily" WHERE "orgId" = ${orgId}::uuid AND "day" = ANY(${days}::date[])`;
      await tx.$executeRaw`DELETE FROM "RollupDailyProp" WHERE "orgId" = ${orgId}::uuid AND "day" = ANY(${days}::date[])`;
      // LATERAL per day: one (orgId, ts) index range each, so cost follows the dirty days' rows, however far apart they are.
      await tx.$executeRaw`
        INSERT INTO "RollupDaily" ("orgId", "day", "eventName", "count", "uniques")
        SELECT ${orgId}::uuid, d, e."eventName", count(*), count(DISTINCT e."userId")
        FROM unnest(${days}::date[]) AS d
        CROSS JOIN LATERAL (
          SELECT "eventName", "userId" FROM "Event"
          WHERE "orgId" = ${orgId}::uuid AND "ts" >= d::timestamp AT TIME ZONE 'UTC' AND "ts" < (d + 1)::timestamp AT TIME ZONE 'UTC'
        ) e
        GROUP BY d, e."eventName"`;
      // (event, prop) pairs from the rows just written; DISTINCT so a prop registered both globally and for
      // this event counts once. A hash join on a handful of pairs, not a lookup per event.
      await tx.$executeRaw`
        WITH pairs AS (
          SELECT DISTINCT r."eventName" AS name, p."prop" AS prop FROM "RollupDaily" r
          JOIN "RegisteredProperty" p ON p."orgId" = r."orgId" AND (p."eventName" IS NULL OR p."eventName" = r."eventName")
          WHERE r."orgId" = ${orgId}::uuid AND r."day" = ANY(${days}::date[])
        )
        INSERT INTO "RollupDailyProp" ("orgId", "day", "eventName", "prop", "value", "count")
        SELECT ${orgId}::uuid, d, e."eventName", pairs.prop, left(e."properties" ->> pairs.prop, 200) AS v, count(*)
        FROM unnest(${days}::date[]) AS d
        CROSS JOIN LATERAL (
          SELECT "eventName", "properties" FROM "Event"
          WHERE "orgId" = ${orgId}::uuid AND "ts" >= d::timestamp AT TIME ZONE 'UTC' AND "ts" < (d + 1)::timestamp AT TIME ZONE 'UTC'
        ) e
        JOIN pairs ON pairs.name = e."eventName"
        WHERE e."properties" ->> pairs.prop IS NOT NULL
        GROUP BY d, e."eventName", pairs.prop, v`;
    }

    const watermark = scan?.max && scan.max > mark!.receivedAt ? scan.max : mark!.receivedAt;
    await tx.$executeRaw`
      UPDATE "RollupWatermark" SET "receivedAt" = ${watermark}, "ranAt" = ${now()} WHERE "orgId" = ${orgId}::uuid`;
    return { orgId, days: days.length, watermark };
  }, { timeout: 10 * 60_000, maxWait: 60_000 });
}

export type Drift = { orgId: string; day: string; eventName: string; raw: [number, number]; rollup: [number, number] };

/**
 * Rollup (count, uniques) vs. the same aggregate over raw events, per (org, day, event). Days holding an event
 * the last run has not seen yet are skipped: they are pending, not drifted. Returns [] when clean.
 */
export async function verifyRollups(): Promise<Drift[]> {
  const rows = await db.$queryRaw<{ orgId: string; day: string; eventName: string; rc: number; ru: number; oc: number; ou: number }[]>`
    WITH raw AS (
      SELECT e."orgId", (e."ts" AT TIME ZONE 'UTC')::date AS day, e."eventName",
             count(*)::int AS c, count(DISTINCT e."userId")::int AS u, max(e."receivedAt") AS latest
      FROM "Event" e GROUP BY 1, 2, 3
    ), pending AS (
      SELECT raw."orgId", raw.day FROM raw
      LEFT JOIN "RollupWatermark" w ON w."orgId" = raw."orgId"
      WHERE w."receivedAt" IS NULL OR raw.latest > w."receivedAt"
    )
    SELECT coalesce(raw."orgId", r."orgId")::text AS "orgId", to_char(coalesce(raw.day, r."day"), 'YYYY-MM-DD') AS day,
           coalesce(raw."eventName", r."eventName") AS "eventName",
           coalesce(raw.c, 0) AS rc, coalesce(raw.u, 0) AS ru, coalesce(r."count", 0) AS oc, coalesce(r."uniques", 0) AS ou
    FROM raw FULL JOIN "RollupDaily" r ON r."orgId" = raw."orgId" AND r."day" = raw.day AND r."eventName" = raw."eventName"
    WHERE (raw.c IS DISTINCT FROM r."count" OR raw.u IS DISTINCT FROM r."uniques")
      AND NOT EXISTS (SELECT 1 FROM pending p WHERE p."orgId" = coalesce(raw."orgId", r."orgId") AND p.day = coalesce(raw.day, r."day"))
    ORDER BY 1, 2, 3`;
  return rows.map((r) => ({ orgId: r.orgId, day: r.day, eventName: r.eventName, raw: [r.rc, r.ru], rollup: [r.oc, r.ou] }));
}
