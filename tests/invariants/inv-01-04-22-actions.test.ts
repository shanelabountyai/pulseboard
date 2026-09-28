import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { notRef } from '@/core/authz/action';
import { discover, generate, inlineUseServer, runInvariants, unguardedEntrypoints } from './harness';

// INV-01 anonymous refused · INV-02 other org's ids refused · INV-03 one secondary id swapped ·
// INV-04 cross-org ≡ nonexistent · INV-22 unenrolled admin refused. Every 'use server' export in
// src/ is found by glob, so a clone's actions are covered with no registration.
describe('every server action', () => {
  it('is discovered by glob', async () => {
    const names = (await discover()).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['startOrg', 'joinOrg', 'setRole', 'removeFromOrg', 'inviteMember', 'destroyOrg', 'deleteMyAccount', 'submitTotp']));
  });

  it('passes INV-01/02/03/04/22', async () => {
    const findings = await runInvariants(await discover());
    expect(findings).toEqual([]);
  }, 180_000);

  it('has no inline use server the glob cannot see (FR-07)', () => {
    expect(inlineUseServer()).toEqual([]);
  });
});

describe('every page, layout and route handler (FR-06)', () => {
  it('guards first, or says why it is public', () => {
    expect(unguardedEntrypoints()).toEqual([]);
  });
});

// Controls for FR-06/07/08: each must stay red, or the check is blind.
describe('controls FR-06/07/08', () => {
  it('flags a late guard, a missing guard, one unguarded handler and a reasonless marker', () => {
    const none = 'first await is none, not requireUser/requireOrg';
    expect(unguardedEntrypoints('**/{page,layout,route}.{ts,tsx}', `${process.cwd()}/tests/invariants/controls/entrypoints`)).toEqual([
      'late-guard/page.tsx: first await is db.project.findMany, not requireUser/requireOrg',
      `no-guard/layout.tsx: ${none}`,
      `no-reason/page.tsx: ${none}`,
      'one-handler-unguarded/route.ts: first await is req.json, not requireUser/requireOrg',
    ]);
  });

  it('flags an inline use server', () => {
    expect(inlineUseServer('tests/invariants/controls/*.{ts,tsx}')).toEqual(['tests/invariants/controls/inline-use-server.tsx']);
  });

  it('refuses an untagged id field', async () => {
    const findings = await runInvariants(await discover('tests/invariants/controls/untagged-id.ts'));
    expect(findings).toEqual([expect.objectContaining({ inv: 'HARNESS', detail: expect.stringContaining('untagged id-like field "inviteId"') })]);
  });

  it('takes notRef() as not an id', () => {
    expect(generate(z.object({ token: notRef(z.string()) }), () => 'unused').value).toEqual({ token: 'x' });
  });
});

// Each control is a known-bad action. If one stops turning its invariant red, the harness is blind.
describe.each([
  ['unwrapped.ts', 'INV-01'],
  ['fake-wrapped.ts', 'INV-01'],
  ['unscoped-where.ts', 'INV-02'],
  ['unscoped-secondary.ts', 'INV-03'],
  ['echo-before-authz.ts', 'INV-04'],
  ['own-membership-check.ts', 'INV-22'],
])('control %s', (file, inv) => {
  it(`turns ${inv} red`, async () => {
    const findings = await runInvariants(await discover(`tests/invariants/controls/${file}`));
    expect(findings.map((f) => f.inv)).toContain(inv);
    expect(findings.filter((f) => f.inv === 'HARNESS')).toEqual([]);
  });
});
