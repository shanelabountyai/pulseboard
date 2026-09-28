import { db } from '@/core/db';
import { env } from '@/core/env';
import { log } from '@/core/log';

export type Email = { to: string; subject: string; body: string };

// Spec §7d. Real sends happen only in production, or to EMAIL_SANDBOX_TO when it is set.
// Everywhere else the message becomes a CapturedMessage row (e2e and the demo inbox read it),
// and the log line never carries the body or the address (INV-13). EMAIL_ENABLED=0 drops it.
export async function sendEmail(msg: Email, e = env): Promise<void> {
  if (e.EMAIL_ENABLED === '0') return log('email.disabled', { subject: msg.subject });
  if (e.VERCEL_ENV === 'production' || e.EMAIL_SANDBOX_TO) {
    return resend({ ...msg, to: e.VERCEL_ENV === 'production' ? msg.to : e.EMAIL_SANDBOX_TO! }, e);
  }
  const { id } = await db.capturedMessage.create({ data: msg, select: { id: true } });
  log('email.captured', { id, subject: msg.subject });
}

// Resend over fetch, no SDK (RB and GW pattern).
async function resend(msg: Email, e: typeof env) {
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) throw new Error('Email provider is not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000), // a hung provider must not hold a request or an outbox lease
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.body }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
  log('email.sent', { subject: msg.subject });
}
