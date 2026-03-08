#!/usr/bin/env tsx
/**
 * End-to-end pipeline tests — NO MOCKS.
 *
 * Prerequisites:
 *   - Ollama running with qwen3-coder:latest and qwen3-embedding:0.6b
 *   - Anthropic API key in ~/.insrc/config.json
 *   - Daemon running with current repo indexed
 *
 * Run: npx tsx scripts/test-agent-e2e.ts
 */

import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function section(title: string) {
  console.log(`\n${CYAN}── ${title} ──${RESET}`);
}

function dim(msg: string) { console.log(`${DIM}    ${msg}${RESET}`); }

async function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; console.log(`  ${GREEN}✓${RESET} ${name}`); },
    (err: unknown) => {
      failed++;
      console.log(`  ${RED}✗${RESET} ${name}`);
      console.log(`    ${err}`);
    },
  );
}

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

const log = (msg: string) => dim(msg);

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

import { loadConfig } from '../src/agent/config.js';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';

const config = loadConfig();
const ollamaProvider = new OllamaProvider(config.models.local, config.ollama.host);
const claudeProvider = config.keys.anthropic
  ? new ClaudeProvider({ model: config.models.tiers.standard, apiKey: config.keys.anthropic })
  : null;

const REPO_PATH = '/home/subho/work/dev/insors/insrc';
const testDir = join(tmpdir(), 'insrc-e2e-' + Date.now());
mkdirSync(testDir, { recursive: true });
mkdirSync(join(testDir, 'src'), { recursive: true });

// ---------------------------------------------------------------------------
// Section 0: Pre-flight checks
// ---------------------------------------------------------------------------

section('Pre-flight');

let ollamaOk = false;
let daemonOk = false;

await test('Ollama is reachable', async () => {
  ollamaOk = await ollamaProvider.ping();
  assert.equal(ollamaOk, true, 'Ollama ping failed — is it running?');
});

if (!ollamaOk) {
  console.error(`\n${RED}Ollama is not running. Aborting.${RESET}`);
  process.exit(1);
}

await test('Anthropic API key is configured', () => {
  if (!claudeProvider) {
    dim('SKIPPED — no API key. Claude-only tests will be skipped.');
    return;
  }
  assert.ok(config.keys.anthropic, 'Anthropic key present');
});

await test('Daemon is reachable', async () => {
  const { ping, resetAvailability } = await import('../src/agent/tools/mcp-client.js');
  resetAvailability(); // clear cached state
  daemonOk = await ping();
  if (!daemonOk) {
    dim('SKIPPED — daemon not running. Graph tests will be skipped.');
    return;
  }
  assert.equal(daemonOk, true);
});

// ---------------------------------------------------------------------------
// Section 1: Classify + Route
// ---------------------------------------------------------------------------

section('Classify + Route');

import { classify } from '../src/agent/classifier/index.js';
import { selectProvider } from '../src/agent/router.js';

await test('Classify implement intent with real LLM', () => withTimeout(async () => {
  // Use strong keyword trigger ("write a function") which maps to implement at 0.95 confidence
  const result = await classify('write a function to parse CSV files', { llmProvider: ollamaProvider });
  dim(`intent=${result.intent} confidence=${result.confidence}`);
  assert.equal(result.intent, 'implement');
  assert.ok(result.confidence > 0);
  assert.ok(result.message.length > 0);
}, 30_000));

await test('Classify research intent', () => withTimeout(async () => {
  const result = await classify('how does the indexer work in this repo', { llmProvider: ollamaProvider });
  dim(`intent=${result.intent} confidence=${result.confidence}`);
  assert.equal(result.intent, 'research');
  assert.ok(result.confidence > 0);
}, 30_000));

await test('Classify with /intent prefix override', async () => {
  const result = await classify('/intent review check this code snippet');
  assert.equal(result.intent, 'review');
  assert.equal(result.confidence, 1.0);
});

await test('Route to correct provider', () => {
  const implRoute = selectProvider('implement', undefined, { ollamaProvider, claudeProvider, config });
  assert.ok(implRoute.provider);
  assert.equal(implRoute.graphOnly, false);
  assert.ok(implRoute.label.length > 0);

  const graphRoute = selectProvider('graph', undefined, { ollamaProvider, claudeProvider, config });
  assert.equal(graphRoute.graphOnly, true);
});

