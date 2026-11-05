// The candidate core wrapper (plan S2). Guard first, then parse, then the body —
// and the schema rides on the export so the invariant harness can build input for
// any action without per-action code.
import { z } from 'zod';
import { requireOrg, type OrgCtx, type Permission } from './guards';

export type ActionSpec = { kind: 'org'; perm: Permission; schema: z.ZodType };
export type SpecdAction = ((orgSlug: string, input: unknown) => Promise<unknown>) & { spec: ActionSpec };

export function orgAction<S extends z.ZodType, R>(
  perm: Permission,
  schema: S,
  fn: (ctx: OrgCtx, input: z.infer<S>) => Promise<R>,
): SpecdAction {
  const action = async (orgSlug: string, input: unknown) => {
    const ctx = await requireOrg(orgSlug, perm);
    return fn(ctx, schema.parse(input));
  };
  return Object.assign(action, { spec: { kind: 'org' as const, perm, schema } });
}

/** An id of an org-owned row. The tag tells the harness which fixture row to use. */
export const ref = (model: string) => z.uuid().meta({ ref: model });
