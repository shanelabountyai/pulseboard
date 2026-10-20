import { requireOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { funnel } from '@/lib/funnels';
import { retention, PERIODS } from '@/lib/retention';
import { FRESH_WARN_MS, dataAsOf, filterOptions, trend } from '@/lib/dashboard';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const FUNNEL = ['signup', 'view', 'purchase']; // the one saved funnel (PRD P0-5)
const FUNNEL_WINDOW_MS = 7 * DAY;
// A real calendar day or null. The shape check alone let `2026-13-01` through as Invalid Date (toISOString then threw,
// a 500) and rolled `2026-02-31` over to March 3; the round trip rejects both.
const day = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
};

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const utcDate = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(d).toUpperCase();

function Fresh({ at, current }: { at: Date | null; current: Date }) {
  if (!at) return <span className="pb-fresh critical">never · rollups have not run</span>;
  const stale = current.getTime() - at.getTime() > FRESH_WARN_MS;
  const stamp = `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  return <span className={`pb-fresh ${stale ? 'warn' : 'good'}`}>{stale ? 'stale · as of ' : 'data as of '}{stamp}</span>;
}

// Trend: one y axis from zero to a nice ceiling, 3 gridlines, 4-6 x-axis dates, a direct-labeled
// endpoint, and native <title> tooltips per day (TrendChart component, D-020).
// `count: null` means the day is past the rollup watermark — never rolled up, not "zero activity" — so it's
// left out of the line/area and the endpoint, not drawn as a plunge to 0 (found in agent review, 2026-09-28).
function Trend({ points }: { points: { day: string; count: number | null }[] }) {
  const W = 720, H = 220, L = 48, R = 56, T = 12, B = 28;
  const plotted = points.map((p, i) => ({ ...p, i })).filter((p): p is { day: string; count: number; i: number } => p.count !== null);
  // A nice step (1/2/5 x 10^n) off a third of the max, so the 3 gridlines are round numbers
  // instead of repeating decimals (mx/3 of an arbitrary ceiling produces e.g. 6.666666666666667k,
  // which is both ugly and wide enough to overflow the page's left edge).
  const rawMax = Math.max(1, ...plotted.map((p) => p.count));
  const stepMag = 10 ** Math.floor(Math.log10(Math.max(rawMax / 3, 1)));
  const stepNorm = rawMax / 3 / stepMag;
  const step = (stepNorm <= 1 ? 1 : stepNorm <= 2 ? 2 : stepNorm <= 5 ? 5 : 10) * stepMag;
  const mx = step * 3;
  const n = points.length;
  const x = (i: number) => L + (W - L - R) * (n < 2 ? 0 : i / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const fmtY = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${v}`);
  const line = plotted.map((p, j) => `${j ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.count).toFixed(1)}`).join('');
  const area = plotted.length ? `${line} L${x(plotted.at(-1)!.i).toFixed(1)},${y(0).toFixed(1)} L${x(plotted[0]!.i).toFixed(1)},${y(0).toFixed(1)} Z` : '';
  const longRange = n > 180;
  const tickCount = Math.min(6, Math.max(4, n > 0 ? n : 4));
  const tickIdx = n > 1 ? Array.from({ length: tickCount }, (_, k) => Math.round((k * (n - 1)) / (tickCount - 1))) : [];
  const uniqTicks = [...new Set(tickIdx)];
  const last = plotted.at(-1);
  return (
    <svg className="pb-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily count, ${n} days, latest ${last ? last.count.toLocaleString() : 0}`}>
      {[step, step * 2, step * 3].map((v) => (
        <g key={v}>
          <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text className="tick" x={L - 8} y={y(v) + 4} textAnchor="end">{fmtY(v)}</text>
        </g>
      ))}
      <line className="axis" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
      <text className="tick" x={L - 8} y={y(0) + 4} textAnchor="end">0</text>
      {uniqTicks.map((i) => (
        <text key={i} className="tick" x={x(i)} y={H - 8} textAnchor="middle">
          {utcDate(new Date(`${points[i]!.day}T00:00:00Z`), longRange ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' })}
        </text>
      ))}
      {plotted.length > 0 && <path className="area" d={area} />}
      {plotted.length > 0 && <path className="line" d={line} />}
      {points.map((p, i) => (
        <rect key={p.day} className="hit" x={x(i) - (W / Math.max(n, 1)) / 2} y={T} width={W / Math.max(n, 1)} height={H - T - B}>
          <title>{p.count === null ? `${p.day}: not yet rolled up` : `${p.day}: ${p.count.toLocaleString()}`}</title>
        </rect>
      ))}
      {last && <circle className="end" cx={x(last.i)} cy={y(last.count)} r="4" />}
      {last && <text className="end-label" x={x(last.i) + 8} y={y(last.count) + 4}>{last.count.toLocaleString()}</text>}
    </svg>
  );
}

const heatBucket = (pct: number) => (pct < 5 ? 1 : pct < 10 ? 2 : pct < 20 ? 3 : pct < 35 ? 4 : pct < 50 ? 5 : 6);

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
        trend(ctx.orgId, { eventName, from, to, ...filter, asOf: asOf ?? undefined }),
        funnel(ctx.orgId, { steps: FUNNEL, from, to, windowMs: FUNNEL_WINDOW_MS }),
        retention(ctx.orgId, { from, to, asOf: asOf ?? undefined }),
      ])
    : [[], [], []];

  // Retention omits weeks with no new users (D-018); show every week in range so a gap reads as a gap.
  const byWeek = new Map(cohorts.map((c) => [c.week, c]));
  const weeks: string[] = [];
  const first = new Date(from.getTime() - ((from.getUTCDay() + 6) % 7) * DAY);
  for (let t = first.getTime(); t < to.getTime(); t += WEEK) if (t >= from.getTime()) weeks.push(new Date(t).toISOString().slice(0, 10));

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const base = steps[0]?.users ?? 0;
  const current = now();
  return (
    <main className="pb-page">
      <h1 className="pb-page-title">Dashboard</h1>

      <form className="pb-filters" method="get">
        <label className="pb-field"><span>From</span><input className="pb-input" type="date" name="from" defaultValue={iso(from)} /></label>
        <label className="pb-field"><span>To (exclusive)</span><input className="pb-input" type="date" name="to" defaultValue={iso(to)} /></label>
        <label className="pb-field"><span>Event</span>
          <select className="pb-input" name="event" defaultValue={eventName}>{eventNames.map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <label className="pb-field"><span>Filter</span>
          <select className="pb-input" name="filter" defaultValue={filter.prop ? `${filter.prop}\u0000${filter.value}` : ''}>
            <option value="">none</option>
            {props.filter((p) => p.eventName === eventName).map((p) => <option key={`${p.prop}\u0000${p.value}`} value={`${p.prop}\u0000${p.value}`}>{p.prop} = {p.value}</option>)}
          </select>
        </label>
        <button className="pb-button">Apply</button>
      </form>

      {!valid && <p className="pb-notice critical" role="alert">“From” must be before “To”. Pick an earlier start date.</p>}
      {valid && !eventName && <p className="pb-notice">No events have been rolled up for this org yet. Send events to <code className="pb-code">/ingest</code>, then wait for the next hourly rollup.</p>}

      {valid && eventName && (<>
        <section className="pb-panel">
          <div className="pb-panel-head">
            <h2 className="pb-panel-title"><code className="pb-code">{eventName}</code> per day{filter.prop ? <> (<code className="pb-code">{filter.prop} = {filter.value}</code>)</> : ''}</h2>
            <Fresh at={asOf} current={current} />
          </div>
          <Trend points={points} />
        </section>

        <section className="pb-panel">
          <div className="pb-panel-head">
            <h2 className="pb-panel-title">Funnel: <code className="pb-code">{FUNNEL.join(' → ')}</code></h2>
            <Fresh at={asOf} current={current} />
          </div>
          <ol className="pb-funnel">
            {steps.map((s, i) => (
              <li key={s.eventName}>
                <span className="step">{s.eventName}</span>
                <div className="track"><div className="bar" style={{ width: `${base ? (s.users / base) * 100 : 0}%` }} /></div>
                <span className="nums">{s.users.toLocaleString()}<small>{i === 0 ? 'entered' : base ? `${((s.users / base) * 100).toFixed(1)}% of entrants · ${steps[i - 1]!.users ? ((s.users / steps[i - 1]!.users) * 100).toFixed(1) : '–'}% of prev` : '–'}</small></span>
              </li>
            ))}
          </ol>
          <p className="pb-panel-note">Users who did each step in this order within 7 days of signing up.</p>
        </section>

        <section className="pb-panel">
          <div className="pb-panel-head">
            <h2 className="pb-panel-title">Weekly retention</h2>
            <Fresh at={asOf} current={current} />
          </div>
          <div className="pb-scroll">
            <table className="pb-retention">
              <thead><tr><th>Cohort week</th><th>Users</th>{Array.from({ length: PERIODS }, (_, k) => <th key={k}>W+{k + 1}</th>)}</tr></thead>
              <tbody>
                {weeks.map((w) => {
                  const c = byWeek.get(w);
                  if (!c) return <tr key={w}><th scope="row">{w}</th><td className="gap" colSpan={PERIODS + 1}>no new users</td></tr>;
                  return (
                    <tr key={w}>
                      <th scope="row">{w}</th>
                      <td className="size">{c.size.toLocaleString()}</td>
                      {c.returned.map((n, k) => {
                        if (n === null) return <td key={k} />;
                        const pct = (n / c.size) * 100;
                        return <td key={k} className={`pb-h${heatBucket(pct)}`} title={`${w} cohort, week ${k + 1}: ${pct.toFixed(0)}%`}>{pct.toFixed(0)}%</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pb-legend">
            <span>Returned</span>
            {['<5%', '5–10', '10–20', '20–35', '35–50', '50%+'].map((label, i) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><i className={`pb-h${i + 1}`} />{label}</span>
            ))}
          </div>
        </section>
      </>)}
    </main>
  );
}
