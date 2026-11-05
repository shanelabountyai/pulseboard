'use server';
import { z } from 'zod';
import { orgAction, ref } from '../../lib/action';
import { inOrg, notFoundOnP2025 } from '../../lib/guards';
import { prisma } from '../../lib/db';

export const renameProject = orgAction('org.update', z.object({ id: ref('project'), name: z.string().min(1) }), (ctx, { id, name }) =>
  prisma.project.update({ where: { id, ...inOrg(ctx) }, data: { name } }).then(() => ({ ok: true })).catch(notFoundOnP2025));
