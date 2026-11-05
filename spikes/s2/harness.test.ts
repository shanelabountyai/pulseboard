import { afterAll, describe, expect, it } from 'vitest';
import { discover, runInvariants } from './harness';
import { prisma } from './lib/db';

const here = import.meta.dirname;
afterAll(() => prisma.$disconnect());

describe('correct actions', () => {
  it('discovers every export by glob, with none registered by hand', async () => {
    const found = await discover('actions/good/**/*.ts', here);
    expect(found.map((f) => f.name).sort()).toEqual(['addTask', 'moveTask', 'renameProject', 'setTaskDone']);
  });

  it('are green on INV-01..04, with generated input valid for every action', async () => {
    const findings = await runInvariants(await discover('actions/good/**/*.ts', here));
    expect(findings).toEqual([]);
  });
});

describe.each([
  ['unwrapped.ts', 'INV-01'],
  ['fake-wrapped.ts', 'INV-01'],
  ['unscoped-where.ts', 'INV-02'],
  ['unscoped-secondary.ts', 'INV-03'],
  ['echo-before-authz.ts', 'INV-04'],
])('control %s', (file, inv) => {
  it(`turns ${inv} red`, async () => {
    const findings = await runInvariants(await discover(`actions/bad/${file}`, here));
    console.log(`${file}:\n` + findings.map((f) => `  ${f.inv} ${f.detail}`).join('\n'));
    expect(findings.map((f) => f.inv)).toContain(inv);
    expect(findings.filter((f) => f.inv === 'HARNESS')).toEqual([]);
  });
});
