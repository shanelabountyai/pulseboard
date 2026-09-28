// public: the landing page
import Link from 'next/link';
import { demoEnabled } from '@/core/auth/demo';

export const dynamic = 'force-dynamic'; // reads DEMO_MODE per request, never baked in at build

export default function Home() {
  return (
    <main>
      <h1>SaaS Foundation</h1>
      <Link href="/login">Sign in</Link>
      {demoEnabled() && <> · <Link href="/demo">Demo accounts</Link></>}
      <footer>
        <Link href="/legal/privacy">Privacy</Link> · <Link href="/legal/terms">Terms</Link>
      </footer>
    </main>
  );
}
