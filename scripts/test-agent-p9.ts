#!/usr/bin/env tsx
/**
 * Phase 9 tests — Review, Document, Research & Graph Pipelines
 *
 * Tests cover:
 *   - Search provider: interface, factory, Brave provider, Claude fallback, formatting
 *   - Graph handler: query classification, entity extraction, formatting helpers
 *   - Research pipeline: source selection, exports, result shape
 *   - Review pipeline: context assembly helpers, exports, result shape
 *   - Document pipeline: doc type detection, comment style extraction, exports
 *   - Agent REPL wiring: imports, intents list, handlers
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

// ===========================================================================
// 1. Search Provider
// ===========================================================================

console.log('\n── Search Provider ──');

import {
  BraveSearchProvider, ClaudeWebSearchProvider,
  createSearchProvider, formatSearchResults,
  type SearchProvider, type SearchResult,
} from '../src/agent/search/provider.js';

await test('BraveSearchProvider implements SearchProvider interface', () => {
  const provider = new BraveSearchProvider('test-key');
  assert.equal(provider.name, 'brave');
  assert.equal(typeof provider.search, 'function');
});

await test('ClaudeWebSearchProvider implements SearchProvider interface', () => {
  const mockProvider = {
    complete: async () => ({ text: '[]', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const provider = new ClaudeWebSearchProvider(mockProvider);
  assert.equal(provider.name, 'claude');
  assert.equal(typeof provider.search, 'function');
});

await test('createSearchProvider returns BraveSearchProvider when key present', () => {
  const provider = createSearchProvider('test-key', null);
  assert.ok(provider !== null);
  assert.equal(provider!.name, 'brave');
});

await test('createSearchProvider returns ClaudeWebSearchProvider when no Brave key', () => {
  const mockClaude = {
    complete: async () => ({ text: '[]', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const provider = createSearchProvider(undefined, mockClaude);
  assert.ok(provider !== null);
  assert.equal(provider!.name, 'claude');
});

await test('createSearchProvider returns null when neither available', () => {
  const provider = createSearchProvider(undefined, null);
  assert.equal(provider, null);
});

await test('formatSearchResults formats results correctly', () => {
  const results: SearchResult[] = [
    { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
    { title: 'Result 2', url: 'https://example.com/2', snippet: 'Second result' },
  ];
  const formatted = formatSearchResults(results);
  assert.ok(formatted.includes('[1] Result 1'));
  assert.ok(formatted.includes('[2] Result 2'));
  assert.ok(formatted.includes('https://example.com/1'));
  assert.ok(formatted.includes('First result'));
});

await test('formatSearchResults returns message for empty results', () => {
  const formatted = formatSearchResults([]);
  assert.ok(formatted.includes('No search results'));
});

// ===========================================================================
// 2. Graph Handler — Query Classification
// ===========================================================================

console.log('\n── Graph Handler: Query Classification ──');

import {
  classifyGraphQuery, runGraphQuery,
  type GraphResult, type GraphQueryType,
} from '../src/agent/tasks/graph.js';

await test('classifies "who calls X" as callers', () => {
  const result = classifyGraphQuery('who calls PaymentService.charge?');
  assert.equal(result.type, 'callers');
  assert.equal(result.entityName, 'PaymentService.charge');
});

await test('classifies "what calls X" as callers', () => {
  const result = classifyGraphQuery('what calls handleCheckout');
  assert.equal(result.type, 'callers');
  assert.ok(result.entityName.includes('handleCheckout'));
});

await test('classifies "callers of X" as callers', () => {
  const result = classifyGraphQuery('callers of processJob');
  assert.equal(result.type, 'callers');
  assert.ok(result.entityName.includes('processJob'));
});

await test('classifies "what does X call" as callees', () => {
  const result = classifyGraphQuery('what does IndexerService call?');
  assert.equal(result.type, 'callees');
  assert.ok(result.entityName.includes('IndexerService'));
});

await test('classifies "callees of X" as callees', () => {
  const result = classifyGraphQuery('callees of processFile');
  assert.equal(result.type, 'callees');
  assert.ok(result.entityName.includes('processFile'));
});

await test('classifies "what depends on X" as depends_on', () => {
  const result = classifyGraphQuery('what depends on EntityService?');
  assert.equal(result.type, 'depends_on');
  assert.ok(result.entityName.includes('EntityService'));
  assert.ok(result.hops >= 3); // higher hops for dependency closure
});

await test('classifies "dependencies of X" as depends_on', () => {
  const result = classifyGraphQuery('dependencies of IndexerService');
  assert.equal(result.type, 'depends_on');
});

await test('classifies "find X" as search', () => {
  const result = classifyGraphQuery('find embedEntities');
  assert.equal(result.type, 'search');
  assert.ok(result.entityName.includes('embedEntities'));
});

await test('classifies "search for X" as search', () => {
  const result = classifyGraphQuery('search for PaymentHandler');
  assert.equal(result.type, 'search');
});

await test('classifies "show X" as entity', () => {
  const result = classifyGraphQuery('show IndexerService');
  assert.equal(result.type, 'entity');
  assert.ok(result.entityName.includes('IndexerService'));
});

await test('classifies "what is X" as entity', () => {
  const result = classifyGraphQuery('what is processJob');
  assert.equal(result.type, 'entity');
});

await test('classifies raw Cypher as query', () => {
  const result = classifyGraphQuery('query MATCH (n:Entity) RETURN n LIMIT 5');
  assert.equal(result.type, 'query');
  assert.ok(result.entityName.includes('MATCH'));
});

await test('classifies MATCH prefix as query', () => {
  const result = classifyGraphQuery('MATCH (n) RETURN n');
  assert.equal(result.type, 'query');
});

await test('classifies "why does X" as interpretive', () => {
  const result = classifyGraphQuery('why does X call Y?');
  assert.equal(result.type, 'interpretive');
});

await test('classifies "explain" questions as interpretive', () => {
  const result = classifyGraphQuery('explain the reason for this dependency');
  assert.equal(result.type, 'interpretive');
});

await test('classifies "is this intentional" as interpretive', () => {
  const result = classifyGraphQuery('is this dependency intentional?');
  assert.equal(result.type, 'interpretive');
});

await test('classifies entity-like names as search fallback', () => {
  const result = classifyGraphQuery('PaymentService.charge');
  assert.equal(result.type, 'search');
  assert.ok(result.entityName.includes('PaymentService'));
});

await test('strips quotes from entity names', () => {
  const result = classifyGraphQuery('who calls "processJob"?');
  assert.equal(result.type, 'callers');
  assert.equal(result.entityName, 'processJob');
});

// ===========================================================================
// 3. Graph Handler — Exports
// ===========================================================================

console.log('\n── Graph Handler: Exports ──');

await test('runGraphQuery is exported as function', () => {
  assert.equal(typeof runGraphQuery, 'function');
});

await test('GraphResult type has correct shape via classifyGraphQuery', () => {
  const match = classifyGraphQuery('find foo');
  assert.ok('type' in match);
  assert.ok('entityName' in match);
  assert.ok('hops' in match);
});

// ===========================================================================
// 4. Research Pipeline — Source Selection
// ===========================================================================

console.log('\n── Research Pipeline: Source Selection ──');

import {
  selectResearchSource, runResearchPipeline,
  type ResearchResult, type ResearchSource,
} from '../src/agent/tasks/research.js';

await test('selects graph for "who calls embedEntities"', () => {
  assert.equal(selectResearchSource('who calls embedEntities?'), 'graph');
});

await test('selects graph for "how does this function work"', () => {
  assert.equal(selectResearchSource('how does this function work?'), 'graph');
});

await test('selects graph for "what calls this method in this repo"', () => {
  assert.equal(selectResearchSource('what calls this method in this repo?'), 'graph');
});

await test('selects web for "documentation for LanceDB"', () => {
  assert.equal(selectResearchSource('documentation for LanceDB'), 'web');
});

await test('selects web for "known issue with kuzu"', () => {
  assert.equal(selectResearchSource('is there a known issue with kuzu?'), 'web');
});

await test('selects web for "how to use tree-sitter library"', () => {
  assert.equal(selectResearchSource('how to use tree-sitter library?'), 'web');
});

await test('selects web for "changelog of npm package"', () => {
  assert.equal(selectResearchSource('changelog of this npm package?'), 'web');
});

await test('selects combined for "integrate OpenTelemetry"', () => {
  assert.equal(selectResearchSource('how do I integrate OpenTelemetry into this codebase?'), 'combined');
});

await test('defaults to graph for ambiguous questions', () => {
  const source = selectResearchSource('how is the indexer configured?');
  assert.equal(source, 'graph');
});

// ===========================================================================
// 5. Research Pipeline — Exports
// ===========================================================================

console.log('\n── Research Pipeline: Exports ──');

await test('runResearchPipeline is exported as function', () => {
  assert.equal(typeof runResearchPipeline, 'function');
});

await test('selectResearchSource is exported as function', () => {
  assert.equal(typeof selectResearchSource, 'function');
});

// ===========================================================================
// 6. Review Pipeline — Exports and Helpers
// ===========================================================================

console.log('\n── Review Pipeline ──');

import {
  runReviewPipeline, assembleReviewContext, assembleEntityReviewContext,
  type ReviewResult,
} from '../src/agent/tasks/review.js';

await test('runReviewPipeline is exported as function', () => {
  assert.equal(typeof runReviewPipeline, 'function');
});

await test('assembleReviewContext is exported as function', () => {
  assert.equal(typeof assembleReviewContext, 'function');
});

await test('assembleEntityReviewContext is exported as function', () => {
  assert.equal(typeof assembleEntityReviewContext, 'function');
});

await test('assembleReviewContext extracts file paths from diff', async () => {
  const diff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 import { bar } from './bar';
+import { baz } from './baz';
 export function foo() {}`;

  // This will try to call MCP which isn't running, but tests the extraction logic
  const ctx = await assembleReviewContext(diff, '');
  assert.equal(ctx.primaryContent, diff);
  // touchedEntities will be empty since daemon isn't running
  assert.ok(Array.isArray(ctx.touchedEntities));
  assert.ok(Array.isArray(ctx.neighbourSignatures));
});

// ===========================================================================
// 7. Document Pipeline — Doc Type Detection
// ===========================================================================

console.log('\n── Document Pipeline: Doc Type Detection ──');

import {
  detectDocType, isCrossCuttingDoc, extractCommentStyle,
  runDocumentPipeline,
  type DocumentResult, type DocType,
} from '../src/agent/tasks/document.js';

await test('detects inline docstring type', () => {
  assert.equal(detectDocType('add a docstring to processJob'), 'inline');
});

await test('detects module README type', () => {
  assert.equal(detectDocType('generate module documentation'), 'module');
});

await test('detects API documentation type', () => {
  assert.equal(detectDocType('document the public API'), 'api');
});

await test('detects ADR type', () => {
  assert.equal(detectDocType('write an ADR for the caching decision'), 'adr');
});

await test('detects changelog type', () => {
  assert.equal(detectDocType('generate a changelog entry'), 'changelog');
});

await test('defaults to inline for unspecified type', () => {
  assert.equal(detectDocType('document this function'), 'inline');
});

await test('ADR is cross-cutting', () => {
  assert.equal(isCrossCuttingDoc('adr'), true);
});

await test('changelog is cross-cutting', () => {
  assert.equal(isCrossCuttingDoc('changelog'), true);
});

await test('inline is not cross-cutting', () => {
  assert.equal(isCrossCuttingDoc('inline'), false);
});

await test('module is not cross-cutting', () => {
  assert.equal(isCrossCuttingDoc('module'), false);
});

// ===========================================================================
// 8. Document Pipeline — Comment Style Extraction
// ===========================================================================

console.log('\n── Document Pipeline: Comment Style ──');

await test('extracts JSDoc comment style', () => {
  const code = `/** This is a JSDoc comment.\n * @param x number\n */\nfunction foo(x: number) {}`;
  const style = extractCommentStyle(code);
  assert.ok(style !== null);
  assert.ok(style!.includes('/**'));
  assert.ok(style!.includes('*/'));
});

await test('extracts Python docstring style', () => {
  const code = `"""This is a docstring.\nWith multiple lines.\n"""\ndef foo(): pass`;
  const style = extractCommentStyle(code);
  assert.ok(style !== null);
  assert.ok(style!.includes('"""'));
});

await test('extracts // comment block style', () => {
  const code = `// First comment line\n// Second comment line\nfunction foo() {}`;
  const style = extractCommentStyle(code);
  assert.ok(style !== null);
  assert.ok(style!.includes('//'));
});

