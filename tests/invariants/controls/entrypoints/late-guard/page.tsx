// Control (FR-06): reads before it guards.
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';

export default async function Late({ params }: { params: Promise<{ org: string }> }) {
  const rows = await db.project.findMany();
  await requireOrg((await params).org);
  return <main>{rows.length}</main>;
}
