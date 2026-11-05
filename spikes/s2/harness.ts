// INV-01..04 harness (spike S2). Discovers every 'use server' export by glob —
// nothing is registered by hand — builds input from each action's schema, and
// attacks it from a two-org fixture, checking both the outcome and a row snapshot.
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { generate } from './lib/gen';
import type { SpecdAction } from './lib/action';
import { prisma } from './lib/db';
import { NavSignal, session } from './setup';

export type Finding = { inv: 'INV-01' | 'INV-02' | 'INV-03' | 'INV-04' | 'HARNESS'; action: string; detail: string };
type Found = { file: string; name: string; fn: unknown };

const USE_SERVER = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"])use server\1/;

export async function discover(pattern: string, cwd: string): Promise<Found[]> {
  const out: Found[] = [];
  for (const rel of globSync(pattern, { cwd }).sort()) {
    const file = path.join(cwd, rel);
    if (!USE_SERVER.test(readFileSync(file, 'utf8'))) continue;
    const mod = await import(file);
    for (const [name, fn] of Object.entries(mod)) out.push({ file: rel, name, fn });
  }
  return out;
}

// ---- fixture: org A (the attacker's) and org B (the victim's), one project + task each
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const F = {
  a: { user: ID(1), org: ID(2), slug: 'org-a', project: ID(3), task: ID(4) },
  b: { user: ID(11), org: ID(12), slug: 'org-b', project: ID(13), task: ID(14) },
};
const NONEXISTENT = ID(999);

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "Task","Project","Membership","Org","User" CASCADE');
  for (const o of [F.a, F.b]) {
    await prisma.user.create({ data: { id: o.user, email: `${o.slug}@example.test` } });
    await prisma.org.create({ data: { id: o.org, slug: o.slug } });
    await prisma.membership.create({ data: { orgId: o.org, userId: o.user, role: 'owner' } });
    await prisma.project.create({ data: { id: o.project, orgId: o.org, name: `${o.slug} project` } });
    await prisma.task.create({ data: { id: o.task, orgId: o.org, projectId: o.project, title: `${o.slug} task` } });
  }
}

async function snapshot() {
  const [orgs, members, projects, tasks] = await Promise.all([
    prisma.org.findMany({ orderBy: { id: 'asc' } }), prisma.membership.findMany({ orderBy: { orgId: 'asc' } }),
    prisma.project.findMany({ orderBy: { id: 'asc' } }), prisma.task.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ orgs, members, projects, tasks });
}

type Outcome = { kind: 'ok' | 'redirect' | 'notFound' | 'error'; detail?: unknown };
async function call(fn: SpecdAction, as: string | null, input: unknown): Promise<Outcome & { changed: boolean }> {
  await reset();
  const before = await snapshot();
  session.userId = as;
  let o: Outcome;
  try { o = { kind: 'ok', detail: await fn(F.a.slug, input) }; }
  catch (e) {
    o = e instanceof NavSignal ? { kind: e.kind, detail: e.to } : { kind: 'error', detail: `${(e as Error).name}: ${(e as Error).message}` };
  } finally { session.userId = null; }
  return { ...o, changed: (await snapshot()) !== before };
}

const idFor = (org: typeof F.a) => (ref: string) => {
  const id = (org as Record<string, string>)[ref];
  if (!id) throw new Error(`no fixture row for ref('${ref}')`);
  return id;
};

export async function runInvariants(found: Found[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const { file, name, fn } of found) {
    const action = `${file}#${name}`;
    const spec = (fn as Partial<SpecdAction>)?.spec;
    // Rule 4 + INV-01: every export is an endpoint; one the harness cannot drive is unguarded until proven otherwise.
    if (typeof fn !== 'function' || !spec) {
      findings.push({ inv: 'INV-01', action, detail: 'export is not built by orgAction/userAction, so it cannot be verified' });
      continue;
    }
    const act = fn as SpecdAction;
    let gen: ReturnType<typeof generate>;
    try { gen = generate(spec.schema, idFor(F.a)); }
    catch (e) { findings.push({ inv: 'HARNESS', action, detail: (e as Error).message }); continue; }

    // Sanity: the generated input is valid — as A's owner, on A's rows, the action succeeds.
    const own = await call(act, F.a.user, gen.value);
    if (own.kind !== 'ok') findings.push({ inv: 'HARNESS', action, detail: `own-org call did not succeed: ${JSON.stringify(own)}` });

    // INV-01: anonymous → refused, nothing written.
    const anon = await call(act, null, gen.value);
    if (anon.kind === 'ok' || anon.changed) findings.push({ inv: 'INV-01', action, detail: `anonymous call: ${anon.kind}, rows changed: ${anon.changed}` });

    // INV-02: every id swapped to org B's → refused, nothing written.
    const allB = generate(spec.schema, idFor(F.b)).value;
    const x = await call(act, F.a.user, allB);
    if (x.kind === 'ok' || x.changed) findings.push({ inv: 'INV-02', action, detail: `all ids from org B: ${x.kind}, rows changed: ${x.changed}` });

    for (const p of gen.refPaths) {
      const swap = (org: typeof F.a | null) => generate(spec.schema, (ref, at) => (at !== p ? idFor(F.a)(ref) : org ? idFor(org)(ref) : NONEXISTENT)).value;
      // INV-03: one secondary id swapped to org B's → refused, nothing written.
      const cross = await call(act, F.a.user, swap(F.b));
      if (gen.refPaths.length > 1 && (cross.kind === 'ok' || cross.changed))
        findings.push({ inv: 'INV-03', action, detail: `"${p}" from org B: ${cross.kind}, rows changed: ${cross.changed}` });
      // INV-04: cross-org id and nonexistent id give byte-identical responses.
      const missing = await call(act, F.a.user, swap(null));
      const [c, m] = [JSON.stringify([cross.kind, cross.detail]), JSON.stringify([missing.kind, missing.detail])];
      if (c !== m) findings.push({ inv: 'INV-04', action, detail: `"${p}": cross-org ${c} ≠ nonexistent ${m}` });
    }
  }
  return findings;
}
