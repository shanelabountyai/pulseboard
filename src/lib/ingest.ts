import { z } from 'zod';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { hashToken } from '@/core/tokens';

export const MAX_BATCH = 500;
export const MAX_BODY_BYTES = 1 << 20;
const MAX_AGE_MS = 365 * 86_400_000;

// Postgres stores neither U+0000 (in text or jsonb) nor an unpaired UTF-16 surrogate (in jsonb). Either one in a
// single row would fail the batch's one INSERT and lose every good row with it, so such a row is rejected here.
const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const UNSTORABLE_MSG = 'contains U+0000 or an unpaired surrogate';
// The same two, as JSON.stringify writes them: `\u0000` and a lowercase `\udXXX` escape (a valid pair is written
// raw). The lookbehind counts backslashes so an escaped backslash followed by literal "u0000" is not a match.
const UNSTORABLE_JSON = /(?<!\\)((?:\\\\)*)\\u(?:0000|d[89a-f][0-9a-f]{2})/g;
const text = (max: number) => z.string().min(1).max(max).refine((s) => !UNSTORABLE.test(s), UNSTORABLE_MSG);

const eventSchema = z.object({
  event_id: text(128).optional(),
  event_name: z.string().trim().min(1).max(200).refine((s) => !UNSTORABLE.test(s), UNSTORABLE_MSG),
  user_id: text(200),
  timestamp: z.iso.datetime({ offset: true }),
  properties: z.record(z.string(), z.unknown())
    .superRefine((p, ctx) => {
      const json = JSON.stringify(p);
      if (json.length > 8_192) ctx.addIssue({ code: 'custom', message: 'properties larger than 8KB' });
      else if (json.search(UNSTORABLE_JSON) >= 0) ctx.addIssue({ code: 'custom', message: UNSTORABLE_MSG });
    })
    .default({}),
});

/** A rejected row as storable JSON for `DeadLetterEvent.payload`: unstorable characters become U+FFFD. */
function deadLetterPayload(row: unknown): string {
  try {
    return (JSON.stringify(row) ?? 'null').replace(UNSTORABLE_JSON, '$1\\ufffd');
  } catch {
    return '{"unserializable":true}'; // nested past the JSON serializer's stack depth
  }
}

/**
 * The request body as UTF-8 text, or null once it is larger than `max` bytes. A declared Content-Length over the cap
 * is refused before reading; otherwise the stream is counted as it arrives, so an oversized or chunked body is cut
 * off at the cap instead of being buffered whole. (`text.length` counted UTF-16 units, so 1MB of 2-byte characters
 * passed as 0.5MB.)
 */
export async function readBodyCapped(req: Request, max = MAX_BODY_BYTES): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export type IngestResult = { accepted: number; duplicates: number; rejected: { index: number; reason: string }[] };

/** `Authorization: Bearer <write key>` → the org it writes to, or null. Keys are stored only hashed. */
export async function orgForWriteKey(header: string | null): Promise<string | null> {
  const key = /^Bearer (\S+)$/.exec(header ?? '')?.[1];
  if (!key) return null;
  const row = await db.writeKey.findFirst({ where: { keyHash: hashToken(key), revokedAt: null }, select: { orgId: true } });
  return row?.orgId ?? null;
}

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
    let p: ReturnType<typeof eventSchema.safeParse>;
    try {
      p = eventSchema.safeParse(row);
    } catch {
      // A row nested past the serializer's stack depth throws inside validation; it is one bad row, not a bad batch.
      return void bad.push({ index, payload: deadLetterPayload(row), reason: 'event: could not be processed (nested too deeply)' });
    }
    let reason = p.success ? null : p.error.issues.map((i) => `${i.path.join('.') || 'event'}: ${i.message}`).join('; ');
    const ts = p.success ? new Date(p.data.timestamp) : received;
    if (!reason && received.getTime() - ts.getTime() > MAX_AGE_MS) reason = 'timestamp: older than 365 days';
    if (reason || !p.success) return void bad.push({ index, payload: deadLetterPayload(row), reason: reason! });
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
