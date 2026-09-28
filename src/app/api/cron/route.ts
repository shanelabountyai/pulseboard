// public: CRON_SECRET via isAuthorizedCron (INV-10/11)
import { isAuthorizedCron } from '@/core/cron';
import { log } from '@/core/log';
import { sweepRateLimits } from '@/core/rate-limit';
import { cronJobs } from '@/app/cron-jobs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response(null, { status: 401 }); // no WWW-Authenticate: nothing to challenge
  const rateLimitsDeleted = await sweepRateLimits();
  const jobs = await cronJobs();
  log('cron.done', { rateLimitsDeleted, ...jobs });
  return Response.json({ ok: true, rateLimitsDeleted, ...jobs }, { headers: { 'Cache-Control': 'no-store' } });
}
