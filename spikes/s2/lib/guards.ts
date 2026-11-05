// Stand-ins for core/authz/guards.ts (M3). The shape matches spec §7b; the session
// is the spike's: the cookie holds a user id rather than a hashed session token.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { prisma } from './db';

export type Permission = 'org.update' | 'members.manage';
export type OrgCtx = { userId: string; orgId: string; role: string };
export class AuthzError extends Error {}

const grants: Record<string, readonly Permission[]> = {
  owner: ['org.update', 'members.manage'],
  admin: ['org.update', 'members.manage'],
  member: [],
};

export async function requireOrg(orgSlug: string, perm?: Permission): Promise<OrgCtx> {
  const userId = (await cookies()).get('session')?.value;
  if (!userId) redirect('/login');
  const m = await prisma.membership.findFirst({ where: { userId, org: { slug: orgSlug } } });
  if (!m) notFound();
  if (perm && !grants[m.role]?.includes(perm)) throw new AuthzError(perm);
  return { userId, orgId: m.orgId, role: m.role };
}

export const inOrg = (ctx: OrgCtx) => ({ orgId: ctx.orgId });

export function notFoundOnP2025(e: unknown): never {
  if ((e as { code?: string })?.code === 'P2025') notFound();
  throw e;
}
