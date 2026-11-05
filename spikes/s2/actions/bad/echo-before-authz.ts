'use server';
// CONTROL (INV-04): reads by id first, then leaks the row's name when it is not ours (SB rate-change echo).
// It writes nothing, so only the response comparison can catch it.
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { orgAction, ref } from '../../lib/action';
import { prisma } from '../../lib/db';

export const archiveProject = orgAction('org.update', z.object({ id: ref('project') }), async (ctx, { id }) => {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();
  if (project.orgId !== ctx.orgId) throw new Error(`"${project.name}" belongs to another workspace`);
  return { ok: true };
});