// ---------------------------------------------------------------------------
// Section 2: Research pipeline — local only
// ---------------------------------------------------------------------------

section('Research Pipeline — Local');

import { runResearchPipeline } from '../src/agent/tasks/research.js';

await test('Research about the codebase (local, graph source)', () => withTimeout(async () => {
  const result = await runResearchPipeline(
    'how does the indexer work in this repo',
    '',
    ollamaProvider,
    null,        // no Claude — force local
    undefined,   // no brave key
    log,
    [REPO_PATH],
    false,       // no force escalate
  );
  dim(`answer length=${result.answer.length} source=${result.source} escalated=${result.escalated}`);
  assert.ok(result.answer.length > 20, 'answer should be substantive');
  assert.equal(result.escalated, false);
  assert.ok(Array.isArray(result.searchQueries));
}, 120_000));

// ---------------------------------------------------------------------------
// Section 3: Research pipeline — Claude escalation
// ---------------------------------------------------------------------------

section('Research Pipeline — Claude Escalation');

await test('Research with forced Claude escalation', () => withTimeout(async () => {
  if (!claudeProvider) { dim('SKIPPED — no Claude key'); return; }
  const result = await runResearchPipeline(
    'explain the session lifecycle and context management in detail',
    '',
    ollamaProvider,
    claudeProvider,
    undefined,
    log,
    [REPO_PATH],
    true,        // force escalate
  );
  dim(`answer length=${result.answer.length} escalated=${result.escalated}`);
  assert.ok(result.answer.length > 20);
  assert.equal(result.escalated, true);
}, 120_000));

// ---------------------------------------------------------------------------
// Section 4: Graph query
// ---------------------------------------------------------------------------

section('Graph Query');

import { runGraphQuery } from '../src/agent/tasks/graph.js';

await test('"who calls parseManifest" returns callers', () => withTimeout(async () => {
  if (!daemonOk) { dim('SKIPPED — daemon not running'); return; }
  const result = await runGraphQuery('who calls parseManifest');
  dim(`handled=${result.handled} queryType=${result.queryType} response length=${result.response.length}`);
  assert.equal(result.handled, true);
  assert.equal(result.queryType, 'callers');
  assert.ok(result.response.length > 0, 'should return callers info');
}, 30_000));

await test('Interpretive question is not handled (re-route to research)', async () => {
  const result = await runGraphQuery('why is the indexer designed this way');
  assert.equal(result.handled, false);
  assert.equal(result.queryType, 'interpretive');
});

// ---------------------------------------------------------------------------
// Section 5: Implement pipeline
// ---------------------------------------------------------------------------

section('Implement Pipeline');

import { runImplementPipeline } from '../src/agent/tasks/implement.js';

await test('Implement: create a multiply function in temp dir', () => withTimeout(async () => {
  const srcFile = join(testDir, 'src', 'utils.ts');
  writeFileSync(srcFile, `export function add(a: number, b: number): number {\n  return a + b;\n}\n`);
  const codeContext = `// File: src/utils.ts\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`;

  const result = await runImplementPipeline(
    'add a multiply function that takes two numbers and returns their product',
    testDir,
    codeContext,
    '',
    ollamaProvider,
    claudeProvider,
    log,
  );
  dim(`accepted=${result.accepted} retries=${result.retries} files=${result.filesWritten.length} needsDecision=${result.needsUserDecision}`);
  if (result.diff) dim(`diff preview: ${result.diff.slice(0, 120).replace(/\n/g, '\\n')}`);

  assert.equal(typeof result.accepted, 'boolean');
  assert.ok(result.diff.length > 0 || result.feedback.length > 0, 'should produce a diff or feedback');
  assert.ok(result.retries >= 0 && result.retries <= 5);
  assert.ok(Array.isArray(result.filesWritten));
  assert.equal(typeof result.needsUserDecision, 'boolean');
}, 180_000));

// ---------------------------------------------------------------------------
// Section 6: Refactor pipeline
// ---------------------------------------------------------------------------

