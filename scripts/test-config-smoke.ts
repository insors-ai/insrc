#!/usr/bin/env tsx
/**
 * Smoke test for the config management framework.
 *
 * Tests:
 * 1. Frontmatter parsing (valid + edge cases)
 * 2. Path helpers (namespace inference, scope classification, entry ID)
 * 3. ConfigStore CRUD (upsert, get, list, delete)
 * 4. Deep merge utility
 *
 * Run with: npx tsx scripts/test-config-smoke.ts
 */

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}

function ok(msg: string)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  condition ? (passed++, ok(label)) : (failed++, fail(label));
  if (detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseConfigFrontmatter,
  stripFrontmatter,
} from '../src/config/frontmatter.js';

import {
  inferNamespaceFromPath,
  classifyConfigPath,
  configEntryId,
  formatScope,
  parseScope,
  globalConfigDirs,
  projectConfigDirs,
} from '../src/config/paths.js';

import { deepMerge } from '../src/config/loader.js';

// ---------------------------------------------------------------------------
// 1. Frontmatter parsing
// ---------------------------------------------------------------------------

section('Frontmatter Parsing');

const VALID_MD = `---
category: template
namespace: tester
language: typescript
name: vitest-unit
tags: [unit, vitest]
---

# Test Template

Body content here.`;

const fm = parseConfigFrontmatter(VALID_MD);
check('category parsed', fm.category === 'template', fm.category);
check('namespace parsed', fm.namespace === 'tester', fm.namespace);
check('language parsed', fm.language === 'typescript', fm.language);
check('name parsed', fm.name === 'vitest-unit', fm.name);
check('tags parsed', fm.tags.length === 2 && fm.tags[0] === 'unit' && fm.tags[1] === 'vitest',
  JSON.stringify(fm.tags));

const body = stripFrontmatter(VALID_MD);
check('body stripped', body.startsWith('# Test Template'), body.slice(0, 30));
check('body has no frontmatter', !body.includes('---'));

// Invalid frontmatter
try {
  parseConfigFrontmatter('no frontmatter here');
  fail('should throw on missing frontmatter');
  failed++;
} catch {
  ok('throws on missing frontmatter');
  passed++;
}

// Invalid category
try {
  parseConfigFrontmatter(`---
category: invalid
namespace: tester
language: typescript
name: test
tags: []
---
body`);
  fail('should throw on invalid category');
  failed++;
} catch {
  ok('throws on invalid category');
  passed++;
}

// 'all' language
const allLangMd = `---
category: convention
namespace: common
language: all
name: naming-rules
tags: [naming]
---
Rules`;

const fmAll = parseConfigFrontmatter(allLangMd);
check('language "all" parsed', fmAll.language === 'all');

// ---------------------------------------------------------------------------
// 2. Path helpers
// ---------------------------------------------------------------------------

section('Path Helpers');

// Namespace inference
check('infer tester namespace',
  inferNamespaceFromPath('/home/user/.insrc/templates/tester/vitest-unit.md') === 'tester');
check('infer common namespace (no subdir)',
  inferNamespaceFromPath('/home/user/.insrc/conventions/naming.md') === 'common');
check('infer designer namespace',
  inferNamespaceFromPath('/home/user/.insrc/feedback/designer/typescript.md') === 'designer');

// Scope classification — use actual PATHS.templates for global test
import { PATHS } from '../src/shared/paths.js';
const globalTestFile = join(PATHS.templates, 'tester', 'test.md');
const globalScope = classifyConfigPath(globalTestFile);
check('global scope detected', globalScope?.kind === 'global', `tested: ${globalTestFile}`);

const projectScope = classifyConfigPath('/home/user/my-project/.insrc/templates/tester/test.md');
check('project scope detected', projectScope?.kind === 'project');
check('project scope repoPath',
  projectScope?.kind === 'project' && projectScope.repoPath === '/home/user/my-project');

const codeFile = classifyConfigPath('/home/user/my-project/src/index.ts');
check('code file returns null', codeFile === null);

// Entry ID
const id1 = configEntryId({ kind: 'global' }, 'tester', '/home/user/.insrc/templates/tester/test.md');
const id2 = configEntryId({ kind: 'global' }, 'tester', '/home/user/.insrc/templates/tester/test.md');
const id3 = configEntryId({ kind: 'global' }, 'pair', '/home/user/.insrc/templates/tester/test.md');
check('entry ID is deterministic', id1 === id2);
check('entry ID differs by namespace', id1 !== id3);
check('entry ID is 32 chars', id1.length === 32, id1);

