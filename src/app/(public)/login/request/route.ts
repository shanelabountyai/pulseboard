// public: sends a link; rate-limited (INV-09)
import { requestLink } from '@/core/auth/link';
import { clientIp, isSameOrigin } from '@/core/http';

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return new Response(null, { status: 403 });
  const email = (await req.formData()).get('email');
  await requestLink(typeof email === 'string' ? email : '', clientIp(req.headers));
  return Response.redirect(new URL('/login?sent=1', req.url), 303);
}
