import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { now } from '@/core/clock';
import { sealSecret } from '@/core/auth/secret-box';
import { ingest, MAX_BATCH } from '@/lib/ingest';
import { runRollupsForOrg } from '@/lib/rollups';
import { DEMO_TOTP_SECRET } from './seed-demo';

// `npm run seed:generate -- [orgSlug=demo] [users=20000]`: ~1M events over 90 days with the shapes the dashboard
// should show. Seeded PRNG, and it deletes and recreates the org first, so every run is the same data.
//   funnel  signup → view (75%) → purchase (30% of viewers, 50% on the pro plan), view within 1h, purchase within 3d
//   retention  week 0 = 100%, then 5% + 50% * 0.75^(k-1) of users active per week, so the triangle decays to a floor
//   growth  signups skew recent, so the trend rises
const DAY = 86_400_000;
const slug = process.argv[2] ?? 'demo';
const users = Number(process.argv[3] ?? 20_000);
let s = 0x9e3779b9;
const rand = () => { // mulberry32
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const engagement = ['view', 'view', 'view', 'view', 'view', 'click', 'click', 'click', 'search', 'search', 'share', 'invite'] as const;

await db.org.deleteMany({ where: { slug } }); // rebuild from scratch; cascades to events, rollups and the membership below
const org = await db.org.create({ data: { slug, name: `${slug} (seed)` } });
for (const prop of ['plan', 'platform']) await db.registeredProperty.create({ data: { orgId: org.id, prop } });

// A demo-flagged owner so `/demo` (DEMO_MODE=1) can sign straight into this org's dashboard — without this,
// PRD P0-6's "seed → rollup → dashboard in one command chain" has no way to actually view the dashboard
// (found while getting agent review of the live dashboard, 2026-09-28: the seeded org had zero memberships).
// Owners must have TOTP enrolled before requireOrg lets them open an org (src/core/authz/guards.ts), even
// though demoSignIn() marks the session's own MFA as passed — a fixed, public secret is fine here for the same
// reason scripts/seed-demo.ts's is: this account can never reach a real database (INV-18/INV-27).
const demoEmail = `owner@${slug}.seed.test`;
const demoUserData = { isDemo: true, name: `${slug} owner`, totpSecretSealed: sealSecret(DEMO_TOTP_SECRET, 'totp'), totpEnrolledAt: now(), totpLastStep: null };
const demoUser = await db.user.upsert({ where: { email: demoEmail }, create: { email: demoEmail, ...demoUserData }, update: demoUserData });
await db.membership.upsert({
  where: { orgId_userId: { orgId: org.id, userId: demoUser.id } },
  create: { orgId: org.id, userId: demoUser.id, role: 'owner' },
  update: {},
});

const end = now().getTime();
let buf: object[] = [];
let total = 0;
const flush = async () => { if (buf.length) { await ingest(org.id, buf); total += buf.length; buf = []; } };

for (let u = 0; u < users; u++) {
  const plan = rand() < 0.2 ? 'pro' : 'free';
  const props = { plan, platform: pick(['web', 'web', 'ios', 'android']) };
  const start = end - Math.floor(90 * (1 - Math.sqrt(rand())) * DAY) - Math.floor(rand() * DAY);
  let seq = 0;
  const emit = async (name: string, at: number) => {
    if (at > end) return;
    buf.push({ event_id: `seed-${u}-${seq++}`, event_name: name, user_id: `u${u}`, timestamp: new Date(at).toISOString(), properties: props });
    if (buf.length >= MAX_BATCH) await flush();
  };
  await emit('signup', start);
  const viewed = rand() < 0.75; // non-viewers never emit `view`, or later engagement would refill the funnel's step 2
  if (viewed) {
    const viewAt = start + rand() * 3_600_000;
    await emit('view', viewAt);
    if (rand() < (plan === 'pro' ? 0.5 : 0.3)) await emit('purchase', viewAt + 60_000 + rand() * 3 * DAY);
  }
  // Retention buckets by UTC Monday-start calendar week (D-018), not by days-since-signup: a user who signs up
  // mid-week has their week-0 activity spread across a calendar boundary, and "weeks since signup" spills that
  // spread into what the dashboard counts as W+1, overstating it (found reviewing the seeded dashboard, 2026-09-28).
  // Aligning k to the cohort's own calendar week keeps the decay curve k represents matching what W+k measures.
  const sd = new Date(start);
  const cohortWeekStart = Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate()) - ((sd.getUTCDay() + 6) % 7) * DAY;
  for (let k = 0; cohortWeekStart + k * 7 * DAY < end; k++) {
    if (k > 0 && rand() >= 0.05 + 0.5 * 0.75 ** (k - 1)) continue;
    const winStart = k === 0 ? start : cohortWeekStart + k * 7 * DAY;
    const winEnd = cohortWeekStart + (k + 1) * 7 * DAY;
    // Scale the signup week's count to its partial length, or a full week's events crowd into the days
    // before Sunday and the daily trend grows a 3x weekly spike.
    const n = Math.round((17 + Math.floor(rand() * 23)) * ((winEnd - winStart) / (7 * DAY)));
    for (let i = n; i > 0; i--) await emit(pick(viewed ? engagement : engagement.filter((e) => e !== 'view')), winStart + rand() * (winEnd - winStart));
  }
}
await flush();
await runRollupsForOrg(org.id);
for (const tbl of ['Event', 'RollupUserDay']) await db.$executeRawUnsafe(`ANALYZE "${tbl}"`); // stale stats turn the retention query into a 10-minute plan
const n = (await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Event" WHERE "orgId" = ${org.id}::uuid`)[0]!.n;
console.log(`${slug}: ${users} users, ${total} events sent, ${n} in Event, rolled up`);
console.log(`Sign in at /demo (DEMO_MODE=1) as ${demoEmail} to view the dashboard.`);
await db.$disconnect();
