// The removable modules (spec §4): everything a module owns, first entry being its directory.
// Removing one also empties the lines marked `// <module>` in core.prisma and src/app/cron-jobs.ts.
export const MODULES: Record<string, string[]> = {
  billing: [
    'src/modules/billing',
    'prisma/schema/billing.prisma',
    'src/app/api/webhooks/stripe',
    'src/app/o/[org]/settings/billing',
    'tests/invariants/inv-12-webhooks.test.ts',
    'e2e/billing.spec.ts',
  ],
  notifications: ['src/modules/notifications', 'prisma/schema/notifications.prisma', 'tests/integration/outbox.test.ts'],
};
// Files whose `// <module>` lines go with the module.
export const MARKED_FILES = ['prisma/schema/core.prisma', 'src/app/cron-jobs.ts', 'src/app/org-hooks.ts'];
