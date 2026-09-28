// public: Stripe signature over the raw body (INV-12)
import { receiveStripeWebhook } from '@/modules/billing/webhook';

export const dynamic = 'force-dynamic';

// text(), never json(): the signature is over the exact bytes Stripe sent.
export async function POST(req: Request) {
  const { status, body } = await receiveStripeWebhook(await req.text(), req.headers.get('stripe-signature'));
  return Response.json(body, { status });
}
