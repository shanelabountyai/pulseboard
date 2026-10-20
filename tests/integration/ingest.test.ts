import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { advanceClock, now } from '@/core/clock';
import { newToken, hashToken } from '@/core/tokens';
import { POST } from '@/app/ingest/route';
import { MAX_BODY_BYTES, readBodyCapped } from '@/lib/ingest';

let key: string;
let orgId: string;

beforeEach(async () => {
  advanceClock(0);
  await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent", "WriteKey", "Org" CASCADE`;
  orgId = (await db.org.create({ data: { slug: 'test-org', name: 'Test Org' } })).id;
  key = newToken();
  await db.writeKey.create({ data: { orgId, keyHash: hashToken(key) } });
});
afterAll(() => db.$disconnect());

const ev = (over: Record<string, unknown> = {}) => ({
  event_name: 'signup', user_id: 'u1', timestamp: now().toISOString(), properties: { plan: 'free' }, ...over,
});
const post = (body: unknown, auth = `Bearer ${key}`) =>
  POST(new Request('http://x/ingest', {
    method: 'POST', headers: { authorization: auth }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

describe('POST /ingest', () => {
  it('rejects a missing, wrong or revoked write key with 401', async () => {
    expect((await post({ events: [ev()] }, '')).status).toBe(401);
    expect((await post({ events: [ev()] }, 'Bearer nope')).status).toBe(401);
    await db.writeKey.updateMany({ data: { revokedAt: now() } });
    expect((await post({ events: [ev()] })).status).toBe(401);
    expect(await db.event.count()).toBe(0);
  });

  it('rejects a malformed envelope or a batch outside 1..500 with 400', async () => {
    for (const body of ['{not json', { events: [] }, { events: 'x' }, [ev()], { events: Array.from({ length: 501 }, () => ev()) }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(await db.event.count()).toBe(0);
  });

  it('stores a valid batch of 500', async () => {
    const res = await post({ events: Array.from({ length: 500 }, (_, i) => ev({ user_id: `u${i}` })) });
    expect(await res.json()).toEqual({ accepted: 500, duplicates: 0, rejected: [] });
    expect(await db.event.count()).toBe(500);
  });

  it('dead-letters bad rows with reasons while the valid rows in the same batch land', async () => {
    const res = await post({
      events: [
        ev({ user_id: 'good1' }),
        ev({ event_name: '' }),
        42,
        ev({ timestamp: 'yesterday' }),
        ev({ properties: [1, 2] }),
        ev({ user_id: 'good2' }),
      ],
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accepted).toBe(2);
    expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([1, 2, 3, 4]);
    expect((await db.event.findMany({ orderBy: { userId: 'asc' } })).map((e) => e.userId)).toEqual(['good1', 'good2']);
    const dead = await db.deadLetterEvent.findMany({ orderBy: { id: 'asc' } });
    expect(dead).toHaveLength(4);
    expect(dead[1]!.payload).toBe(42);
    for (const d of dead) expect(d.reason).not.toBe('');
  });

  it('stores a replayed batch once, and dedupes within a batch, by event_id', async () => {
    const batch = { events: [ev({ event_id: 'a' }), ev({ event_id: 'b' }), ev({ event_id: 'a' }), ev()] };
    expect(await (await post(batch)).json()).toMatchObject({ accepted: 3, duplicates: 1 });
    expect(await (await post(batch)).json()).toMatchObject({ accepted: 1, duplicates: 3 }); // only the id-less one lands again
    expect(await db.event.count({ where: { eventId: { not: null } } })).toBe(2);
  });

  it('clamps a future timestamp to receipt time and accepts a late one as sent', async () => {
    const late = new Date(now().getTime() - 6 * 3_600_000);
    await post({ events: [ev({ user_id: 'future', timestamp: '2099-01-01T00:00:00Z' }), ev({ user_id: 'late', timestamp: late.toISOString() })] });
    const [future, lateRow] = await Promise.all(['future', 'late'].map((userId) => db.event.findFirstOrThrow({ where: { userId } })));
    expect(future!.ts).toEqual(future!.receivedAt);
    expect(lateRow!.ts).toEqual(late);
  });

  it('dead-letters a timestamp older than 365 days', async () => {
    const body = await (await post({ events: [ev({ timestamp: '2001-01-01T00:00:00Z' })] })).json();
    expect(body.rejected[0].reason).toMatch(/365 days/);
  });

  it('keeps one org\'s key from writing to another', async () => {
    const other = await db.org.create({ data: { slug: 'other', name: 'Other' } });
    await post({ events: [ev()] });
    expect(await db.event.count({ where: { orgId: other.id } })).toBe(0);
    expect(await db.event.count({ where: { orgId } })).toBe(1);
  });

  // Postgres refuses U+0000 in text/jsonb and an unpaired surrogate in jsonb. Before the fix any one of these made
  // the batch's single INSERT throw: a 500, and every good row in the batch was lost with it.
  it.each([
    ['user_id with U+0000', { user_id: 'a\u0000b' }],
    ['event_name with U+0000', { event_name: 'a\u0000b' }],
    ['event_id with U+0000', { event_id: 'a\u0000b' }],
    ['user_id with an unpaired surrogate', { user_id: 'a\ud800b' }],
    ['property value with U+0000', { properties: { k: 'a\u0000b' } }],
    ['property key with U+0000', { properties: { ['k\u0000']: 1 } }],
    ['property value with an unpaired high surrogate', { properties: { k: 'a\ud800b' } }],
    ['property value with an unpaired low surrogate', { properties: { k: 'a\udc00b' } }],
  ])('dead-letters a %s and still stores the good rows', async (_, over) => {
    const res = await post({ events: [ev({ user_id: 'good1' }), ev(over), ev({ user_id: 'good2' })] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toEqual([{ index: 1, reason: expect.stringMatching(/U\+0000 or an unpaired surrogate/) }]);
    expect((await db.event.findMany({ orderBy: { userId: 'asc' } })).map((e) => e.userId)).toEqual(['good1', 'good2']);
    expect(await db.deadLetterEvent.count()).toBe(1);
  });

  it('keeps valid surrogate pairs and an escaped backslash before "u0000" as sent', async () => {
    const body = await (await post({ events: [ev({ user_id: 'emoji-\u{1F600}', properties: { k: '\u{1F600}', path: 'C:\\u0000' } })] })).json();
    expect(body).toEqual({ accepted: 1, duplicates: 0, rejected: [] });
    const row = await db.event.findFirstOrThrow();
    expect(row.userId).toBe('emoji-\u{1F600}');
    expect(row.properties).toEqual({ k: '\u{1F600}', path: 'C:\\u0000' });
  });

  it('stores a dead-letter payload holding U+0000 or an unpaired surrogate, with U+FFFD in their place', async () => {
    const res = await post({ events: [{ event_name: '', junk: 'x\u0000y', ['k\ud800']: 'z\udc00' }, ev({ user_id: 'good' })] });
    expect(res.status).toBe(200);
    expect((await res.json()).accepted).toBe(1);
    const [dead] = await db.deadLetterEvent.findMany();
    expect(dead!.payload).toEqual({ event_name: '', junk: 'x\uFFFDy', ['k\uFFFD']: 'z\uFFFD' });
  });

  it('dead-letters a row nested too deeply to serialize and still stores the good rows', async () => {
    const deep = '['.repeat(200_000) + ']'.repeat(200_000);
    const good = JSON.stringify(ev({ user_id: 'good' }));
    for (const row of [`{"event_name":"a","user_id":"u","timestamp":"${now().toISOString()}","properties":{"a":${deep}}}`, deep]) {
      await db.$executeRaw`TRUNCATE "Event", "DeadLetterEvent"`;
      const res = await post(`{"events":[${row},${good}]}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accepted).toBe(1);
      expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([0]);
      expect(await db.deadLetterEvent.count()).toBe(1);
    }
  });

  // The cap is bytes: `text.length` counted UTF-16 units, so 1.4MB of 2-byte characters passed as 0.7MB.
  it('rejects a body over 1MB counted in bytes, not characters, with 413', async () => {
    const big = 'é'.repeat(700_000); // 1.4MB as UTF-8, 700k UTF-16 units
    const res = await post(`{"events":[${JSON.stringify(ev({ properties: { a: big } }))}]}`);
    expect(res.status).toBe(413);
    expect(await db.deadLetterEvent.count()).toBe(0);
  });

  it('refuses a declared Content-Length over the cap before reading the body', async () => {
    let pulled = false;
    const body = new ReadableStream({ pull: (c) => { pulled = true; c.enqueue(new TextEncoder().encode('{}')); c.close(); } }, { highWaterMark: 0 });
    const req = new Request('http://x/ingest', {
      method: 'POST', body, duplex: 'half', headers: { authorization: `Bearer ${key}`, 'content-length': String(MAX_BODY_BYTES + 1) },
    } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(pulled).toBe(false);
  });
});

describe('readBodyCapped', () => {
  const streamed = (chunks: string[]) => {
    const enc = new TextEncoder();
    const body = new ReadableStream({ start: (c) => { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
    return new Request('http://x', { method: 'POST', body, duplex: 'half' } as RequestInit);
  };

  it('reassembles a multi-byte character split across chunks', async () => {
    const bytes = new TextEncoder().encode('é'); // 2 bytes
    const body = new ReadableStream({ start: (c) => { c.enqueue(bytes.slice(0, 1)); c.enqueue(bytes.slice(1)); c.close(); } });
    expect(await readBodyCapped(new Request('http://x', { method: 'POST', body, duplex: 'half' } as RequestInit))).toBe('é');
  });

  it('accepts exactly the cap and cuts off one byte past it, with no Content-Length', async () => {
    expect(await readBodyCapped(streamed(['ab', 'cd']), 4)).toBe('abcd');
    expect(await readBodyCapped(streamed(['ab', 'cd', 'e']), 4)).toBeNull();
  });

  it('reads an empty body as an empty string', async () => {
    expect(await readBodyCapped(new Request('http://x', { method: 'POST' }))).toBe('');
  });
});

describe('ingest validation boundaries', () => {
  const DAY = 86_400_000;
  /** `d` written with a +05:30 offset: same instant, different wall clock. */
  const withOffset = (d: Date) => `${new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 19)}+05:30`;

  it('stores an offset timestamp as the same UTC instant', async () => {
    const t = new Date(Math.floor(now().getTime() / 1000) * 1000 - DAY);
    expect((await (await post({ events: [ev({ timestamp: withOffset(t) })] })).json()).accepted).toBe(1);
    expect((await db.event.findFirstOrThrow()).ts).toEqual(t);
  });

  it('rejects a timestamp with no offset, a date only, or a non-string', async () => {
    const body = await (await post({ events: [
      ev({ timestamp: '2026-10-01T00:00:00' }), ev({ timestamp: '2026-10-01' }), ev({ timestamp: now().getTime() }), ev({ timestamp: undefined }),
    ] })).json();
    expect(body.accepted).toBe(0);
    expect(body.rejected.map((r: { index: number; reason: string }) => [r.index, r.reason.startsWith('timestamp:')])).toEqual([[0, true], [1, true], [2, true], [3, true]]);
  });

  it('accepts a timestamp just inside 365 days and dead-letters one just past it', async () => {
    const t = now().getTime();
    const body = await (await post({ events: [
      ev({ user_id: 'inside', timestamp: new Date(t - 365 * DAY + 5_000).toISOString() }),
      ev({ user_id: 'past', timestamp: new Date(t - 365 * DAY - 5_000).toISOString() }),
    ] })).json();
    expect(body.accepted).toBe(1);
    expect(body.rejected).toEqual([{ index: 1, reason: 'timestamp: older than 365 days' }]);
    expect((await db.event.findFirstOrThrow()).userId).toBe('inside');
  });

  it('clamps a far-future timestamp (year 9999) to receipt time rather than rejecting it', async () => {
    const body = await (await post({ events: [ev({ timestamp: '9999-12-31T23:59:59Z' })] })).json();
    expect(body.accepted).toBe(1);
    const row = await db.event.findFirstOrThrow();
    expect(row.ts).toEqual(row.receivedAt);
  });

  it('trims event_name, and rejects one that is blank after trimming', async () => {
    const body = await (await post({ events: [ev({ event_name: '  signup  ' }), ev({ event_name: '   ' })] })).json();
    expect(body.accepted).toBe(1);
    expect(body.rejected.map((r: { index: number }) => r.index)).toEqual([1]);
    expect((await db.event.findFirstOrThrow()).eventName).toBe('signup');
  });

  it('enforces the field length limits at the boundary', async () => {
    const body = await (await post({ events: [
      ev({ event_id: 'e'.repeat(128), event_name: 'n'.repeat(200), user_id: 'u'.repeat(200) }),
      ev({ event_id: 'e'.repeat(129) }),
      ev({ event_name: 'n'.repeat(201) }),
      ev({ user_id: 'u'.repeat(201) }),
      ev({ event_id: '' }),
      ev({ user_id: '' }),
    ] })).json();
    expect(body.accepted).toBe(1);
    expect(body.rejected.map((r: { index: number; reason: string }) => [r.index, r.reason.split(':')[0]])).toEqual([
      [1, 'event_id'], [2, 'event_name'], [3, 'user_id'], [4, 'event_id'], [5, 'user_id'],
    ]);
  });

  it('rejects a non-string user_id or event_name instead of coercing it', async () => {
    const body = await (await post({ events: [ev({ user_id: 42 }), ev({ event_name: null })] })).json();
    expect(body.accepted).toBe(0);
    expect(body.rejected.map((r: { reason: string }) => r.reason.split(':')[0])).toEqual(['user_id', 'event_name']);
  });

  it('defaults missing properties to {} and caps them at 8KB serialized', async () => {
    const pad = (n: number) => ({ k: 'x'.repeat(n - '{"k":""}'.length) }); // serializes to exactly n characters
    const body = await (await post({ events: [
      { event_name: 'signup', user_id: 'none', timestamp: now().toISOString() },
      ev({ user_id: 'at-cap', properties: pad(8_192) }),
      ev({ user_id: 'over-cap', properties: pad(8_193) }),
      ev({ user_id: 'null-props', properties: null }),
    ] })).json();
    expect(body.accepted).toBe(2);
    expect(body.rejected).toEqual([
      { index: 2, reason: 'properties: properties larger than 8KB' },
      { index: 3, reason: expect.stringMatching(/^properties:/) },
    ]);
    expect((await db.event.findFirstOrThrow({ where: { userId: 'none' } })).properties).toEqual({});
  });

  it('counts a replay racing itself once: two concurrent copies of a batch store each event_id once', async () => {
    const batch = { events: Array.from({ length: 50 }, (_, i) => ev({ event_id: `race-${i}`, user_id: `u${i}` })) };
    const [a, b] = await Promise.all([post(batch), post(batch)]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.accepted + jb.accepted).toBe(50);
    expect(ja.duplicates + jb.duplicates).toBe(50);
    expect(await db.event.count()).toBe(50);
  });

  it('scopes event_id dedupe to the org: the same id in two orgs is two events', async () => {
    const other = await db.org.create({ data: { slug: 'other', name: 'Other' } });
    const otherKey = newToken();
    await db.writeKey.create({ data: { orgId: other.id, keyHash: hashToken(otherKey) } });
    await post({ events: [ev({ event_id: 'shared' })] });
    expect(await (await post({ events: [ev({ event_id: 'shared' })] }, `Bearer ${otherKey}`)).json()).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(await db.event.count()).toBe(2);
  });

  it('requires exactly "Bearer <key>": another scheme, a lowercase scheme or trailing junk is a 401', async () => {
    for (const auth of [`Basic ${key}`, `bearer ${key}`, `Bearer ${key} extra`, key]) {
      expect((await post({ events: [ev()] }, auth)).status).toBe(401);
    }
    expect(await db.event.count()).toBe(0);
  });
});
