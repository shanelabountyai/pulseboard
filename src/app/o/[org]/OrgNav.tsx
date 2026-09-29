'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Client-only because aria-current depends on the current path, which a server
// layout (shared across every /o/[org]/* page) doesn't have without it.
// canBilling is optional: its prop line in layout.tsx carries the `// billing` marker, so removing the billing module drops it.
// Org admin links sit at the right edge with Account, away from the product views.
export function OrgNav({ base, orgName, canBilling, canDelete }: { base: string; orgName: string; canBilling?: boolean; canDelete: boolean }) {
  const pathname = usePathname();
  const current = (href: string) => (pathname === href ? 'page' : undefined);
  return (
    <nav aria-label="Organization" style={{ display: 'contents' }}>
      <ul className="pb-nav">
        <li><span className="pb-org">{orgName}</span></li>
        <li><Link href={base} aria-current={current(base)}>Dashboard</Link></li>
        <li><Link href={`${base}/projects`} aria-current={current(`${base}/projects`)}>Projects</Link></li>
        <li className="pb-nav-end"><Link href={`${base}/settings/members`} aria-current={current(`${base}/settings/members`)}>Members</Link></li>
        {canBilling && <li><Link href={`${base}/settings/billing`} aria-current={current(`${base}/settings/billing`)}>Billing</Link></li>}
        {canDelete && <li><Link href={`${base}/settings/danger`} aria-current={current(`${base}/settings/danger`)}>Delete org</Link></li>}
        <li><Link href="/onboarding">Your orgs</Link></li>
        <li><Link href="/account/security">Account</Link></li>
      </ul>
    </nav>
  );
}
