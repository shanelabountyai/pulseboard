#!/usr/bin/env bash
# Spike S2: vitest imports 'use server' modules and drives them with next/* mocked.
# Uses a throwaway local database, dropped at the end.
set -eu
cd "$(dirname "$0")"
DB=saas_foundation_s2
export DATABASE_URL="postgresql://${PGUSER:-$USER}@localhost:5432/$DB?connection_limit=10&pool_timeout=20"
dropdb --if-exists "$DB"; createdb "$DB"
npx prisma generate --config prisma.config.ts >/dev/null
npx prisma db push --config prisma.config.ts >/dev/null
rc=0; npx vitest run --config vitest.config.ts || rc=$?
dropdb --if-exists "$DB"
exit $rc