// Scope formatting
check('format global scope', formatScope({ kind: 'global' }) === 'global');
check('format project scope', formatScope({ kind: 'project', repoPath: '/foo' }) === 'project:/foo');
check('parse global scope', parseScope('global').kind === 'global');
const parsed = parseScope('project:/foo');
check('parse project scope', parsed.kind === 'project' && parsed.repoPath === '/foo');

// Config dirs
check('globalConfigDirs returns 3 dirs', globalConfigDirs().length === 3);
check('projectConfigDirs returns 3 dirs', projectConfigDirs('/repo').length === 3);

// ---------------------------------------------------------------------------
// 3. Deep merge
// ---------------------------------------------------------------------------

section('Deep Merge');

const base = {
  a: 1,
  b: { x: 10, y: 20 },
  c: [1, 2, 3],
  d: 'hello',
};

const override = {
  a: 2,
  b: { y: 30, z: 40 },
  c: [4, 5],
};

const merged = deepMerge(base, override);
check('primitive override', merged.a === 2);
check('nested merge preserves', (merged.b as Record<string, number>).x === 10);
check('nested merge overrides', (merged.b as Record<string, number>).y === 30);
check('nested merge adds', (merged.b as Record<string, number>).z === 40);
check('array replaces', JSON.stringify(merged.c) === '[4,5]');
check('untouched field preserved', merged.d === 'hello');

// null/undefined skipped
const merged2 = deepMerge({ a: 1, b: 2 }, { a: null, b: undefined } as Record<string, unknown>);
check('null skipped', merged2.a === 1);
check('undefined skipped', merged2.b === 2);

// ---------------------------------------------------------------------------
// 4. ConfigStore (requires LanceDB — temp dir)
// ---------------------------------------------------------------------------

section('ConfigStore CRUD');

const SANDBOX = mkdtempSync(join(tmpdir(), 'insrc-config-smoke-'));
const storePath = join(SANDBOX, 'config-store');
mkdirSync(storePath, { recursive: true });

function cleanup() {
  try { rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

try {
  const lancedb = await import('@lancedb/lancedb');
  const { ConfigStore } = await import('../src/config/store.js');

  const conn = await lancedb.connect(storePath);
  const store = new ConfigStore(conn);

  // Upsert an entry
  const entry = {
    id: 'test-entry-001',
    scope: { kind: 'global' as const },
    namespace: 'tester' as const,
    category: 'template' as const,
    language: 'typescript' as const,
    name: 'vitest-unit',
    filePath: '/home/user/.insrc/templates/tester/vitest-unit.md',
    body: 'Test template body content',
    tags: ['unit', 'vitest'],
    updatedAt: new Date().toISOString(),
    contentHash: 'abc123',
    embedding: [],
  };

  await store.upsertEntry(entry);
  ok('upsert succeeded');
  passed++;

  // Get by ID
  const fetched = await store.getEntry('test-entry-001');
  check('getEntry returns entry', fetched !== null);
  check('getEntry id matches', fetched?.id === 'test-entry-001');
  check('getEntry name matches', fetched?.name === 'vitest-unit');
  check('getEntry namespace matches', fetched?.namespace === 'tester');
  check('getEntry tags parsed', fetched?.tags.length === 2);

  // List entries
  const all = await store.listEntries();
  check('listEntries returns 1', all.length === 1);

  const byNamespace = await store.listEntries({ namespace: 'tester' });
  check('listEntries by namespace', byNamespace.length === 1);

  const byWrongNs = await store.listEntries({ namespace: 'pair' });
  check('listEntries wrong namespace', byWrongNs.length === 0);

  // Upsert second entry
  await store.upsertEntry({
    ...entry,
    id: 'test-entry-002',
    namespace: 'pair' as const,
    name: 'pair-template',
    tags: ['pair'],
  });

  const all2 = await store.listEntries();
  check('listEntries returns 2 after second upsert', all2.length === 2);

  // Delete
  await store.deleteEntry('test-entry-002');
  const all3 = await store.listEntries();
  check('delete reduces count', all3.length === 1);

  // Delete by scope
  await store.deleteByScope('global');
  const all4 = await store.listEntries();
  check('deleteByScope clears all global', all4.length === 0);

} catch (err) {
  fail(`ConfigStore test error: ${err}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Sandbox cleaned up: ${SANDBOX}${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
