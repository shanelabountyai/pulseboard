import { ingest, MAX_BATCH, MAX_BODY_BYTES, orgForWriteKey } from '@/lib/ingest';

const fail = (status: number, error: string) => Response.json({ error }, { status });

// Public endpoint: authenticated by write key, not a session. Per-row problems are a 200 with `rejected`;
// only an unusable request as a whole gets a 4xx.
export async function POST(req: Request) {
  const orgId = await orgForWriteKey(req.headers.get('authorization'));
  if (!orgId) return fail(401, 'invalid write key');

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return fail(413, 'body larger than 1MB');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'body is not JSON');
  }
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > MAX_BATCH) {
    return fail(400, `events must be an array of 1-${MAX_BATCH}`);
  }
  return Response.json(await ingest(orgId, events));
}