await test('returns null for code without comments', () => {
  const code = `function foo() { return 42; }`;
  const style = extractCommentStyle(code);
  assert.equal(style, null);
});

// ===========================================================================
// 9. Document Pipeline — Exports
// ===========================================================================

console.log('\n── Document Pipeline: Exports ──');

await test('runDocumentPipeline is exported as function', () => {
  assert.equal(typeof runDocumentPipeline, 'function');
});

await test('detectDocType is exported as function', () => {
  assert.equal(typeof detectDocType, 'function');
});

await test('extractCommentStyle is exported as function', () => {
  assert.equal(typeof extractCommentStyle, 'function');
});

// ===========================================================================
// 10. Agent REPL Wiring
// ===========================================================================

console.log('\n── Agent REPL Wiring ──');

const indexSource = await readFile(
  join(import.meta.dirname ?? '.', '../src/agent/index.ts'), 'utf-8',
);

await test('index.ts imports runGraphQuery', () => {
  assert.ok(indexSource.includes("import { runGraphQuery }"));
});

await test('index.ts imports runResearchPipeline', () => {
  assert.ok(indexSource.includes("import { runResearchPipeline }"));
});

await test('index.ts imports runReviewPipeline', () => {
  assert.ok(indexSource.includes("import { runReviewPipeline }"));
});

