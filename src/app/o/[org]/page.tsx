import { requireOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { funnel } from '@/lib/funnels';
import { retention, PERIODS } from '@/lib/retention';
import { dataAsOf, filterOptions, trend } from '@/lib/dashboard';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const FUNNEL = ['signup', 'view', 'purchase']; // the one saved funnel (PRD P0-5)
const FUNNEL_WINDOW_MS = 7 * DAY;
const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function AsOf({ at }: { at: Date | null }) {
  return <small>data as of {at ? `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'never (rollups have not run)'}</small>;
}

function Line({ points }: { points: { day: string; count: number }[] }) {
  const W = 720, H = 200, max = Math.max(1, ...points.map((p) => p.count));
  const x = (i: number) => (points.length < 2 ? 0 : (i / (points.length - 1)) * W);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(H - (p.count / max) * H).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Daily count, peak ${max}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="2" y="12" fontSize="12" fill="currentColor">{max}</text>
    </svg>
  );
}

export default async function Dashboard({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SP> }) {
  const ctx = await requireOrg((await params).org);
  const sp = await searchParams;

  const today = new Date(`${now().toISOString().slice(0, 10)}T00:00:00Z`);
  const to = day(one(sp.to)) ?? new Date(today.getTime() + DAY); // exclusive
  const from = day(one(sp.from)) ?? new Date(to.getTime() - 90 * DAY);
  const valid = from < to;
  const { eventNames, props } = await filterOptions(ctx.orgId);
  const eventName = one(sp.event) && eventNames.includes(one(sp.event)!) ? one(sp.event)! : (eventNames.includes('view') ? 'view' : eventNames[0]);
  const [prop, value] = (one(sp.filter) ?? '').split('\u0000'); // "prop\0value"; only registered pairs are honoured
  const filter = props.some((p) => p.eventName === eventName && p.prop === prop && p.value === value) ? { prop, value } : {};

  const asOf = await dataAsOf(ctx.orgId);
  const [points, steps, cohorts] = valid && eventName
    ? await Promise.all([
        trend(ctx.orgId, { eventName, from, to, ...filter }),
        funnel(ctx.orgId, { steps: FUNNEL, from, to, windowMs: FUNNEL_WINDOW_MS }),
        retention(ctx.orgId, { from, to }),
      ])
    : [[], [], []];

  // Retention omits weeks with no new users (D-018); show every week in range so a gap reads as a gap.
  const byWeek = new Map(cohorts.map((c) => [c.week, c]));
  const weeks: string[] = [];
  const first = new Date(from.getTime() - ((from.getUTCDay() + 6) % 7) * DAY);
  for (let t = first.getTime(); t < to.getTime(); t += WEEK) if (t >= from.getTime()) weeks.push(new Date(t).toISOString().slice(0, 10));

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const base = steps[0]?.users ?? 0;
  return (
    <main>
      <h1>Dashboard</h1>
      <form method="get">
        <label>From <input type="date" name="from" defaultValue={iso(from)} /></label>{' '}
        <label>To (exclusive) <input type="date" name="to" defaultValue={iso(to)} /></label>{' '}
        <label>Event <select name="event" defaultValue={eventName}>{eventNames.map((n) => <option key={n}>{n}</option>)}</select></label>{' '}
        <label>Filter <select name="filter" defaultValue={filter.prop ? `${filter.prop}\u0000${filter.value}` : ''}>
          <option value="">none</option>
          {props.filter((p) => p.eventName === eventName).map((p) => <option key={`${p.prop}\u0000${p.value}`} value={`${p.prop}\u0000${p.value}`}>{p.prop} = {p.value}</option>)}
        </select></label>{' '}
        <button>Apply</button>
      </form>
      {!valid && <p role="alert">“From” must be before “To”.</p>}
      {!eventName && <p>No events rolled up yet.</p>}

      {valid && eventName && (<>
        <section>
          <h2>{eventName} per day{filter.prop ? ` (${filter.prop} = ${filter.value})` : ''}</h2>
          <Line points={points} /> <AsOf at={asOf} />
        </section>

        <section>
          <h2>Funnel: {FUNNEL.join(' → ')} <small>(within 7 days of signup)</small></h2>
          <table>
            <tbody>{steps.map((s, i) => (
              <tr key={s.eventName}><th scope="row">{s.eventName}</th><td>{s.users.toLocaleString()}</td>
                <td>{i === 0 ? '' : base ? `${((s.users / base) * 100).toFixed(1)}%` : '–'}</td></tr>
            ))}</tbody>
          </table>
          <AsOf at={asOf} /> <small>(computed from raw events; ordered sequences cannot come from daily rollups)</small>
        </section>

        <section>
          <h2>Weekly retention</h2>
          <table>
            <thead><tr><th>Cohort week</th><th>Users</th>{Array.from({ length: PERIODS }, (_, k) => <th key={k}>W+{k + 1}</th>)}</tr></thead>
            <tbody>{weeks.map((w) => {
              const c = byWeek.get(w);
              if (!c) return <tr key={w}><th scope="row">{w}</th><td colSpan={PERIODS + 1}>no new users</td></tr>;
              return (
                <tr key={w}><th scope="row">{w}</th><td>{c.size.toLocaleString()}</td>
                  {c.returned.map((n, k) => <td key={k}>{n === null ? '' : `${((n / c.size) * 100).toFixed(0)}%`}</td>)}</tr>
              );
            })}</tbody>
          </table>
          <AsOf at={asOf} />
        </section>
      </>)}
    </main>
  );
}
