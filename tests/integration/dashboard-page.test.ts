import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { ingest } from '@/lib/ingest';
import { runRollupsForOrg } from '@/lib/rollups';
import Dashboard from '@/app/o/[org]/page';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { NavSignal } from '../helpers/next';
import { addMember, makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

// The page is an async server component: calling it runs the guard, the query-param parsing and every read,
// and returns the element tree. That is enough to pin the guard and the parsing without a browser.
const render = (slug: string, sp: Record<string, string> = {}) => Dashboard({ params: Promise.resolve({ org: slug }), searchParams: Promise.resolve(sp) });

/** Depth-first text of a React element tree (calling the page's own sync components), for asserting what a reader sees. */
const textOf = (node: unknown): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const { type, props } = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof type === 'function') return textOf((type as (p: unknown) => unknown)(props)); // Fresh, Trend: sync components
  return props ? textOf(props.children) : '';
};

async function seeded() {
  const org = await makeOrg('dash-org');
  const member = await addMember(org.id, 'member', 'member@example.test');
  await ingest(org.id, [{ event_name: 'view', user_id: 'u1', timestamp: new Date().toISOString() }]);
  await runRollupsForOrg(org.id);
  return { org, member };
}

describe('dashboard page /o/[org]', () => {
  it('is guarded: signed out redirects to login, a non-member gets notFound', async () => {
    const { org } = await seeded();
    await expect(render(org.slug)).rejects.toMatchObject({ kind: 'redirect' });
    const outsider = await db.user.create({ data: { email: 'out@example.test' } });
    await signInAs(outsider.id, { mfa: true });
    await expect(render(org.slug)).rejects.toEqual(new NavSignal('notFound'));
  });

  it('renders for a member, with the rolled-up event and the freshness stamp', async () => {
    const { org, member } = await seeded();
    await signInAs(member.id, { mfa: true });
    const text = textOf(await render(org.slug));
    expect(text).toContain('view per day');
    expect(text).toMatch(/data as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  });

  // `new Date('2026-13-01T00:00:00Z')` is Invalid Date; the page then called toISOString() on it and threw a 500.
  it.each([['to', '2026-13-01'], ['from', '2026-13-01'], ['to', '2026-02-31'], ['from', '2026-00-10']])(
    'ignores an impossible %s=%s and falls back to the default range instead of throwing',
    async (k, v) => {
      const { org, member } = await seeded();
      await signInAs(member.id, { mfa: true });
      const text = textOf(await render(org.slug, { [k]: v }));
      expect(text).toContain('view per day');
      expect(text).not.toContain('must be before');
    },
  );

  it('says so when from is not before to', async () => {
    const { org, member } = await seeded();
    await signInAs(member.id, { mfa: true });
    expect(textOf(await render(org.slug, { from: '2026-09-10', to: '2026-09-10' }))).toContain('“From” must be before “To”');
  });

  it('shows the empty state before anything is rolled up', async () => {
    const org = await makeOrg('empty-org');
    const member = await addMember(org.id, 'member', 'member@example.test');
    await signInAs(member.id, { mfa: true });
    expect(textOf(await render(org.slug))).toContain('No events have been rolled up for this org yet');
  });
});
