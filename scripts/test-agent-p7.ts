#!/usr/bin/env tsx
/**
 * Phase 7 tests — Implement & Refactor Pipelines
 *
 * Tests cover:
 *   - Diff parser (unified diff → structured FileDiff)
 *   - Multi-file diff splitting
 *   - Diff application (hunk patching, new files)
 *   - Entity ID mapping from diff hunks
 *   - Diff extraction from LLM output
 *   - Validation context formatting
 *   - Implement pipeline exports and structure
 *   - Refactor pipeline exports and structure
 *   - Re-index handoff module
 *   - MCP reindexFile helper
 *   - Daemon index.file handler
 */

import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (err: unknown) => { failed++; console.log(`  ✗ ${name}`); console.log(`    ${err}`); },
  );
}

// ---------------------------------------------------------------------------
// 1. Diff Parser
// ---------------------------------------------------------------------------

console.log('\n── Diff Parser ──');

import {
  parseDiff, splitByFile, applyDiff, mapDiffToEntityIds,
  extractDiffFromResponse, formatDiffForValidation,
  type FileDiff, type DiffHunk, type EntityRef, type ValidationContext,
} from '../src/agent/tasks/diff-utils.js';

const SAMPLE_DIFF = `--- a/src/utils/helper.ts
+++ b/src/utils/helper.ts
@@ -1,5 +1,8 @@
 import { foo } from './foo';

-export function helper() {
-  return foo();
+export function helper(input: string) {
+  if (!input) return null;
+  return foo(input);
+}
+
+export function newHelper() {
+  return 'new';
 }`;

await test('parseDiff parses single-file diff', () => {
  const result = parseDiff(SAMPLE_DIFF);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.oldPath, 'src/utils/helper.ts');
  assert.equal(result[0]!.newPath, 'src/utils/helper.ts');
  assert.equal(result[0]!.isNew, false);
  assert.equal(result[0]!.isDelete, false);
  assert.equal(result[0]!.hunks.length, 1);
});

await test('parseDiff extracts hunk metadata', () => {
  const result = parseDiff(SAMPLE_DIFF);
  const hunk = result[0]!.hunks[0]!;
  assert.equal(hunk.oldStart, 1);
  assert.equal(hunk.oldCount, 5);
  assert.equal(hunk.newStart, 1);
  assert.equal(hunk.newCount, 8);
  assert.ok(hunk.lines.length > 0);
});

await test('parseDiff extracts hunk lines with prefixes', () => {
  const result = parseDiff(SAMPLE_DIFF);
  const lines = result[0]!.hunks[0]!.lines;
  const added = lines.filter(l => l.startsWith('+'));
  const removed = lines.filter(l => l.startsWith('-'));
  const context = lines.filter(l => l.startsWith(' '));
  assert.ok(added.length > 0, 'should have added lines');
  assert.ok(removed.length > 0, 'should have removed lines');
  assert.ok(context.length > 0, 'should have context lines');
});

const MULTI_FILE_DIFF = `--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line1
+added
 line2
 line3
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,3 +5,3 @@
 old
-removed
+replaced
 after`;

await test('parseDiff parses multi-file diff', () => {
  const result = parseDiff(MULTI_FILE_DIFF);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.oldPath, 'src/a.ts');
  assert.equal(result[1]!.oldPath, 'src/b.ts');
});

await test('parseDiff handles new file (--- /dev/null)', () => {
  const newFileDiff = `--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function brand() {
+  return 'new';
+}`;
  const result = parseDiff(newFileDiff);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.isNew, true);
  assert.equal(result[0]!.newPath, 'src/new.ts');
});

// ---------------------------------------------------------------------------
// 2. Multi-file splitting
// ---------------------------------------------------------------------------

console.log('\n── Multi-file Splitting ──');

