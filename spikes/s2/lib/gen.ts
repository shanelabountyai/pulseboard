// Builds valid input for any action from its zod schema, via JSON Schema.
// `pick(ref, path)` supplies each id-shaped field, which is what lets the harness
// swap one field at a time to another org's row (INV-03).
import { z } from 'zod';

type J = { type?: string; format?: string; ref?: string; properties?: Record<string, J>; required?: string[];
  items?: J; enum?: unknown[]; const?: unknown; minLength?: number; minimum?: number; anyOf?: J[] };

export type Pick = (ref: string, path: string) => string;

export function generate(schema: z.ZodType, pick: Pick): { value: unknown; refPaths: string[] } {
  const refPaths: string[] = [];
  const walk = (j: J, path: string): unknown => {
    if (j.ref) { refPaths.push(path); return pick(j.ref, path); }
    if (j.const !== undefined) return j.const;
    if (j.enum) return j.enum[0];
    if (j.anyOf) return walk(j.anyOf.find((a) => a.type !== 'null') ?? j.anyOf[0]!, path);
    switch (j.type) {
      case 'object':
        return Object.fromEntries(Object.entries(j.properties ?? {}).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k)]));
      case 'array': return [walk(j.items ?? {}, `${path}[0]`)];
      case 'string':
        if (j.format === 'uuid') throw new Error(`untagged uuid at "${path}": use ref('<model>') so the harness can scope it`);
        if (j.format === 'email') return 'someone@example.test';
        return 'x'.repeat(Math.max(j.minLength ?? 1, 1));
      case 'integer': case 'number': return Math.max(j.minimum ?? 1, 1);
      case 'boolean': return true;
      default: throw new Error(`cannot generate "${path}" (${JSON.stringify(j)})`);
    }
  };
  return { value: walk(z.toJSONSchema(schema) as J, ''), refPaths };
}
