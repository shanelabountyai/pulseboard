'use server';
// CONTROL (INV-01): a raw export — no wrapper, no guard, no schema for the harness.
import { prisma } from '../../lib/db';

export async function deleteProject(_orgSlug: string, input: { id: string }) {
  await prisma.project.delete({ where: { id: input.id } });
}
