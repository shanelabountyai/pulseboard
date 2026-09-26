import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18)
import { hashToken, newToken } from '@/core/tokens';

// `npm run key:create -- <orgSlug>`: mints a write key for /ingest and prints it once. Only its hash is stored.
const slug = process.argv[2];
if (!slug) throw new Error('usage: npm run key:create -- <orgSlug>');
const org = await db.org.findUniqueOrThrow({ where: { slug } });
const key = `pk_${newToken()}`;
await db.writeKey.create({ data: { orgId: org.id, keyHash: hashToken(key) } });
console.log(`Write key for ${slug} (shown once):\n${key}`);
await db.$disconnect();
