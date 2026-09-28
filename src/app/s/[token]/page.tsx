// public: the share token is the credential (INV-08)
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { clientIp } from '@/core/http';
import { readShare } from '@/core/share/links';

// Public, anonymous (spec §7c). The no-referrer, noindex and no-store headers come from
// next.config.ts on /s/:path*; force-dynamic keeps a revoked link from being served from cache.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shared', robots: { index: false, follow: false } };

export default async function Shared({ params }: { params: Promise<{ token: string }> }) {
  const view = await readShare((await params).token, clientIp(await headers()));
  if (view === 'limited') return <main><h1>Too many requests</h1><p>Wait a few minutes and try again.</p></main>;
  if (!view) notFound();
  return (
    <main>
      <h1>{view.name}</h1>
    </main>
  );
}