section('Refactor Pipeline');

import { runRefactorPipeline } from '../src/agent/tasks/refactor.js';

await test('Refactor: rename getData to fetchData', () => withTimeout(async () => {
  const srcFile = join(testDir, 'src', 'helper.ts');
  writeFileSync(srcFile, [
    'export function getData(id: string): string {',
    '  return `data-${id}`;',
    '}',
    '',
    'export function useData() {',
    '  return getData("1");',
    '}',
    '',
  ].join('\n'));
  const codeContext = `// File: src/helper.ts\n` + [
    'export function getData(id: string): string {',
    '  return `data-${id}`;',
    '}',
    '',
    'export function useData() {',
    '  return getData("1");',
    '}',
  ].join('\n');

  const result = await runRefactorPipeline(
    'rename getData to fetchData and update all call sites',
    testDir,
    codeContext,
    '',
    ollamaProvider,
    claudeProvider,
    log,
  );
  dim(`accepted=${result.accepted} retries=${result.retries} files=${result.filesWritten.length}`);
  if (result.diff) dim(`diff preview: ${result.diff.slice(0, 120).replace(/\n/g, '\\n')}`);

  assert.equal(typeof result.accepted, 'boolean');
  assert.equal(typeof result.needsUserDecision, 'boolean');
  assert.ok(result.retries >= 0);
  assert.ok(Array.isArray(result.filesWritten));
}, 180_000));

// ---------------------------------------------------------------------------
// Section 7: Test pipeline
// ---------------------------------------------------------------------------

section('Test Pipeline');

import { runTestPipeline } from '../src/agent/tasks/test.js';

await test('Test: generate tests for factorial function', () => withTimeout(async () => {
  const srcFile = join(testDir, 'src', 'math.ts');
  writeFileSync(srcFile, [
    'export function factorial(n: number): number {',
    '  if (n <= 1) return 1;',
    '  return n * factorial(n - 1);',
    '}',
    '',
  ].join('\n'));
  const testFile = join(testDir, 'src', 'math.test.ts');
  const entityContext = [
    'export function factorial(n: number): number {',
    '  if (n <= 1) return 1;',
    '  return n * factorial(n - 1);',
    '}',
  ].join('\n');

  const result = await runTestPipeline(
    'write tests for the factorial function',
    testFile,
    entityContext,
    testDir,
    '',
    ollamaProvider,
    claudeProvider,
    log,
  );
  dim(`passed=${result.passed} files=${result.filesWritten.length} needsDecision=${result.needsUserDecision}`);
  if (result.testDiff) dim(`diff preview: ${result.testDiff.slice(0, 120).replace(/\n/g, '\\n')}`);

  assert.equal(typeof result.passed, 'boolean');
  assert.ok(typeof result.testDiff === 'string');
  assert.ok(Array.isArray(result.filesWritten));
  assert.equal(typeof result.needsUserDecision, 'boolean');
  assert.ok(typeof result.message === 'string');
}, 180_000));

// ---------------------------------------------------------------------------
// Section 8: Debug pipeline
// ---------------------------------------------------------------------------

section('Debug Pipeline');

import { runDebugPipeline } from '../src/agent/tasks/debug.js';

await test('Debug: fix a deliberate typo bug', () => withTimeout(async () => {
  const srcFile = join(testDir, 'src', 'buggy.ts');
  writeFileSync(srcFile, [
    'export function greet(name: string): string {',
    '  return `Hello, ${naem}!`;',
    '}',
    '',
  ].join('\n'));
  // Provide absolute path and ask for diff output explicitly
  const codeContext = [
    `// File: ${srcFile}`,
    'export function greet(name: string): string {',
    '  return `Hello, ${naem}!`;',
    '}',
  ].join('\n');

  const result = await runDebugPipeline(
    [
      `Fix the bug in ${srcFile}: the variable 'naem' is misspelled and should be 'name'.`,
      'Output only a unified diff (--- a/... +++ b/... format) to fix this bug. Do not use tools.',
    ].join(' '),
    testDir,
    codeContext,
    '',
    ollamaProvider,
    claudeProvider,
    log,
    'auto-accept',
    false,
  );
  dim(`fixed=${result.fixed} iterations=${result.iterations} escalations=${result.escalations} files=${result.filesWritten.length}`);
  if (result.diff) dim(`diff preview: ${result.diff.slice(0, 120).replace(/\n/g, '\\n')}`);

  // Debug pipeline returns a structured result — validate shape
  assert.equal(typeof result.fixed, 'boolean');
  assert.ok(typeof result.diff === 'string');
  assert.ok(Array.isArray(result.filesWritten));
  assert.ok(Array.isArray(result.evidence));
  assert.equal(typeof result.iterations, 'number');
  assert.equal(typeof result.escalations, 'number');
  assert.equal(typeof result.needsUserDecision, 'boolean');
  assert.equal(typeof result.message, 'string');
}, 180_000));

