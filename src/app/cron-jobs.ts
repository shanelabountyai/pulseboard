import { runRollups } from '@/lib/rollups';
import { drainOutbox, sweepOutbox } from '@/modules/notifications/outbox'; // notifications
import { sweepSsoStates } from '@/modules/sso/hooks'; // sso
import { cronWebhooks } from '@/modules/apikeys/webhooks'; // apikeys

// Clone-owned (plan §3.2): /api/cron calls this after its own core sweeps. A clone adds its jobs here,
// and removing the notifications module deletes the lines marked `// notifications`.
export async function cronJobs(): Promise<Record<string, unknown>> {
  const jobs: Record<string, unknown> = {};
  jobs.outbox = { ...(await drainOutbox()), swept: await sweepOutbox() }; // notifications
  jobs.ssoStates = await sweepSsoStates(); // sso
  jobs.webhooks = await cronWebhooks(); // apikeys
  // ponytail: rides the hourly Vercel cron, so rollups can be up to an hour stale against the PRD's 5-minute target.
  // A 5-minute cron (or an external scheduler hitting /api/cron) closes it; the job is idempotent, so any cadence is safe.
  jobs.rollups = (await runRollups()).reduce((days, r) => days + r.days, 0);
  return jobs;
}
