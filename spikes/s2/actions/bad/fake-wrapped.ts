'use server';
// CONTROL (INV-01): looks wrapped (carries a spec) but never calls the guard.
import { z } from 'zod';
import { ref, type SpecdAction } from '../../lib/action';
import { prisma } from '../../lib/db';

const schema = z.object({ id: ref('project'), name: z.string().min(1) });
export const renameProject: SpecdAction = Object.assign(
  async (_orgSlug: string, input: unknown) => {
    const { id, name } = schema.parse(input);
    await prisma.project.update({ where: { id }, data: { name } });
    return { ok: true };
  },
  { spec: { kind: 'org' as const, perm: 'org.update' as const, schema } },
);