await test('index.ts imports runDocumentPipeline', () => {
  assert.ok(indexSource.includes("import { runDocumentPipeline }"));
});

await test('pipeline intents include review', () => {
  assert.ok(indexSource.includes("'review'"));
});

await test('pipeline intents include document', () => {
  assert.ok(indexSource.includes("'document'"));
});

await test('pipeline intents include research', () => {
  assert.ok(indexSource.includes("'research'"));
});

await test('graph handler replaces placeholder with runGraphQuery', () => {
  assert.ok(indexSource.includes('runGraphQuery(classified.message)'));
  // The old placeholder message should be gone
  assert.ok(!indexSource.includes('Pure graph queries not yet implemented'));
});

await test('graph handler re-routes interpretive to research', () => {
  assert.ok(indexSource.includes('Interpretive question'));
  assert.ok(indexSource.includes("handlePipelineIntent('research'"));
});

await test('review handler checks for Claude availability', () => {
  assert.ok(indexSource.includes("intent === 'review'"));
  assert.ok(indexSource.includes('Review pipeline requires Claude'));
});

await test('document handler detects --review flag', () => {
  assert.ok(indexSource.includes("intent === 'document'"));
  assert.ok(indexSource.includes('--review'));
});

await test('research handler appends web sources', () => {
  assert.ok(indexSource.includes("intent === 'research'"));
  assert.ok(indexSource.includes('result.webResults'));
});