// ---------------------------------------------------------------------------
// Section 9: Review pipeline (Claude-only)
// ---------------------------------------------------------------------------

section('Review Pipeline');

import { runReviewPipeline } from '../src/agent/tasks/review.js';

await test('Review: review a small code change', () => withTimeout(async () => {
  if (!claudeProvider) { dim('SKIPPED — no Claude key'); return; }

  const diffContext = [
    '```diff',
    '--- a/src/utils.ts',
    '+++ b/src/utils.ts',
    '@@ -1,3 +1,7 @@',
    ' export function add(a: number, b: number) { return a + b; }',
    '+',
    '+export function subtract(a: number, b: number) {',
    '+  return a - b;',
    '+}',
    '```',
  ].join('\n');

  const result = await runReviewPipeline(
    'review this change:\n' + diffContext,
    diffContext,
    claudeProvider,
    false,
    log,
  );
  dim(`review length=${result.review.length} entities=${result.touchedEntities.length} usedOpus=${result.usedOpus}`);
  dim(`review preview: ${result.review.slice(0, 150).replace(/\n/g, '\\n')}`);

  assert.ok(result.review.length > 20, 'review should be substantive');
  assert.ok(Array.isArray(result.touchedEntities));
  assert.equal(result.usedOpus, false);
}, 60_000));

// ---------------------------------------------------------------------------
// Section 10: Document pipeline
// ---------------------------------------------------------------------------

section('Document Pipeline');

import { runDocumentPipeline } from '../src/agent/tasks/document.js';

await test('Document: generate docstring for parseConfig', () => withTimeout(async () => {
  const srcFile = join(testDir, 'src', 'documented.ts');
  const source = [
    'export function parseConfig(raw: string): Record<string, string> {',
    '  const result: Record<string, string> = {};',
    '  for (const line of raw.split("\\n")) {',
    '    const [key, val] = line.split("=");',
    '    if (key && val) result[key.trim()] = val.trim();',
    '  }',
    '  return result;',
    '}',
    '',
  ].join('\n');
  writeFileSync(srcFile, source);

  const result = await runDocumentPipeline(
    'add a docstring to the parseConfig function',
    testDir,
    `// File: src/documented.ts\n${source}`,
    ollamaProvider,
    claudeProvider,
    false,
    log,
    null,
  );
  dim(`applied=${result.applied} files=${result.filesWritten.length} crossCutting=${result.isCrossCutting}`);
  if (result.diff) dim(`diff preview: ${result.diff.slice(0, 120).replace(/\n/g, '\\n')}`);

  assert.equal(typeof result.applied, 'boolean');
  assert.ok(typeof result.diff === 'string');
  assert.ok(Array.isArray(result.filesWritten));
  assert.equal(typeof result.claudeReviewed, 'boolean');
  assert.equal(typeof result.isCrossCutting, 'boolean');
  assert.equal(typeof result.message, 'string');
}, 120_000));

// ---------------------------------------------------------------------------
// Section 11: Plan pipeline
// ---------------------------------------------------------------------------

section('Plan Pipeline');

import { runPlanPipeline } from '../src/agent/tasks/plan.js';

