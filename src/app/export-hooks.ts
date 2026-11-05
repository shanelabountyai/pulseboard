import { moduleExportTables } from '@/app/modules';
import type { ExportTable } from '@/core/tenancy/export';

// Clone-owned (v1.6.0), like org-hooks.ts: which tables a data export holds beyond the template's core ones
// (addendum §5). Add one entry per org-owned table, selecting only columns that are safe to hand over: never a
// sealed column, token hash or recovery code (INV-34 scans the output). Every query runs inside withOrg.
//   { name: 'Booking', rows: (tx, orgId) => tx.booking.findMany({ where: { orgId }, select: { id: true, startsAt: true } }) },
export const exportTables: readonly ExportTable[] = [
  ...moduleExportTables,
  // Pulseboard (D-026): the raw data an org sent is what it owns; everything rolled up from it is rebuilt by runRollups.
  // ponytail: Event loads in one findMany; the export's 500MB guard stops a huge org, paging is the upgrade if one hits it.
  { name: 'Event', rows: (tx, orgId) => tx.event.findMany({ where: { orgId }, orderBy: { id: 'asc' }, select: { id: true, eventId: true, eventName: true, userId: true, ts: true, receivedAt: true, properties: true } }) },
  { name: 'DeadLetterEvent', rows: (tx, orgId) => tx.deadLetterEvent.findMany({ where: { orgId }, orderBy: { id: 'asc' }, select: { id: true, payload: true, reason: true, receivedAt: true } }) },
  { name: 'RegisteredProperty', rows: (tx, orgId) => tx.registeredProperty.findMany({ where: { orgId }, select: { eventName: true, prop: true } }) },
];

// An org-owned table left out on purpose, with the reason. INV-34 fails on any model with an orgId column that is in
// neither list, so a new table cannot silently drop out of every export.
export const exportSkipped: Readonly<Record<string, string>> = {
  RollupDaily: 'derived from Event; runRollups rebuilds it',
  RollupDailyProp: 'derived from Event; runRollups rebuilds it',
  RollupUserDay: 'derived from Event; runRollups rebuilds it',
  RollupWatermark: 'rollup bookkeeping (last processed receivedAt), not org data',
};
