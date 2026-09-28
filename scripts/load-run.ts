import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { hashToken, newToken } from '@/core/tokens';

// `npm run load:run -- [rate] [batch] [seconds]` (defaults 1000 ev/s, 50 events/request, 60s) against a running
// server at LOAD_URL (default http://localhost:4500; a production build: `npm run build && npm start`).
// Open loop: requests fire on schedule whether or not earlier ones returned, and latency counts from the scheduled
// send time, so a server that falls behind shows as latency and a missed rate, never as a quietly slower client.
// Uses a throwaway org + write key, checks the stored row count against `accepted`, replays one batch to check
// dedupe over HTTP, then deletes the org (VACUUM "Event" between runs). BENCH_NO_INDEXES=1 drops the three Event
// query indexes for the run and rebuilds them after, to price their write cost (D-011).
const [rate, batch, seconds] = [process.argv[2] ?? 1000, process.argv[3] ?? 50, process.argv[4] ?? 60].map(Number) as [number, number, number];
if (![rate, batch, seconds].every((n) => n > 0) || batch > 500) throw new Error('usage: npm run load:run -- [rate>0] [batch 1-500] [seconds>0]');
const url = `${process.env.LOAD_URL ?? 'http://localhost:4500'}/ingest`;
const noIdx = process.env.BENCH_NO_INDEXES === '1';
const names = ['signup', 'view', 'click', 'purchase', 'invite', 'search', 'share', 'logout'];
const rand = (k: number) => Math.floor(Math.random() * k);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const org = await db.org.create({ data: { slug: `load-${Date.now()}`, name: 'load' } });
const key = `pk_${newToken()}`;
await db.writeKey.create({ data: { orgId: org.id, keyHash: hashToken(key) } });
const post = (body: string) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body });
const body = (i: number) => JSON.stringify({ events: Array.from({ length: batch }, (_, j) => ({
  event_id: `${i}-${j}`, event_name: names[rand(names.length)], user_id: `u${rand(20_000)}`,
  timestamp: new Date(Date.now() - rand(3_600_000)).toISOString(), properties: { plan: ['free', 'pro'][rand(2)] },
})) });
const idxDefs = noIdx
  ? await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Event' AND indexname LIKE 'Event\_orgId\_%\_idx'`
  : [];

try {
  const probe = await post(body(-1)).catch(() => null);
  if (probe?.status !== 200) throw new Error(`${url} answered ${probe?.status ?? 'nothing'}: start the server (npm run build && npm start)`);
  for (const i of idxDefs) await db.$executeRawUnsafe(`DROP INDEX "${i.indexname}"`);

  const total = Math.round((rate * seconds) / batch);
  const every = (1000 * batch) / rate;
  const ms: number[] = [];
  const failures = new Map<string, number>();
  let accepted = 0, inFlight = 0, maxInFlight = 0, done = 0;
  const fire = async (i: number, due: number) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const payload = body(i);
    try {
      const res = await post(payload);
      const json = (await res.json()) as { accepted?: number };
      if (res.status === 200) accepted += json.accepted ?? 0;
      else failures.set(`HTTP ${res.status}`, (failures.get(`HTTP ${res.status}`) ?? 0) + 1);
    } catch (e) {
      const k = (e as Error).message;
      failures.set(k, (failures.get(k) ?? 0) + 1);
    }
    ms.push(performance.now() - due);
    inFlight--; done = performance.now();
  };

  const t0 = performance.now();
  const pending: Promise<void>[] = [];
  for (let i = 0; i < total; ) {
    const t = performance.now();
    for (; i < total && t0 + i * every <= t; i++) pending.push(fire(i, t0 + i * every));
    await sleep(1);
  }
  await Promise.all(pending);

  const elapsed = (done - t0) / 1000;
  const [stored] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Event" WHERE "orgId" = ${org.id}::uuid`;
  const replay = (await (await post(body(0))).json()) as { accepted: number; duplicates: number };
  ms.sort((a, b) => a - b);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))]!.toFixed(0);
  const sent = total * batch;
  console.log([
    `target ${rate} ev/s × ${seconds}s, ${batch}/request (${(rate / batch).toFixed(0)} req/s)${noIdx ? ', WITHOUT the 3 Event query indexes' : ''}`,
    `accepted ${accepted}/${sent} in ${elapsed.toFixed(1)}s = ${(accepted / elapsed).toFixed(0)} ev/s sustained`,
    `request latency ms: p50 ${p(0.5)}, p95 ${p(0.95)}, p99 ${p(0.99)}, max ${p(1)}; max in flight ${maxInFlight}`,
    `failures: ${failures.size ? [...failures].map(([k, v]) => `${k} ×${v}`).join(', ') : 'none'}`,
    // + batch: the readiness probe's rows. The replay resends batch 0, which must be all duplicates.
    `stored ${stored!.n} rows (expect ${accepted + batch}); replay of one batch: ${replay.accepted} accepted, ${replay.duplicates} duplicates`,
  ].join('\n'));
  if (Number(stored!.n) !== accepted + batch || replay.accepted !== 0 || failures.size) process.exitCode = 1;
} finally {
  for (const i of idxDefs) await db.$executeRawUnsafe(i.indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'));
  await db.org.delete({ where: { id: org.id } });
  await db.$disconnect();
}