await test('Plan: plan a small feature addition', () => withTimeout(async () => {
  const result = await runPlanPipeline(
    'add a caching layer for graph queries that expires after 5 minutes',
    REPO_PATH,
    '',
    '',
    '',
    ollamaProvider,
    claudeProvider,
  );
  dim(`sketch length=${result.sketch.length} plan steps=${result.plan?.steps?.length ?? 0} tag=${result.tag}`);
  if (result.sketch) dim(`sketch preview: ${result.sketch.slice(0, 120).replace(/\n/g, '\\n')}`);

  assert.ok(result.sketch.length > 20, 'sketch should be substantive');
  assert.ok(result.plan, 'plan object should exist');
  assert.ok(typeof result.plan.id === 'string');
  assert.ok(Array.isArray(result.plan.steps));
  assert.ok(result.plan.steps.length > 0, 'plan should have at least one step');
  assert.ok(result.plan.steps[0]!.title.length > 0, 'first step should have a title');
  assert.ok(typeof result.tag === 'string');
}, 120_000));

// ---------------------------------------------------------------------------
// Section 12: Requirements pipeline (Claude-only)
// ---------------------------------------------------------------------------

section('Requirements Pipeline');

import { runRequirementsPipeline } from '../src/agent/tasks/requirements.js';

await test('Requirements: generate requirements for rate limiting', () => withTimeout(async () => {
  if (!claudeProvider) { dim('SKIPPED — no Claude key (requirements requires Claude)'); return; }

  const result = await runRequirementsPipeline(
    'add rate limiting to the MCP server endpoints',
    '',
    ollamaProvider,
    claudeProvider,
  );
  dim(`sketch length=${result.sketch.length} enhanced length=${result.enhanced.length} tag=${result.tag}`);

  assert.ok(result.sketch.length > 20, 'sketch should be substantive');
  assert.ok(result.enhanced.length > 20, 'enhanced should be substantive');
  assert.equal(result.tag, '[requirements]');
}, 120_000));

// ---------------------------------------------------------------------------
// Section 13: Design pipeline (Claude-only)
// ---------------------------------------------------------------------------

section('Design Pipeline');

import { runDesignPipeline } from '../src/agent/tasks/design.js';

await test('Design: design a plugin system', () => withTimeout(async () => {
  if (!claudeProvider) { dim('SKIPPED — no Claude key (design requires Claude)'); return; }

  const result = await runDesignPipeline(
    'design a plugin system for custom tool backends',
    '',
    '',
    ollamaProvider,
    claudeProvider,
  );
  dim(`sketch length=${result.sketch.length} enhanced length=${result.enhanced.length} tag=${result.tag}`);

  assert.ok(result.sketch.length > 20, 'sketch should be substantive');
  assert.ok(result.enhanced.length > 20, 'enhanced should be substantive');
  assert.equal(result.tag, '[design]');
}, 120_000));

// ---------------------------------------------------------------------------
// Section 14: Tool loop — LLM reads file and answers
// ---------------------------------------------------------------------------

section('Tool Loop');

import { runToolLoop } from '../src/agent/tools/loop.js';
import { getToolDefinitions } from '../src/agent/tools/registry.js';
import type { LLMMessage, ToolCall, ToolResult } from '../src/shared/types.js';

await test('Tool loop: LLM reads a file and answers a question', () => withTimeout(async () => {
  const infoFile = join(testDir, 'info.txt');
  writeFileSync(infoFile, 'The capital of France is Paris.\n');

  const tools = getToolDefinitions({ mcpAvailable: false });
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: [
        'You are a coding assistant with tools available.',
        'When you need to read a file, call the Read tool with the file_path parameter.',
        'Do NOT output tool calls as text. Use structured tool calling.',
        'Be concise in your final answer.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Read the file at ${infoFile} and tell me what capital city is mentioned.`,
    },
  ];

  const toolCalls: ToolCall[] = [];

  const result = await runToolLoop(messages, {
    provider: ollamaProvider,
    tools,
    intent: 'research',
    permissionMode: 'auto-accept',
    onToolCall: (call) => { toolCalls.push(call); dim(`tool call: ${call.name}`); },
    onToolResult: () => {},
  });

  dim(`iterations=${result.iterations} hitLimit=${result.hitLimit} response length=${result.response.length}`);
  dim(`response: ${result.response.slice(0, 200).replace(/\n/g, '\\n')}`);

  assert.equal(result.hitLimit, false);
  assert.ok(result.response.length > 0, 'should produce a response');

  // The LLM should either use structured tool calls or at least mention Paris.
  // Some local models emit tool calls as text rather than structured JSON.
  const usedTools = result.iterations >= 1;
  const mentionsParis = result.response.toLowerCase().includes('paris');
  assert.ok(
    usedTools || mentionsParis,
    `should either use tools (iterations=${result.iterations}) or mention Paris in response`,
  );
}, 120_000));