await test('splitByFile creates one round per file', () => {
  const diffs = parseDiff(MULTI_FILE_DIFF);
  const rounds = splitByFile(diffs);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0]!.length, 1);
  assert.equal(rounds[1]!.length, 1);
  assert.equal(rounds[0]![0]!.oldPath, 'src/a.ts');
  assert.equal(rounds[1]![0]!.oldPath, 'src/b.ts');
});

await test('splitByFile handles single-file diff', () => {
  const diffs = parseDiff(SAMPLE_DIFF);
  const rounds = splitByFile(diffs);
  assert.equal(rounds.length, 1);
});

// ---------------------------------------------------------------------------
// 3. Diff Application
// ---------------------------------------------------------------------------

console.log('\n── Diff Application ──');

const TEST_DIR = join(tmpdir(), `insrc-test-p7-${randomUUID().slice(0, 8)}`);

await test('applyDiff applies simple hunk to existing file', async () => {
  const dir = join(TEST_DIR, 'apply-simple');
  await mkdir(dir, { recursive: true });

  // Create the original file
  const filePath = join(dir, 'src', 'hello.ts');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');

  const diff = `--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,3 +1,4 @@
 line1
+inserted
 line2
 line3`;

  const diffs = parseDiff(diff);
  const result = await applyDiff(diffs, dir, false);
  assert.equal(result.success, true);
  assert.equal(result.filesWritten.length, 1);

  const content = await readFile(filePath, 'utf-8');
  assert.ok(content.includes('inserted'), 'file should contain inserted line');
});

await test('applyDiff creates new file from /dev/null diff', async () => {
  const dir = join(TEST_DIR, 'apply-new');
  await mkdir(dir, { recursive: true });

  const diff = `--- /dev/null
+++ b/src/brand-new.ts
@@ -0,0 +1,3 @@
+export const x = 1;
+export const y = 2;
+export const z = 3;`;

  const diffs = parseDiff(diff);
  const result = await applyDiff(diffs, dir, false);
  assert.equal(result.success, true);

  const content = await readFile(join(dir, 'src', 'brand-new.ts'), 'utf-8');
  assert.ok(content.includes('export const x = 1;'));
  assert.ok(content.includes('export const z = 3;'));
});

await test('applyDiff dry-run does not write files', async () => {
  const dir = join(TEST_DIR, 'apply-dryrun');
  await mkdir(dir, { recursive: true });

  const diff = `--- /dev/null
+++ b/should-not-exist.ts
@@ -0,0 +1,1 @@
+nope`;

  const diffs = parseDiff(diff);
  const result = await applyDiff(diffs, dir, true);
  assert.equal(result.success, true);
  assert.equal(result.filesWritten.length, 1);

  // File should NOT actually exist
  try {
    await readFile(join(dir, 'should-not-exist.ts'), 'utf-8');
    assert.fail('file should not exist in dry-run mode');
  } catch (err: unknown) {
    assert.ok((err as NodeJS.ErrnoException).code === 'ENOENT');
  }
});

await test('applyDiff reports error for file deletion', async () => {
  const diff = `--- a/src/to-delete.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`;

  const diffs = parseDiff(diff);
  const result = await applyDiff(diffs, TEST_DIR, false);
  assert.equal(result.success, false);
  assert.ok(result.errors.size > 0);
});

// ---------------------------------------------------------------------------
// 4. Entity ID Mapping
// ---------------------------------------------------------------------------

console.log('\n── Entity ID Mapping ──');

await test('mapDiffToEntityIds maps hunk to overlapping entity', () => {
  const diffs = parseDiff(SAMPLE_DIFF);
  const entities: EntityRef[] = [
    { id: 'e1', kind: 'function', name: 'helper', file: 'src/utils/helper.ts', startLine: 3, endLine: 5 },
    { id: 'e2', kind: 'function', name: 'unrelated', file: 'src/other.ts', startLine: 1, endLine: 10 },
  ];
  const ids = mapDiffToEntityIds(diffs, entities);
  assert.ok(ids.includes('e1'), 'should include overlapping entity');
  assert.ok(!ids.includes('e2'), 'should not include entity in different file');
});

