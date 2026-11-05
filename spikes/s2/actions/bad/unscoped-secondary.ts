'use server';
// CONTROL (INV-03): the task is scoped, the target project is not (RB addLeaseTenant).
import { z } from 'zod';
import { orgAction, ref } from '../../lib/action';
import { inOrg, notFoundOnP2025 } from '../../lib/guards';
import { prisma } from '../../lib/db';

export const moveTask = orgAction('org.update', z.object({ taskId: ref('task'), projectId: ref('project') }), (ctx, { taskId, projectId }) =>
  prisma.task.update({ where: { id: taskId, ...inOrg(ctx) }, data: { projectId } }).then(() => ({ ok: true })).catch(notFoundOnP2025));