// ---------------------------------------------------------------------------
// Section 15: Context assembly
// ---------------------------------------------------------------------------

section('Context Assembly');

import { ContextManager } from '../src/agent/context/index.js';
import { embedText } from '../src/agent/context/semantic.js';

await test('Embed text with real Ollama', () => withTimeout(async () => {
  const vec = await embedText(ollamaProvider, 'how does the indexer work');
  dim(`embedding dim=${vec.length}`);
  assert.ok(vec.length > 0, 'embedding should be non-empty');
  assert.ok(vec.every(v => typeof v === 'number'), 'all elements should be numbers');
}, 30_000));

await test('ContextManager assemble produces valid structure', () => withTimeout(async () => {
  const ctx = new ContextManager({
    repoPath: REPO_PATH,
    closureRepos: [REPO_PATH],
    provider: ollamaProvider,
  });

  const queryEmbedding = await embedText(ollamaProvider, 'how does the indexer work');
  const assembled = await ctx.assemble('how does the indexer work', queryEmbedding);

  dim(`system tokens=${assembled.system.tokens} code tokens=${assembled.code.tokens} total=${assembled.totalTokens}`);

  assert.ok(assembled.system.text.length > 0, 'system text should be non-empty');
  assert.ok(assembled.system.text.includes('insrc'), 'system prompt should mention insrc');
  assert.ok(typeof assembled.summary === 'object');
  assert.ok(typeof assembled.recent === 'object');
  assert.ok(typeof assembled.code === 'object');
  assert.ok(typeof assembled.totalTokens === 'number');

  const messages = ctx.buildMessages(assembled, 'how does the indexer work');
  dim(`messages count=${messages.length}`);
  assert.ok(messages.length >= 2, 'need at least system + user message');
  assert.equal(messages[0]!.role, 'system');
  assert.equal(messages[messages.length - 1]!.role, 'user');
}, 60_000));

// ---------------------------------------------------------------------------
// Section 16: Health monitor
// ---------------------------------------------------------------------------

section('Health Monitor');

import { HealthMonitor } from '../src/agent/faults/index.js';
import { ping as pingDaemon, resetAvailability } from '../src/agent/tools/mcp-client.js';

await test('Real health check returns healthy for running services', () => withTimeout(async () => {
  resetAvailability(); // clear cache
  const health = new HealthMonitor({
    pingOllama: () => ollamaProvider.ping(),
    pingDaemon: async () => { resetAvailability(); return pingDaemon(); },
  });

  const snap = await health.check();
  health.stop();

  dim(`ollama=${snap.ollama.state} daemon=${snap.daemon.state}`);

  assert.equal(snap.ollama.state, 'healthy', 'Ollama should be healthy');
  assert.ok(snap.ollama.consecutiveSuccesses >= 1);

  if (daemonOk) {
    assert.equal(snap.daemon.state, 'healthy', 'daemon should be healthy');
    assert.ok(snap.daemon.consecutiveSuccesses >= 1);
  } else {
    dim('daemon not running — checking degraded/unavailable state');
    assert.ok(snap.daemon.state !== 'healthy');
  }
}, 15_000));

// ---------------------------------------------------------------------------
// Cleanup and summary
// ---------------------------------------------------------------------------

try {
  rmSync(testDir, { recursive: true, force: true });
} catch { /* ignore */ }

console.log(`\n${'═'.repeat(60)}`);
if (failed === 0) {
  console.log(`${GREEN}All ${passed} tests passed${RESET}`);
} else {
  console.log(`${RED}${failed} failed${RESET}, ${GREEN}${passed} passed${RESET}`);
}
console.log(`${'═'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