// ===========================================================================
// 11. Router — Graph and Review Routing
// ===========================================================================

console.log('\n── Router Verification ──');

const routerSource = await readFile(
  join(import.meta.dirname ?? '.', '../src/agent/router.ts'), 'utf-8',
);

await test('router has graph in NO_LLM set', () => {
  assert.ok(routerSource.includes("'graph'"));
  assert.ok(routerSource.includes('NO_LLM'));
});

await test('router has review in CLAUDE_DEFAULT set', () => {
  assert.ok(routerSource.includes("'review'"));
  assert.ok(routerSource.includes('CLAUDE_DEFAULT'));
});

await test('router has document tier as fast', () => {
  assert.ok(routerSource.includes("document:"));
  assert.ok(routerSource.includes("'fast'"));
});

await test('router has research tier as standard', () => {
  assert.ok(routerSource.includes("research:"));
  assert.ok(routerSource.includes("'standard'"));
});

// ===========================================================================
// 12. Search Provider — Edge Cases
// ===========================================================================

console.log('\n── Search Provider: Edge Cases ──');

await test('ClaudeWebSearchProvider handles non-JSON response', async () => {
  const mockProvider = {
    complete: async () => ({ text: 'This is not JSON', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const provider = new ClaudeWebSearchProvider(mockProvider);
  const results = await provider.search('test query');
  assert.deepEqual(results, []);
});

await test('ClaudeWebSearchProvider handles JSON wrapped in code block', async () => {
  const mockProvider = {
    complete: async () => ({
      text: '```json\n[{"title":"Test","url":"https://test.com","snippet":"A test"}]\n```',
      stopReason: 'end_turn' as const,
    }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const provider = new ClaudeWebSearchProvider(mockProvider);
  const results = await provider.search('test query');
  assert.equal(results.length, 1);
  assert.equal(results[0]!.title, 'Test');
  assert.equal(results[0]!.url, 'https://test.com');
});

await test('ClaudeWebSearchProvider respects limit parameter', async () => {
  const mockProvider = {
    complete: async () => ({
      text: JSON.stringify([
        { title: 'A', url: 'http://a.com', snippet: 'A' },
        { title: 'B', url: 'http://b.com', snippet: 'B' },
        { title: 'C', url: 'http://c.com', snippet: 'C' },
      ]),
      stopReason: 'end_turn' as const,
    }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const provider = new ClaudeWebSearchProvider(mockProvider);
  const results = await provider.search('test', 2);
  assert.equal(results.length, 2);
});

// ===========================================================================
// 13. Graph Handler — Edge Cases
// ===========================================================================

console.log('\n── Graph Handler: Edge Cases ──');

await test('classifyGraphQuery handles empty input', () => {
  const result = classifyGraphQuery('');
  assert.ok(result.type !== undefined);
});

await test('classifyGraphQuery handles "describe X" as entity', () => {
  const result = classifyGraphQuery('describe PaymentService');
  assert.equal(result.type, 'entity');
});

await test('classifyGraphQuery handles "look up X" as search', () => {
  const result = classifyGraphQuery('look up embedEntities');
  assert.equal(result.type, 'search');
});

await test('callers query has hops=2 by default', () => {
  const result = classifyGraphQuery('who calls foo');
  assert.equal(result.hops, 2);
});

await test('depends_on query has hops=5 for deep closure', () => {
  const result = classifyGraphQuery('what depends on Foo?');
  assert.equal(result.hops, 5);
});

// ===========================================================================
// 14. Research Pipeline — Edge Cases
// ===========================================================================

console.log('\n── Research Pipeline: Edge Cases ──');

await test('selectResearchSource returns graph for "explain this" codebase questions', () => {
  const source = selectResearchSource('explain this class in the codebase');
  assert.equal(source, 'graph');
});

await test('selectResearchSource returns web for version-specific questions', () => {
  const source = selectResearchSource('what changed in version 2.0 of this package?');
  assert.equal(source, 'web');
});

await test('selectResearchSource returns combined for migration questions', () => {
  const source = selectResearchSource('how do I migrate from v1 to v2?');
  assert.equal(source, 'combined');
});

// ===========================================================================
// 15. Cross-Module Integration
// ===========================================================================

console.log('\n── Cross-Module Integration ──');

const typesSource = await readFile(
  join(import.meta.dirname ?? '.', '../src/shared/types.ts'), 'utf-8',
);

await test('Intent type includes review', () => {
  assert.ok(typesSource.includes("'review'"));
});

await test('Intent type includes document', () => {
  assert.ok(typesSource.includes("'document'"));
});

await test('Intent type includes research', () => {
  assert.ok(typesSource.includes("'research'"));
});

await test('Intent type includes graph', () => {
  assert.ok(typesSource.includes("'graph'"));
});

// ===========================================================================
// 16. File Structure Verification
// ===========================================================================

console.log('\n── File Structure ──');

import { access } from 'node:fs/promises';

const ROOT = join(import.meta.dirname ?? '.', '..');

await test('src/agent/search/provider.ts exists', async () => {
  await access(join(ROOT, 'src/agent/search/provider.ts'));
});

await test('src/agent/tasks/graph.ts exists', async () => {
  await access(join(ROOT, 'src/agent/tasks/graph.ts'));
});

await test('src/agent/tasks/research.ts exists', async () => {
  await access(join(ROOT, 'src/agent/tasks/research.ts'));
});

await test('src/agent/tasks/review.ts exists', async () => {
  await access(join(ROOT, 'src/agent/tasks/review.ts'));
});

await test('src/agent/tasks/document.ts exists', async () => {
  await access(join(ROOT, 'src/agent/tasks/document.ts'));
});

// ===========================================================================
// 17. Gap Fixes Verification
// ===========================================================================

console.log('\n── Gap Fixes ──');

// Gap 1: Review @opus escalation
const reviewSource = await readFile(
  join(import.meta.dirname ?? '.', '../src/agent/tasks/review.ts'), 'utf-8',
);

await test('Gap 1: review pipeline accepts isOpus parameter', () => {
  assert.ok(reviewSource.includes('isOpus'));
  assert.ok(reviewSource.includes('isOpus = false'));
});

await test('Gap 1: review pipeline sets usedOpus from isOpus', () => {
  assert.ok(reviewSource.includes('usedOpus: isOpus'));
});

await test('Gap 1: review gives Opus higher maxTokens', () => {
  assert.ok(reviewSource.includes('isOpus ? 5000 : 3000'));
});

await test('Gap 1: REPL passes isOpus to review pipeline', () => {
  assert.ok(indexSource.includes("classified.explicit === 'opus'"));
  assert.ok(indexSource.includes('reviewProvider, isOpus'));
});

// Gap 2: Document Sonnet escalation for cross-cutting
const docSource = await readFile(
  join(import.meta.dirname ?? '.', '../src/agent/tasks/document.ts'), 'utf-8',
);

await test('Gap 2: document pipeline accepts sonnetProvider parameter', () => {
  assert.ok(docSource.includes('sonnetProvider'));
  assert.ok(docSource.includes('sonnetProvider: LLMProvider | null'));
});

await test('Gap 2: cross-cutting docs use Sonnet when available', () => {
  assert.ok(docSource.includes('crossCutting && sonnetProvider'));
});

await test('Gap 2: REPL creates Sonnet provider for document pipeline', () => {
  assert.ok(indexSource.includes('sonnetProvider'));
  assert.ok(indexSource.includes('models.tiers.standard'));
});

// Gap 3: Document single-round review (no retry loop)
await test('Gap 3: document review does NOT have retry/fix loop', () => {
  // The old code had "applying corrections" with a second local model call
  assert.ok(!docSource.includes('Apply the corrections and output'));
  // Should just surface feedback — single round
  assert.ok(docSource.includes('Single round'));
});

// Gap 4: Research escalation
import { shouldEscalateResearch } from '../src/agent/tasks/research.js';

await test('Gap 4: shouldEscalateResearch is exported', () => {
  assert.equal(typeof shouldEscalateResearch, 'function');
});

await test('Gap 4: escalates when forceEscalate is true', () => {
  assert.equal(shouldEscalateResearch('test', [], true), true);
});

await test('Gap 4: escalates when >2 repos in closure', () => {
  assert.equal(shouldEscalateResearch('test', ['a', 'b', 'c'], false), true);
});

await test('Gap 4: does not escalate with ≤2 repos and no force', () => {
  assert.equal(shouldEscalateResearch('test', ['a', 'b'], false), false);
});

await test('Gap 4: REPL passes closureRepos and forceEscalate to research', () => {
  assert.ok(indexSource.includes('session.closureRepos'));
  assert.ok(indexSource.includes('forceEscalate'));
});

await test('Gap 4: research detects @claude/@opus as forceEscalate', () => {
  assert.ok(indexSource.includes("classified.explicit === 'claude'"));
  assert.ok(indexSource.includes("classified.explicit === 'opus'"));
});

// Gap 5: Brave key first-run setup
import { promptBraveKeySetup } from '../src/agent/index.js';

await test('Gap 5: promptBraveKeySetup is exported', () => {
  assert.equal(typeof promptBraveKeySetup, 'function');
});

await test('Gap 5: REPL calls promptBraveKeySetup on startup', () => {
  assert.ok(indexSource.includes('promptBraveKeySetup(config)'));
});

await test('Gap 5: setup uses flag file to prevent re-prompting', () => {
  assert.ok(indexSource.includes('brave-setup-done'));
});

// ===========================================================================
// Summary
// ===========================================================================

console.log(`\n═══ Phase 9 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) process.exit(1);
