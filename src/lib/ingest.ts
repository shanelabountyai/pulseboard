import { z } from 'zod';
import { now } from '@/core/clock';
import { db } from '@/core/db';

export const MAX_BATCH = 500;
export const MAX_BODY_BYTES = 1 << 20;
const MAX_AGE_MS = 365 * 86_400_000;

const eventSchema = z.object({
  event_id: z.string().min(1).max(128).optional(),
  event_name: z.string().trim().min(1).max(200),
  user_id: z.string().min(1).max(200),
  timestamp: z.iso.datetime({ offset: true }),
  properties: z.record(z.string(), z.unknown())
    .refine((p) => JSON.stringify(p).length <= 8_192, 'properties larger than 8KB')
    .default({}),
});

export type IngestResult = { accepted: number; duplicates: number; rejected: { index: number; reason: string }[] };

/**
 * Validates each row on its own: bad rows go to the dead-letter table with a reason, good rows land in one
 * multi-row insert. Timestamps are client-supplied and untrusted: future ones clamp to receipt time, late
 * ones are kept as sent (the rollup reads receivedAt to find their window), and ones older than a year are rejected.
 */
export async function ingest(orgId: string, rows: unknown[]): Promise<IngestResult> {
  const received = now();
  const good: { eventId: string | null; name: string; userId: string; ts: string; props: string }[] = [];
  const bad: { index: number; payload: string; reason: string }[] = [];

  rows.forEach((row, index) => {
    const p = eventSchema.safeParse(row);
    let reason = p.success ? null : p.error.issues.map((i) => `${i.path.join('.') || 'event'}: ${i.message}`).join('; ');
    const ts = p.success ? new Date(p.data.timestamp) : received;
    if (!reason && received.getTime() - ts.getTime() > MAX_AGE_MS) reason = 'timestamp: older than 365 days';
    if (reason || !p.success) return void bad.push({ index, payload: JSON.stringify(row), reason: reason! });
    good.push({
      eventId: p.data.event_id ?? null,
      name: p.data.event_name,
      userId: p.data.user_id,
      ts: (ts > received ? received : ts).toISOString(),
      props: JSON.stringify(p.data.properties),
    });
  });

  // unnest over parallel arrays: one statement per batch, whatever its size. A replayed event_id is skipped
  // by the (orgId, eventId) unique index, including a repeat inside the same batch.
  const accepted = good.length
    ? await db.$executeRaw`
        INSERT INTO "Event" ("orgId", "eventId", "eventName", "userId", "ts", "receivedAt", "properties")
        SELECT ${orgId}::uuid, e, n, u, t, ${received}, p::jsonb
        FROM unnest(${good.map((g) => g.eventId)}::text[], ${good.map((g) => g.name)}::text[], ${good.map((g) => g.userId)}::text[],
                    ${good.map((g) => g.ts)}::timestamptz[], ${good.map((g) => g.props)}::text[]) AS x(e, n, u, t, p)
        ON CONFLICT ("orgId", "eventId") DO NOTHING`
    : 0;

  if (bad.length) {
    await db.$executeRaw`
      INSERT INTO "DeadLetterEvent" ("orgId", "payload", "reason", "receivedAt")
      SELECT ${orgId}::uuid, p::jsonb, r, ${received}
      FROM unnest(${bad.map((b) => b.payload)}::text[], ${bad.map((b) => b.reason)}::text[]) AS x(p, r)`;
  }

  return { accepted, duplicates: good.length - accepted, rejected: bad.map(({ index, reason }) => ({ index, reason })) };
}
