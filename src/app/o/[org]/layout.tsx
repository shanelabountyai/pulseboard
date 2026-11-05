import Link from 'next/link';
import { can } from '@/core/authz/permissions';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { OrgNav } from './OrgNav';

// Navigation only. Layouts do not re-run on every navigation, so each page calls requireOrg itself.
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const org = await db.org.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true } });
  const base = `/o/${ctx.slug}`;
  return (
    <>
      <header className="pb-appbar">
        <Link className="pb-wordmark" href={base}>
          <svg className="pulse" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M1 11h4l2-5 3 9 2.5-7 1.5 3H19" />
          </svg>
          Pulseboard
        </Link>
        <OrgNav
          base={base}
          orgName={org.name}
          canAudit={can(ctx.role, 'audit.read')}
          canBilling={can(ctx.role, 'billing.manage')} // billing
          canSso={ctx.role === 'owner'} // sso
          canApiKeys={can(ctx.role, 'apikeys.manage')} // apikeys
          canDelete={can(ctx.role, 'org.delete')}
        />
      </header>
      {children}
    </>
  );
}
