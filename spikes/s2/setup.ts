// next/headers and next/navigation mocked the way Next behaves: cookies() reads the
// request, redirect()/notFound() throw. The harness sets the acting user per call.
import { vi } from 'vitest';

export class NavSignal extends Error {
  constructor(readonly kind: 'redirect' | 'notFound', readonly to?: string) { super(kind); }
}
export const session: { userId: string | null } = { userId: null };

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'session' && session.userId ? { value: session.userId } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new NavSignal('redirect', to); },
  notFound: () => { throw new NavSignal('notFound'); },
}));
