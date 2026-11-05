#!/usr/bin/env bash
# Spike S1 (plan §1): Prisma 7 multi-file schema with module back-relations.
# Builds a scratch copy twice — modules present, then modules removed per spec §4 —
# and checks validate + generate + next build pass both times, then checks that a
# marker-aware diff of core.prisma is clean on the module-removed tree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)/s1"
mkdir -p "$WORK"
rsync -a --exclude node_modules --exclude .next --exclude src/generated --exclude spikes --exclude audit "$ROOT/" "$WORK/"
cp -Rc "$ROOT/node_modules" "$WORK/node_modules"   # APFS clone: Turbopack rejects a symlinked node_modules
cd "$WORK"

# Code that depends on each module's models, the way real module code and routes will.
mkdir -p src/core src/app/api/webhooks/stripe src/app/api/cron
cat > src/core/db.ts <<'TS'
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
TS
cat > src/modules/billing/account.ts <<'TS'
import { prisma } from '@/core/db';
export const billingFor = (orgId: string) => prisma.billingAccount.findUnique({ where: { orgId }, include: { org: true } });
TS
cat > src/modules/notifications/outbox.ts <<'TS'
import { prisma } from '@/core/db';
export const pending = () => prisma.outbox.findMany({ where: { sentAt: null }, include: { org: true } });
TS
cat > src/app/api/webhooks/stripe/route.ts <<'TS'
import { billingFor } from '@/modules/billing/account';
export const dynamic = 'force-dynamic';
export async function POST() { return Response.json(await billingFor('00000000-0000-0000-0000-000000000000')); }
TS
cat > src/app/api/cron/route.ts <<'TS'
import { prisma } from '@/core/db';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ orgs: await prisma.org.count() }); }
TS

check() {
  echo "== $1"
  npx prisma validate >/dev/null
  npx prisma generate >/dev/null
  npx tsc --noEmit
  npx next build >build.log 2>&1 || { tail -30 build.log; exit 1; }
  echo "   validate + generate + typecheck + next build: PASS"
}

git init -q && git add -A && git -c user.email=s1@spike -c user.name=s1 commit -qm base && git tag v0.0.0-s1
check "modules present"

# Remove both modules per spec §4: directory, .prisma file, routes, marked back-relation lines.
# Plus .next: its generated route types still name the deleted routes and fail tsc.
rm -rf .next src/modules/billing src/modules/notifications src/app/api/webhooks prisma/schema/billing.prisma prisma/schema/notifications.prisma
sed -i '' -E '/\/\/ (billing|notifications)$/d' prisma/schema/core.prisma
check "modules removed"

# Drift prototype: ignore removed lines carrying the marker of a module whose directory is absent.
echo "== drift on core.prisma (marker-aware)"
drift() {
  git diff v0.0.0-s1 -- prisma/schema/core.prisma | grep -E '^[-+][^-+]' | while IFS= read -r l; do
    m=$(sed -nE 's#^-.*// ([a-z]+)$#\1#p' <<<"$l")
    if [ -n "$m" ] && [ ! -d "src/modules/$m" ]; then continue; fi
    echo "$l"
  done
}
unexpected=$(drift)
if [ -n "$unexpected" ]; then echo "   FAIL: $unexpected"; exit 1; fi
echo "   drift: PASS (only marked lines of absent modules differ)"
# Negative control: an unmarked core edit must still be caught.
sed -i '' 's/^  name           String$/  name           String?/' prisma/schema/core.prisma
grep -q "name           String?$" prisma/schema/core.prisma || { echo "   FAIL: control edit did not apply"; exit 1; }
[ -n "$(drift)" ] || { echo "   FAIL: drift missed an unmarked core edit"; exit 1; }
echo "   drift control: PASS (unmarked Org.name edit is flagged)"
echo "S1 PASS  ($WORK)"
