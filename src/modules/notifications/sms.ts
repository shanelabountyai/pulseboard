import { db } from '@/core/db';
import { env } from '@/core/env';
import { log } from '@/core/log';

// Same gating as email (spec §7d): real sends only in production or to SMS_SANDBOX_TO; elsewhere
// the message becomes a CapturedMessage (subject "sms"). Logs never carry the number or body (INV-13).
export async function sendSms(msg: { to: string; body: string }, e = env): Promise<void> {
  if (e.SMS_ENABLED === '0') return log('sms.disabled');
  if (e.VERCEL_ENV === 'production' || e.SMS_SANDBOX_TO) {
    return twilio({ body: msg.body, to: e.VERCEL_ENV === 'production' ? msg.to : e.SMS_SANDBOX_TO! }, e);
  }
  const { id } = await db.capturedMessage.create({ data: { to: msg.to, subject: 'sms', body: msg.body }, select: { id: true } });
  log('sms.captured', { id });
}

// Twilio REST over fetch, no SDK.
async function twilio(msg: { to: string; body: string }, e: typeof env) {
  if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_FROM) throw new Error('SMS provider is not configured');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000), // a hung provider must not hold a request or an outbox lease
    headers: {
      Authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: msg.to, From: e.TWILIO_FROM, Body: msg.body }),
  });
  if (!res.ok) throw new Error(`SMS send failed: ${res.status}`);
  log('sms.sent');
}
