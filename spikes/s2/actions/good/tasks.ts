'use server';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { orgAction, ref } from '../../lib/action';
import { inOrg, notFoundOnP2025 } from '../../lib/guards';
import { prisma } from '../../lib/db';

export const addTask = orgAction('org.update', z.object({ projectId: ref('project'), title: z.string().min(1) }), async (ctx, { projectId, title }) => {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...inOrg(ctx) } });   // rule 3
  if (!project) notFound();
  await prisma.task.create({ data: { id: crypto.randomUUID(), orgId: ctx.orgId, projectId, title } });
  return { ok: true };
});

export const moveTask = orgAction('org.update', z.object({ taskId: ref('task'), projectId: ref('project') }), async (ctx, { taskId, projectId }) => {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...inOrg(ctx) } });   // rule 3
  if (!project) notFound();
  await prisma.task.update({ where: { id: taskId, ...inOrg(ctx) }, data: { projectId } }).catch(notFoundOnP2025);
  return { ok: true };
});

export const setTaskDone = orgAction('org.update', z.object({ id: ref('task'), done: z.boolean() }), (ctx, { id, done }) =>
  prisma.task.update({ where: { id, ...inOrg(ctx) }, data: { done } }).then(() => ({ ok: true })).catch(notFoundOnP2025));