await test('mapDiffToEntityIds handles no overlap', () => {
  const diffs = parseDiff(SAMPLE_DIFF);
  const entities: EntityRef[] = [
    { id: 'e3', kind: 'function', name: 'far', file: 'src/utils/helper.ts', startLine: 100, endLine: 110 },
  ];
  const ids = mapDiffToEntityIds(diffs, entities);
  assert.equal(ids.length, 0);
});

await test('mapDiffToEntityIds deduplicates entity IDs', () => {
  // Two hunks in same file overlapping the same entity
  const diff = `--- a/src/a.ts
+++ b/src/a.ts
@@ -2,3 +2,4 @@
 line2
+added1
 line3
 line4
@@ -8,3 +9,4 @@
 line8
+added2
 line9
 line10`;

  const diffs = parseDiff(diff);
  const entities: EntityRef[] = [
    { id: 'e4', kind: 'class', name: 'Foo', file: 'src/a.ts', startLine: 1, endLine: 15 },
  ];
  const ids = mapDiffToEntityIds(diffs, entities);
  assert.equal(ids.length, 1, 'should deduplicate');
  assert.equal(ids[0], 'e4');
});

// ---------------------------------------------------------------------------
// 5. Diff Extraction from LLM Output
// ---------------------------------------------------------------------------

console.log('\n── Diff Extraction ──');

await test('extractDiffFromResponse extracts from code fence', () => {
  const input = 'Here is my diff:\n```diff\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n```\nDone.';
  const result = extractDiffFromResponse(input);
  assert.ok(result.includes('--- a/foo.ts'));
  assert.ok(result.includes('+new'));
  assert.ok(!result.includes('Here is'));
  assert.ok(!result.includes('Done.'));
});

await test('extractDiffFromResponse extracts from plain text', () => {
  const input = 'Some explanation.\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,1 +1,1 @@\n-old\n+new';
  const result = extractDiffFromResponse(input);
  assert.ok(result.startsWith('--- a/foo.ts'));
});

await test('extractDiffFromResponse handles no-fence raw diff', () => {
  const input = '--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-a\n+b';
  const result = extractDiffFromResponse(input);
  assert.equal(result, input);
});

// ---------------------------------------------------------------------------
// 6. Validation Context Formatting
// ---------------------------------------------------------------------------

console.log('\n── Validation Context Formatting ──');

await test('formatDiffForValidation includes diff section', () => {
  const ctx: ValidationContext = {
    diff: '--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
    touchedEntities: [],
    neighbourSignatures: [],
    referencedTypes: [],
  };
  const formatted = formatDiffForValidation(ctx);
  assert.ok(formatted.includes('## Diff to validate'));
  assert.ok(formatted.includes('--- a/x.ts'));
});

await test('formatDiffForValidation includes touched entities', () => {
  const ctx: ValidationContext = {
    diff: '...',
    touchedEntities: [{ name: 'helper', kind: 'function', body: 'function helper() {}' }],
    neighbourSignatures: [],
    referencedTypes: [],
  };
  const formatted = formatDiffForValidation(ctx);
  assert.ok(formatted.includes('## Entities touched'));
  assert.ok(formatted.includes('function: helper'));
});

await test('formatDiffForValidation includes neighbour signatures', () => {
  const ctx: ValidationContext = {
    diff: '...',
    touchedEntities: [],
    neighbourSignatures: ['function foo(): void', 'function bar(x: number): string'],
    referencedTypes: [],
  };
  const formatted = formatDiffForValidation(ctx);
  assert.ok(formatted.includes('## Neighbour signatures'));
  assert.ok(formatted.includes('function foo(): void'));
});

