// Request helpers for the route handlers that take anonymous POSTs (D-12: logic lives here).

/**
 * K5: an ISP commonly hands a customer a whole /64, so keying a rate limit on the exact
 * address lets them rotate through it. Expand `::` and take the first 4 groups (64 bits).
 * ponytail: doesn't unpack an IPv4-mapped tail (`::ffff:1.2.3.4`) into its two hextets, so
 * that form's key is coarser than a real /64 — fine for a rate-limit bucket, upgrade if a
 * bypass through it is ever observed.
 */
function ipv6Prefix(addr: string): string {
  const base = addr.split('%')[0]!; // strip a zone id (fe80::1%eth0)
  const [head = '', tail = ''] = base.split('::');
  if (!base.includes('::')) return head.split(':').slice(0, 4).join(':');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const zeros = Array<string>(Math.max(8 - headGroups.length - tailGroups.length, 0)).fill('0');
  return [...headGroups, ...zeros, ...tailGroups].slice(0, 4).join(':');
}

/** Vercel sets x-forwarded-for to the client address; locally it is absent. */
export const clientIp = (h: Headers) => {
  const addr = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!addr) return 'unknown';
  return addr.includes(':') ? ipv6Prefix(addr) : addr;
};

/**
 * Login CSRF guard for plain-form POSTs (server actions get this check from Next). Without it,
 * another site could post its own link token and sign a visitor into the attacker's account.
 */
export function isSameOrigin(h: Headers): boolean {
  const origin = h.get('origin');
  if (origin) return URL.canParse(origin) && new URL(origin).host === h.get('host');
  return h.get('sec-fetch-site') === 'same-origin';
}
