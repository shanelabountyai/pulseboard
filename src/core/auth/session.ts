import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { env } from '@/core/env';
import { Refused } from '@/core/errors';
import { hashToken, newToken } from '@/core/tokens';

// Hashed DB sessions (groundwork `src/session.ts`). The cookie holds the raw token and the
// row only its sha256, so a database read signs no one in (INV-07). Every request reads the
// row, so deleting it is instant revocation (INV-05).
export const SESSION_COOKIE = 'session';
const TTL_MS = 30 * 24 * 3600_000;
const FRESH_MS = 5 * 60_000;
// An enrolled user's session that has not passed TOTP dies after this, so one link buys a
// handful of guesses, not 30 days of them (FR-02).
export const PENDING_MFA_MS = 10 * 60_000;

export type SessionCtx = {
  hash: string;
  userId: string;
  email: string;
  authAt: Date;
  mfaAt: Date | null;
  totpEnrolled: boolean;
};

/** Thrown when an action needs a sign-in within the last 5 minutes (INV-26). */
export class ReauthRequired extends Refused {
  constructor() {
    super('For this change, sign in again first. A sign-in link counts as recent for 5 minutes.');
  }
}

export async function createSession(userId: string, opts: { mfa?: boolean } = {}): Promise<string> {
  const token = newToken();
  const t = now();
  await db.session.create({
    data: { hash: hashToken(token), userId, authAt: t, mfaAt: opts.mfa ? t : null, createdAt: t, expiresAt: new Date(t.getTime() + TTL_MS) },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: TTL_MS / 1000, secure: env.APP_URL.startsWith('https:'),
  });
}

export async function sessionFor(token: string | undefined): Promise<SessionCtx | null> {
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { hash: hashToken(token) },
    include: { user: { select: { email: true, totpEnrolledAt: true } } },
  });
  if (!s || s.expiresAt <= now()) return null;
  if (s.user.totpEnrolledAt && !s.mfaAt && now().getTime() - s.authAt.getTime() > PENDING_MFA_MS) return null;
  return { hash: s.hash, userId: s.userId, email: s.user.email, authAt: s.authAt, mfaAt: s.mfaAt, totpEnrolled: !!s.user.totpEnrolledAt };
}

/** One query per request. */
export const currentSession = cache(async () => sessionFor((await cookies()).get(SESSION_COOKIE)?.value));

/**
 * The signed-in user, or a redirect: to /login with no session, to /login/mfa while an enrolled
 * user has not passed TOTP in this session. Only /login/mfa itself passes `allowPendingMfa`.
 */
export async function requireUser(opts: { allowPendingMfa?: boolean } = {}): Promise<SessionCtx> {
  const s = await currentSession();
  if (!s) redirect('/login');
  if (s.totpEnrolled && !s.mfaAt && !opts.allowPendingMfa) redirect('/login/mfa');
  return s;
}

export function assertFresh(s: SessionCtx) {
  if (now().getTime() - s.authAt.getTime() > FRESH_MS) throw new ReauthRequired();
}

export async function signOut() {
  const s = await currentSession();
  if (s) await db.session.deleteMany({ where: { hash: s.hash } });
  (await cookies()).delete(SESSION_COOKIE);
}

export async function signOutEverywhere(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

/** A TOTP change, a recovery-code use or an email change keeps only this session (INV-23). */
export const otherSessions = (s: SessionCtx) => ({ userId: s.userId, hash: { not: s.hash } });
