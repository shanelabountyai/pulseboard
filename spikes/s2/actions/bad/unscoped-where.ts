'use server';
// CONTROL (INV-02): guarded, but the where clause is missing inOrg(ctx).
import { z } from 'zod';
import { orgAction, ref } from '../../lib/action';
import { notFoundOnP2025 } from '../../lib/guards';
import { prisma } from '../../lib/db';

export const renameProject = orgAction('org.update', z.object({ id: ref('project'), name: z.string().min(1) }), (_ctx, { id, name }) =>
  prisma.project.update({ where: { id }, data: { name } }).then(() => ({ ok: true })).catch(notFoundOnP2025));
