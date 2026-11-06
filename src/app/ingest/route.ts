// public: authenticated by an API key with the `ingest` scope (D-025), not a session
import { requireApiKey } from '@/modules/apikeys/api';
import { ingest, MAX_BATCH, MAX_BODY_BYTES } from '@/lib/ingest';

const fail = (status: number, error: string) => Response.json({ error }, { status });

// Public endpoint: key, scope and rate limit come from requireApiKey, so 401/403/429 are problem+json; the body
// errors below keep their `{ error }` shape. Per-row problems are a 200 with `rejected`; only an unusable request
// as a whole gets a 4xx.
export async function POST(req: Request) {
  const ctx = await requireApiKey(req, 'ingest');
  if (ctx instanceof Response) return ctx;

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
  return Response.json(await ingest(ctx.orgId, events));
}