await test('formatDiffForValidation includes referenced types', () => {
  const ctx: ValidationContext = {
    diff: '...',
    touchedEntities: [],
    neighbourSignatures: [],
    referencedTypes: ['interface User { name: string; }'],
  };
  const formatted = formatDiffForValidation(ctx);
  assert.ok(formatted.includes('## Referenced types'));
  assert.ok(formatted.includes('interface User'));
});

// ---------------------------------------------------------------------------
// 7. Implement Pipeline — exports and structure
// ---------------------------------------------------------------------------

console.log('\n── Implement Pipeline ──');

import { runImplementPipeline, type ImplementResult } from '../src/agent/tasks/implement.js';

await test('runImplementPipeline is exported as async function', () => {
  assert.equal(typeof runImplementPipeline, 'function');
});

await test('ImplementResult type shape has required fields', () => {
  const result: ImplementResult = {
    accepted: true,
    diff: '--- a/x.ts\n+++ b/x.ts',
    filesWritten: ['/tmp/x.ts'],
    feedback: '',
    retries: 0,
    needsUserDecision: false,
  };
  assert.equal(result.accepted, true);
  assert.equal(result.retries, 0);
  assert.equal(result.needsUserDecision, false);
});

await test('ImplementResult can represent exhausted retries', () => {
  const result: ImplementResult = {
    accepted: false,
    diff: '...',
    filesWritten: [],
    feedback: 'Line 15: missing null check',
    retries: 2,
    needsUserDecision: true,
  };
  assert.equal(result.accepted, false);
  assert.equal(result.needsUserDecision, true);
  assert.ok(result.feedback.length > 0);
});

// ---------------------------------------------------------------------------
// 8. Refactor Pipeline — exports and differences
// ---------------------------------------------------------------------------

console.log('\n── Refactor Pipeline ──');

import { runRefactorPipeline, type RefactorResult } from '../src/agent/tasks/refactor.js';

await test('runRefactorPipeline is exported as async function', () => {
  assert.equal(typeof runRefactorPipeline, 'function');
});

await test('RefactorResult type shape has required fields', () => {
  const result: RefactorResult = {
    accepted: true,
    diff: '...',
    filesWritten: ['/tmp/a.ts', '/tmp/b.ts'],
    feedback: '',
    retries: 1,
    needsUserDecision: false,
  };
  assert.equal(result.accepted, true);
  assert.equal(result.filesWritten.length, 2);
});

// ---------------------------------------------------------------------------
// 9. Re-index Handoff
// ---------------------------------------------------------------------------

console.log('\n── Re-index Handoff ──');

import { requestReindex } from '../src/agent/tasks/reindex.js';

await test('requestReindex is exported as async function', () => {
  assert.equal(typeof requestReindex, 'function');
});

await test('requestReindex handles empty file list gracefully', async () => {
  // Should not throw or log anything for empty list
  const logs: string[] = [];
  await requestReindex([], (msg) => logs.push(msg));
  assert.equal(logs.length, 0);
});

// ---------------------------------------------------------------------------
// 10. MCP reindexFile helper
// ---------------------------------------------------------------------------

console.log('\n── MCP reindexFile Helper ──');

import { reindexFile } from '../src/agent/tools/mcp-client.js';

await test('reindexFile is exported as async function', () => {
  assert.equal(typeof reindexFile, 'function');
});

await test('reindexFile handles daemon-down gracefully', async () => {
  // Should not throw when daemon is unreachable
  await reindexFile('/nonexistent/file.ts');
  // If we got here without throwing, it passed
  assert.ok(true);
});

// ---------------------------------------------------------------------------
// 11. Diff parser edge cases
// ---------------------------------------------------------------------------

console.log('\n── Diff Parser Edge Cases ──');

await test('parseDiff handles hunk with single-line count (no comma)', () => {
  const diff = `--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-old
+new`;
  const result = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.hunks[0]!.oldCount, 1);
  assert.equal(result[0]!.hunks[0]!.newCount, 1);
});

