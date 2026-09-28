import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

// Plan §3.1: run once in a fresh clone. `npm run new-project -- <name> <port>`, or answer the prompts.
// Rewrites only clone-owned files. FOUNDATION_VERSION is left alone: it records the release this clone
// started from, and foundation:drift diffs against it.
const TEMPLATE_PORT = '4100';

// FR-11: a second run corrupts the README banner and leaves scripts on the first port. Once package.json's
// name is no longer "saas-foundation", this clone has already been through new-project once.
export function rewrite(files: { pkg: string; playwright: string; ci: string; readme: string }, name: string, port: string, version: string) {
  const pkg = JSON.parse(files.pkg) as { name: string; scripts: Record<string, string> };
  if (pkg.name !== 'saas-foundation') throw new Error(`package.json name is already "${pkg.name}" — new-project has already run here; a second run corrupts the README banner and stale scripts.`);
  pkg.name = name;
  for (const k of Object.keys(pkg.scripts)) {
    if (k === 'dev:template' || k === 'predev:template') delete pkg.scripts[k];
    else pkg.scripts[k] = pkg.scripts[k]!.replaceAll('__PORT__', port).replaceAll(TEMPLATE_PORT, port);
  }
  return {
    pkg: `${JSON.stringify(pkg, null, 2)}\n`,
    playwright: files.playwright.replaceAll(TEMPLATE_PORT, port),
    ci: files.ci.replaceAll(TEMPLATE_PORT, port).replaceAll('saas_foundation', name.replaceAll('-', '_')),
    readme: `# ${name}\n\n> Cloned from saas-foundation ${version}. Port ${port}. Upgrade with \`npm run foundation:status\`; template-owned paths are listed in the template's plan §3.2.\n\n${files.readme.replace(/^# .*\n+/, '')}`,
  };
}

// FR-11: refuse a port already claimed in the port table, not just the template's own 4100. Best-effort —
// a port is claimed if its table row's status is "in use" or "reserved"; "free" (the next one to take) is not.
export function portInUse(claudeMd: string, port: string): boolean {
  return new RegExp(`\\|\\s*\\*\\*${port}\\*\\*\\s*\\|\\s*(in use|reserved)\\b`).test(claudeMd);
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const name = process.argv[2] ?? (await rl.question('Project name (kebab-case): ')).trim();
  const port = process.argv[3] ?? (await rl.question('Port (next free hundred in ~/.claude/CLAUDE.md): ')).trim();
  rl.close();
  if (!/^[a-z][a-z0-9-]*$/.test(name) || name === 'saas-foundation') throw new Error('Name must be kebab-case and not "saas-foundation".');
  if (!/^\d{4,5}$/.test(port) || port === TEMPLATE_PORT) throw new Error(`Port must be 4-5 digits and not ${TEMPLATE_PORT} (the template's).`);
  try {
    const claudeMd = readFileSync(join(homedir(), '.claude', 'CLAUDE.md'), 'utf8');
    if (portInUse(claudeMd, port)) throw new Error(`Port ${port} is already claimed in ~/.claude/CLAUDE.md's port table. Pick the next free one.`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Port ')) throw e; // the claim, not a missing/unreadable file
  }

  const read = (f: string) => readFileSync(f, 'utf8');
  const out = rewrite(
    { pkg: read('package.json'), playwright: read('playwright.config.ts'), ci: read('.github/workflows/ci.yml'), readme: read('README.md') },
    name, port, read('FOUNDATION_VERSION').trim(),
  );
  writeFileSync('package.json', out.pkg);
  writeFileSync('playwright.config.ts', out.playwright);
  writeFileSync('.github/workflows/ci.yml', out.ci);
  writeFileSync('README.md', out.readme);
  console.log(`Rewrote package.json, playwright.config.ts, ci.yml and README.md for ${name} on :${port}.

Still to do by hand:
  [ ] ~/.claude/CLAUDE.md: add the port-table row (${name} -> ${port}) in this commit
  [ ] Neon project: pooled URL for DATABASE_URL, unpooled for DIRECT_URL (deployed environments only)
  [ ] Vercel project (Root Directory "."; the ignoreCommand in vercel.json is already set)
  [ ] Private GitHub repo, then: git remote add origin <url>
  [ ] Before the first push: git ls-files | grep -iE "\\.env|secret|credential|\\.pem$|\\.key$"  (only .env.example may appear)
  [ ] Add this clone's row to the template's CLONES.md
Then: npm run db:setup && npm run seed:demo && npm run dev`);
}

if (process.argv[1]?.endsWith('new-project.ts')) await main();
