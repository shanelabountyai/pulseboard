import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { hashToken, newToken } from '@/core/tokens';
import { KEY_PREFIX } from '@/modules/apikeys/keys';

// `npm run key:create -- <orgSlug>`: issues an API key with the `ingest` scope for /ingest (D-025), owned by the org's
// first owner, and prints it once. Only its hash is stored. Settings -> API keys issues the same thing from the app.
const slug = process.argv[2];
if (!slug) throw new Error('usage: npm run key:create -- <orgSlug>');
const org = await db.org.findUniqueOrThrow({ where: { slug } });
const owner = await db.membership.findFirstOrThrow({ where: { orgId: org.id, role: 'owner' }, orderBy: { createdAt: 'asc' } });
const key = KEY_PREFIX + newToken();
await db.apiKey.create({
  data: { orgId: org.id, label: 'Ingest (key:create)', scopes: ['ingest'], prefix: key.slice(0, KEY_PREFIX.length + 6), keyHash: hashToken(key), createdById: owner.userId },
});
console.log(`Ingest key for ${slug} (shown once):\n${key}`);
await db.$disconnect();