await test('parseDiff handles multiple hunks in one file', () => {
  const diff = `--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,3 @@
 a
-b
+B
 c
@@ -10,3 +10,3 @@
 j
-k
+K
 l`;
  const result = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.hunks.length, 2);
  assert.equal(result[0]!.hunks[0]!.oldStart, 1);
  assert.equal(result[0]!.hunks[1]!.oldStart, 10);
});

await test('parseDiff returns empty array for non-diff text', () => {
  const result = parseDiff('This is just regular text with no diff content.');
  assert.equal(result.length, 0);
});

await test('parseDiff strips a/ and b/ prefixes from paths', () => {
  const diff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,1 @@
-old
+new`;
  const result = parseDiff(diff);
  assert.equal(result[0]!.oldPath, 'src/foo.ts');
  assert.equal(result[0]!.newPath, 'src/foo.ts');
});

// ---------------------------------------------------------------------------
// 12. Agent REPL wiring — implement/refactor in pipeline intents list
// ---------------------------------------------------------------------------

console.log('\n── Agent REPL Wiring ──');

import { readFile as readFileNode } from 'node:fs/promises';

await test('agent index.ts imports runImplementPipeline', async () => {
  const src = await readFileNode(new URL('../src/agent/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("import { runImplementPipeline }"), 'should import runImplementPipeline');
});

await test('agent index.ts imports runRefactorPipeline', async () => {
  const src = await readFileNode(new URL('../src/agent/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("import { runRefactorPipeline }"), 'should import runRefactorPipeline');
});

await test('agent index.ts includes implement in pipeline intents list', async () => {
  const src = await readFileNode(new URL('../src/agent/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("'implement'"), 'should include implement intent');
  assert.ok(src.includes("'refactor'"), 'should include refactor intent');
});

await test('agent index.ts handles implement intent in handlePipelineIntent', async () => {
  const src = await readFileNode(new URL('../src/agent/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("intent === 'implement'"), 'should handle implement intent');
});

await test('agent index.ts handles refactor intent in handlePipelineIntent', async () => {
  const src = await readFileNode(new URL('../src/agent/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("intent === 'refactor'"), 'should handle refactor intent');
});

// ---------------------------------------------------------------------------
// 13. Daemon index.file handler
// ---------------------------------------------------------------------------

console.log('\n── Daemon index.file Handler ──');

await test('daemon index.ts has index.file RPC handler', async () => {
  const src = await readFileNode(new URL('../src/daemon/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("'index.file'"), 'should have index.file handler');
  assert.ok(src.includes("queue.enqueue"), 'handler should enqueue job');
});

// ---------------------------------------------------------------------------
// 14. Graph context assembly module
// ---------------------------------------------------------------------------

console.log('\n── Graph Context Assembly ──');

import { enrichValidationContext, assembleStructuredContext } from '../src/agent/tasks/graph-context.js';

await test('enrichValidationContext is exported as async function', () => {
  assert.equal(typeof enrichValidationContext, 'function');
});

await test('assembleStructuredContext is exported as async function', () => {
  assert.equal(typeof assembleStructuredContext, 'function');
});

await test('assembleStructuredContext returns structured text for implement (1-hop)', async () => {
  const result = await assembleStructuredContext('some code context', '/tmp/repo', 1);
  assert.ok(result.text.includes('Code context'));
  assert.ok(result.text.includes('direct callers/callees'));
  assert.ok(!result.text.includes('2-hop'));
});

await test('assembleStructuredContext returns structured text for refactor (2-hop)', async () => {
  const result = await assembleStructuredContext('some code context', '/tmp/repo', 2);
  assert.ok(result.text.includes('Code context'));
  assert.ok(result.text.includes('2-hop callers'));
});

await test('assembleStructuredContext handles empty context', async () => {
  const result = await assembleStructuredContext('', '/tmp/repo', 1);
  assert.equal(result.text, '');
});

await test('enrichValidationContext handles empty diffs gracefully', async () => {
  const result = await enrichValidationContext([], '');
  assert.equal(result.diff, '');
  assert.equal(result.touchedEntities.length, 0);
  assert.equal(result.neighbourSignatures.length, 0);
  assert.equal(result.referencedTypes.length, 0);
});

// ---------------------------------------------------------------------------
// 15. MCP graph helpers
// ---------------------------------------------------------------------------

console.log('\n── MCP Graph Helpers ──');

import { searchByFile, searchCallersNhop, searchCallees as searchCalleesHelper } from '../src/agent/tools/mcp-client.js';

await test('searchByFile is exported as async function', () => {
  assert.equal(typeof searchByFile, 'function');
});

await test('searchCallersNhop is exported as async function', () => {
  assert.equal(typeof searchCallersNhop, 'function');
});

await test('searchCallees is exported as async function', () => {
  assert.equal(typeof searchCalleesHelper, 'function');
});

await test('searchByFile handles daemon-down gracefully', async () => {
  const result = await searchByFile('/nonexistent/file.ts');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

await test('searchCallersNhop handles daemon-down gracefully', async () => {
  const result = await searchCallersNhop('nonexistent-id', 2);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

// ---------------------------------------------------------------------------
// 16. Daemon new RPC handlers
// ---------------------------------------------------------------------------

console.log('\n── Daemon Graph Endpoints ──');

await test('daemon has search.by_file handler', async () => {
  const src = await readFileNode(new URL('../src/daemon/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("'search.by_file'"), 'should have search.by_file handler');
});

await test('daemon has search.callers_nhop handler', async () => {
  const src = await readFileNode(new URL('../src/daemon/index.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("'search.callers_nhop'"), 'should have search.callers_nhop handler');
});

// ---------------------------------------------------------------------------
// 17. plan_next_step in tool registry
// ---------------------------------------------------------------------------

console.log('\n── plan_next_step Tool Registry ──');

await test('tool registry includes plan_next_step', async () => {
  const src = await readFileNode(new URL('../src/agent/tools/registry.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes("name: 'plan_next_step'"), 'should have plan_next_step tool');
  assert.ok(src.includes("planId"), 'plan_next_step should take planId param');
});

// ---------------------------------------------------------------------------
// 18. implement.ts no longer re-exports internals
// ---------------------------------------------------------------------------

console.log('\n── Dead Re-export Removal ──');

await test('implement.ts does not re-export VALIDATE_SYSTEM', async () => {
  const src = await readFileNode(new URL('../src/agent/tasks/implement.ts', import.meta.url), 'utf-8');
  assert.ok(!src.includes('export { VALIDATE_SYSTEM'), 'should not re-export VALIDATE_SYSTEM');
});

await test('implement.ts imports enrichValidationContext', async () => {
  const src = await readFileNode(new URL('../src/agent/tasks/implement.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes('enrichValidationContext'), 'should import enrichValidationContext');
});

await test('refactor.ts imports enrichValidationContext', async () => {
  const src = await readFileNode(new URL('../src/agent/tasks/refactor.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes('enrichValidationContext'), 'should import enrichValidationContext');
});

await test('refactor.ts uses assembleStructuredContext with 2-hop', async () => {
  const src = await readFileNode(new URL('../src/agent/tasks/refactor.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes('assembleStructuredContext(codeContext, repoPath, 2)'), 'should pass 2 hops');
});

await test('implement.ts uses assembleStructuredContext with 1-hop', async () => {
  const src = await readFileNode(new URL('../src/agent/tasks/implement.ts', import.meta.url), 'utf-8');
  assert.ok(src.includes('assembleStructuredContext(codeContext, repoPath, 1)'), 'should pass 1 hop');
});

// ---------------------------------------------------------------------------
// Cleanup temp dir
// ---------------------------------------------------------------------------

try {
  await rm(TEST_DIR, { recursive: true, force: true });
} catch { /* ignore cleanup errors */ }

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'═'.repeat(50)}`);
console.log(`Phase 7 tests: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
