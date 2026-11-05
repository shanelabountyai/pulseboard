#!/usr/bin/env bash
# Spike S3 (plan §1, §3.4): a template migration whose timestamp is EARLIER than a
# clone's latest own migration arrives by merge. Does Prisma apply it cleanly?
#   T1 20260101 template init (Org)
#   C1 20260301 clone app table (Widget → Org)          ← clone DB has T1, C1 applied
#   T2 20260201 template adds Org.plan + OrgTag table    ← merged in, sorts BEFORE C1
#   C2 20260401 clone migration depending on T2 (Widget.tagId → OrgTag, reads Org.plan)
# Pass: deploy applies T2 then C2; dev reports no drift; an empty DB replays T1,T2,C1,C2 cleanly.
set -eu
show() { grep -vE "^(Loaded|Prisma schema|Datasource|$)" | sed "s/^/   /" || true; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)/s3"; mkdir -p "$WORK/prisma/migrations"
cd "$WORK"; ln -s "$ROOT/node_modules" node_modules
DB=saas_foundation_s3; SHADOW=saas_foundation_s3_shadow
PGU="${PGUSER:-$USER}"   # local trust auth; the pg adapter still needs a user name
for d in $DB $SHADOW; do dropdb --if-exists "$d"; createdb "$d"; done
export DATABASE_URL="postgresql://$PGU@localhost:5432/$DB?connection_limit=10&pool_timeout=20"
export SHADOW_DATABASE_URL="postgresql://$PGU@localhost:5432/$SHADOW"
cat > prisma.config.ts <<'TS'
import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL!, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } });
TS
mig() { mkdir -p "prisma/migrations/$1"; cat > "prisma/migrations/$1/migration.sql"; }
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
# deploy needs a schema file to exist; the final one (after the merge) is written below.
printf 'datasource db {\n  provider = "postgresql"\n}\n' > prisma/schema.prisma

mig 20260101000000_t1_core_init <<'SQL'
CREATE TABLE "Org" ("id" UUID PRIMARY KEY, "name" TEXT NOT NULL);
SQL
mig 20260301000000_c1_widget <<'SQL'
CREATE TABLE "Widget" ("id" UUID PRIMARY KEY, "orgId" UUID NOT NULL REFERENCES "Org"("id") ON DELETE CASCADE, "label" TEXT NOT NULL);
SQL
echo "== clone state: T1, C1 applied"
out=$(npx prisma migrate deploy 2>&1) || { echo "$out"; exit 1; }; echo "$out" | show
psql -q "postgresql://$PGU@localhost:5432/$DB" -c "INSERT INTO \"Org\" VALUES ('00000000-0000-0000-0000-000000000001','Acme'); INSERT INTO \"Widget\" VALUES ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000001','w');"

# The merge brings T2 (earlier timestamp than C1); the clone then writes C2 on top of it.
mig 20260201000000_t2_core_plan_and_tag <<'SQL'
ALTER TABLE "Org" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
CREATE TABLE "OrgTag" ("id" UUID PRIMARY KEY, "orgId" UUID NOT NULL REFERENCES "Org"("id") ON DELETE CASCADE, "name" TEXT NOT NULL);
SQL
mig 20260401000000_c2_widget_tag <<'SQL'
ALTER TABLE "Widget" ADD COLUMN "tagId" UUID REFERENCES "OrgTag"("id") ON DELETE SET NULL;
UPDATE "Widget" w SET "label" = w."label" || ':' || o."plan" FROM "Org" o WHERE o."id" = w."orgId";
SQL
cat > prisma/schema.prisma <<'PRISMA'
datasource db {
  provider = "postgresql"
}
model Org {
  id      String   @id @db.Uuid
  name    String
  plan    String   @default("free")
  widgets Widget[]
  tags    OrgTag[]
}
model OrgTag {
  id      String   @id @db.Uuid
  orgId   String   @db.Uuid
  org     Org      @relation(fields: [orgId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  name    String
  widgets Widget[]
}
model Widget {
  id    String  @id @db.Uuid
  orgId String  @db.Uuid
  org   Org     @relation(fields: [orgId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  label String
  tagId String? @db.Uuid
  tag   OrgTag? @relation(fields: [tagId], references: [id], onUpdate: NoAction)
}
PRISMA

echo "== status before deploy"
npx prisma migrate status 2>&1 | show
echo "== migrate deploy (the upgrade path)"
out=$(npx prisma migrate deploy 2>&1) || { echo "$out"; exit 1; }; echo "$out" | show
order=$(psql -At "postgresql://$PGU@localhost:5432/$DB" -c 'SELECT migration_name FROM _prisma_migrations ORDER BY started_at' | tr '\n' ' ')
echo "   applied order: $order"
label=$(psql -At "postgresql://$PGU@localhost:5432/$DB" -c 'SELECT label FROM "Widget"')
[ "$label" = "w:free" ] || { echo "   FAIL: C2 did not run against T2's column (label=$label)"; exit 1; }
echo "   C2 ran against T2's column: PASS (label=$label)"

echo "== migrate dev (drift check, dev path)"
out=$(npx prisma migrate dev --create-only --name s3_probe 2>&1 || true)
echo "$out" | show
# --create-only --name always writes a file; an empty one (comments only) means schema == migrations.
probe=$(cat prisma/migrations/*_s3_probe/migration.sql 2>/dev/null | grep -v '^--' | grep -v '^$' || true)
[ -z "$probe" ] || { echo "   FAIL: dev generated SQL (drift): $probe"; exit 1; }
rm -rf prisma/migrations/*_s3_probe
echo "$out" | grep -qi "drift\|reset" && { echo "   FAIL: dev reported drift"; exit 1; }
echo "   dev: PASS (no drift, nothing to generate)"

echo "== clean replay on an empty DB (what migrate reset does, minus seeding)"
# Not `migrate reset`: Prisma refuses it from an AI agent without the user's consent,
# and the replay itself is the thing under test. Same database, dropped and re-created.
dropdb "$DB"; createdb "$DB"
out=$(npx prisma migrate deploy 2>&1) || { echo "$out"; exit 1; }; echo "$out" | show
order=$(psql -At "postgresql://$PGU@localhost:5432/$DB" -c 'SELECT migration_name FROM _prisma_migrations ORDER BY started_at' | tr '\n' ' ')
echo "   replay order: $order"
[ "$(psql -At "postgresql://$PGU@localhost:5432/$DB" -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")" = 4 ] || { echo "   FAIL: not all 4 replayed"; exit 1; }
echo "S3 PASS"
for d in $DB $SHADOW; do dropdb --if-exists "$d"; done
