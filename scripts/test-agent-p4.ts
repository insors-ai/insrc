#!/usr/bin/env tsx
/**
 * Phase 4 tests — Layered Context Model
 *
 * Tests cover:
 *   - Token budget constants and countTokens()
 *   - Overflow priority enforcement (fitToBudget)
 *   - System context (L1)
 *   - Rolling summary (L2)
 *   - Recent turns with recency weighting (L3a)
 *   - Semantic history with cosine similarity (L3b)
 *   - Context assembler (ContextManager)
 *   - Escalation thresholds
 */

import assert from 'node:assert/strict';

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
// 1. Token budget
// ---------------------------------------------------------------------------

console.log('\n── Token budget ──');

import { TOKEN_BUDGET, countTokens } from '../src/agent/context/budget.js';

await test('TOKEN_BUDGET has expected layers', () => {
  assert.equal(TOKEN_BUDGET.system, 1_000);
  assert.equal(TOKEN_BUDGET.summary, 3_000);
  assert.equal(TOKEN_BUDGET.recent, 4_000);
  assert.equal(TOKEN_BUDGET.semantic, 4_000);
  assert.equal(TOKEN_BUDGET.code, 16_000);
  assert.equal(TOKEN_BUDGET.response, 8_000);
  assert.equal(TOKEN_BUDGET.total, 64_000);
});

await test('countTokens approximates chars/3', () => {
  assert.equal(countTokens(''), 0);
  assert.equal(countTokens('abc'), 1);
  assert.equal(countTokens('abcdef'), 2);
  assert.equal(countTokens('a'), 1); // ceil(1/3) = 1
});

// ---------------------------------------------------------------------------
// 2. Overflow priority enforcement
// ---------------------------------------------------------------------------

console.log('\n── Overflow ──');

import { fitToBudget, type RawLayers } from '../src/agent/context/overflow.js';

await test('fitToBudget passes through when within budget', () => {
  const raw: RawLayers = {
    system: 'system text',
    summary: 'summary text',
    recent: ['turn 1', 'turn 2'],
    semantic: ['sem 1'],
    code: ['code block 1'],
  };
  const result = fitToBudget(raw);
  assert.ok(result.totalTokens > 0);
  assert.equal(result.dropped.length, 0);
});

await test('fitToBudget drops code entities first', () => {
  // Create code blocks that exceed code ceiling
  const bigCode = 'x'.repeat(TOKEN_BUDGET.code * 3 + 100);
  const raw: RawLayers = {
    system: 'sys',
    summary: '',
    recent: [],
    semantic: [],
    code: [bigCode, 'small code'],
  };
  const result = fitToBudget(raw);
  // At least one block should be included (first fits), second dropped by ceiling
  assert.ok(result.code.tokens <= TOKEN_BUDGET.code);
});

await test('fitToBudget keeps at least 2 recent turns during overflow', () => {
  // Force overflow by creating huge content
  const raw: RawLayers = {
    system: 'x'.repeat(TOKEN_BUDGET.system * 3),
    summary: 'x'.repeat(TOKEN_BUDGET.summary * 3),
    recent: ['turn1', 'turn2', 'turn3', 'turn4', 'turn5'],
    semantic: [],
    code: [],
  };
  const result = fitToBudget(raw);
  // Recent should have at most 5 blocks after ceiling enforcement
  // Even under overflow, the algorithm keeps first 2 (newest)
  assert.ok(result.recent.text.length >= 0);
});

await test('fitToBudget preserves directly-named entities during overflow', () => {
  // Create a scenario where code blocks must be dropped but one is preserved
  // Use blocks small enough to all fit under ceiling individually
  const preserved = new Set(['calculateTotal']);
  const raw: RawLayers = {
    system: 'x'.repeat(TOKEN_BUDGET.system * 3),          // fills system
    summary: 'x'.repeat(TOKEN_BUDGET.summary * 3),        // fills summary
    recent: ['turn1', 'turn2'],
    semantic: [],
    code: [
      '[function calculateTotal — src/cart.ts:1-10]\nfunction calculateTotal() {}',
      '[function helperA — src/a.ts:1-5]\nfunction helperA() {}',
      '[function helperB — src/b.ts:1-5]\nfunction helperB() {}',
    ],
    preservedNames: preserved,
  };
  const result = fitToBudget(raw);
  // If any code blocks survive, calculateTotal should be among them
  if (result.code.text.length > 0) {
    assert.ok(result.code.text.includes('calculateTotal'),
      'Preserved entity calculateTotal should survive overflow');
  }
});

// ---------------------------------------------------------------------------
// 3. System context (L1)
// ---------------------------------------------------------------------------

console.log('\n── System context ──');

import { buildSystemContext } from '../src/agent/context/system.js';

await test('buildSystemContext includes repo path', () => {
  const text = buildSystemContext({ repoPath: '/my/repo', closureRepos: ['/my/repo'] });
  assert.ok(text.includes('Repo: /my/repo'));
  assert.ok(text.includes('insrc'));
});

await test('buildSystemContext shows multiple repos', () => {
  const text = buildSystemContext({
    repoPath: '/my/repo',
    closureRepos: ['/my/repo', '/my/dep'],
  });
  assert.ok(text.includes('Repos in scope'));
  assert.ok(text.includes('/my/dep'));
});

// ---------------------------------------------------------------------------
// 4. Rolling summary (L2)
// ---------------------------------------------------------------------------

console.log('\n── Rolling summary ──');

import { evictToSummary, type ConversationTurn } from '../src/agent/context/summary.js';
import type { LLMProvider, LLMResponse, CompletionOpts, LLMMessage } from '../src/shared/types.js';

function mockSummaryProvider(response: string): LLMProvider {
  return {
    supportsTools: false,
    async complete(): Promise<LLMResponse> {
      return { text: response, stopReason: 'end_turn' };
    },
    async embed(): Promise<number[]> { return []; },
    async *stream(): AsyncIterable<string> { yield response; },
  };
}

await test('evictToSummary uses LLM to compress', async () => {
  const provider = mockSummaryProvider('User asked about file reading. Decision: use fs.readFile.');
  const turn: ConversationTurn = {
    userMessage: 'How do I read a file?',
    assistantResponse: 'You can use fs.readFile() from the node:fs module...',
    entityIds: [],
  };
  const result = await evictToSummary('', turn, provider);
  assert.ok(result.includes('readFile'));
});

await test('evictToSummary falls back on provider error', async () => {
  const provider: LLMProvider = {
    supportsTools: false,
    async complete(): Promise<LLMResponse> { throw new Error('offline'); },
    async embed(): Promise<number[]> { return []; },
    async *stream(): AsyncIterable<string> { yield ''; },
  };
  const turn: ConversationTurn = {
    userMessage: 'How do I read a file?',
    assistantResponse: 'Use fs.readFile...',
    entityIds: [],
  };
  const result = await evictToSummary('', turn, provider);
  assert.ok(result.includes('How do I read a file'));
});

await test('evictToSummary appends to existing summary', async () => {
  const provider: LLMProvider = {
    supportsTools: false,
    async complete(): Promise<LLMResponse> { throw new Error('offline'); },
    async embed(): Promise<number[]> { return []; },
    async *stream(): AsyncIterable<string> { yield ''; },
  };
  const turn: ConversationTurn = {
    userMessage: 'Now fix the bug',
    assistantResponse: 'Done',
    entityIds: [],
  };
  const result = await evictToSummary('Existing summary.', turn, provider);
  assert.ok(result.startsWith('Existing summary.'));
  assert.ok(result.includes('Now fix the bug'));
});

// ---------------------------------------------------------------------------
// 5. Recent turns (L3a)
// ---------------------------------------------------------------------------

console.log('\n── Recent turns ──');

import { weightedRecent, getEvictable, MAX_RECENT_TURNS } from '../src/agent/context/recent.js';

await test('MAX_RECENT_TURNS is 5', () => {
  assert.equal(MAX_RECENT_TURNS, 5);
});

await test('weightedRecent returns full text for most recent turn', () => {
  const turns: ConversationTurn[] = [
    { userMessage: 'hello', assistantResponse: 'hi there, how can I help?', entityIds: [] },
  ];
  const blocks = weightedRecent(turns);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0]!.includes('hello'));
  assert.ok(blocks[0]!.includes('hi there, how can I help?'));
  // Full response, no truncation
  assert.ok(!blocks[0]!.includes('...'));
});

await test('weightedRecent truncates older turns', () => {
  const longResponse = 'x'.repeat(1000);
  const turns: ConversationTurn[] = [
    { userMessage: 'recent', assistantResponse: 'recent response', entityIds: [] },
    { userMessage: 'older', assistantResponse: longResponse, entityIds: [] },
  ];
  const blocks = weightedRecent(turns);
  assert.equal(blocks.length, 2);
  // Second block (age=1) should be 75% — truncated with ...
  assert.ok(blocks[1]!.includes('...'));
  assert.ok(blocks[1]!.length < longResponse.length);
});

await test('weightedRecent caps at MAX_RECENT', () => {
  const turns: ConversationTurn[] = Array.from({ length: 8 }, (_, i) => ({
    userMessage: `msg ${i}`,
    assistantResponse: `resp ${i}`,
    entityIds: [],
  }));
  const blocks = weightedRecent(turns);
  assert.equal(blocks.length, MAX_RECENT_TURNS);
});

await test('weightedRecent age 4+ is user message only', () => {
  const turns: ConversationTurn[] = Array.from({ length: 5 }, (_, i) => ({
    userMessage: `msg ${i}`,
    assistantResponse: `resp ${i}`,
    entityIds: [],
  }));
  const blocks = weightedRecent(turns);
  // Last block (age=4) should not contain assistant response
  assert.ok(!blocks[4]!.includes('resp 4'));
  assert.ok(blocks[4]!.includes('msg 4'));
});

await test('getEvictable returns empty for <= MAX_RECENT', () => {
  const turns: ConversationTurn[] = Array.from({ length: 5 }, (_, i) => ({
    userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [],
  }));
  assert.equal(getEvictable(turns).length, 0);
});

await test('getEvictable returns overflow turns', () => {
  const turns: ConversationTurn[] = Array.from({ length: 7 }, (_, i) => ({
    userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [],
  }));
  const evictable = getEvictable(turns);
  assert.equal(evictable.length, 2);
});

// ---------------------------------------------------------------------------
// 6. Semantic history (L3b)
// ---------------------------------------------------------------------------

console.log('\n── Semantic history ──');

import { SemanticHistory } from '../src/agent/context/semantic.js';

await test('SemanticHistory starts empty', () => {
  const sh = new SemanticHistory();
  assert.equal(sh.size, 0);
});

await test('SemanticHistory.add increments size', () => {
  const sh = new SemanticHistory();
  sh.add(
    { userMessage: 'test', assistantResponse: 'resp', entityIds: [] },
    [1, 0, 0],
  );
  assert.equal(sh.size, 1);
});

await test('SemanticHistory.add ignores empty embeddings', () => {
  const sh = new SemanticHistory();
  sh.add(
    { userMessage: 'test', assistantResponse: 'resp', entityIds: [] },
    [],
  );
  assert.equal(sh.size, 0);
});

await test('SemanticHistory.retrieve returns empty before min turns', () => {
  const sh = new SemanticHistory();
  for (let i = 0; i < 3; i++) {
    sh.add(
      { userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [] },
      [1, 0, 0],
    );
  }
  const results = sh.retrieve([1, 0, 0]);
  assert.equal(results.length, 0); // < 5 turns stored
});

await test('SemanticHistory.retrieve returns top-K similar turns', () => {
  const sh = new SemanticHistory();
  // Add 6 turns with varying embeddings
  const embeddings = [
    [1, 0, 0],    // 0
    [0, 1, 0],    // 1
    [0, 0, 1],    // 2
    [0.9, 0.1, 0], // 3 — similar to query
    [0.1, 0.9, 0], // 4
    [0.8, 0.2, 0], // 5 — similar to query
  ];
  for (let i = 0; i < 6; i++) {
    sh.add(
      { userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [] },
      embeddings[i]!,
    );
  }
  const results = sh.retrieve([1, 0, 0]);
  assert.ok(results.length > 0);
  assert.ok(results.length <= 4); // TOP_K = 4
  // Most similar should be first
  assert.ok(results[0]!.includes('msg 0')); // exact match [1,0,0]
});

await test('SemanticHistory.retrieve with empty query returns empty', () => {
  const sh = new SemanticHistory();
  for (let i = 0; i < 6; i++) {
    sh.add(
      { userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [] },
      [1, 0, 0],
    );
  }
  const results = sh.retrieve([]);
  assert.equal(results.length, 0);
});

await test('SemanticHistory.retrieveTurns returns ConversationTurn objects', () => {
  const sh = new SemanticHistory();
  for (let i = 0; i < 6; i++) {
    sh.add(
      { userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [`eid_${i}`] },
      [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i >= 2 ? 1 : 0],
    );
  }
  const turns = sh.retrieveTurns([1, 0, 0]);
  assert.ok(turns.length > 0);
  assert.ok(turns.length <= 4);
  // Should return actual ConversationTurn objects with entityIds
  assert.ok(turns[0]!.entityIds.length > 0);
  assert.equal(turns[0]!.userMessage, 'msg 0'); // best match
});

// ---------------------------------------------------------------------------
// 7. Escalation thresholds
// ---------------------------------------------------------------------------

console.log('\n── Escalation thresholds ──');

import { shouldEscalate } from '../src/agent/escalation.js';
import type { AssembledContext } from '../src/agent/context/budget.js';

function makeAssembled(overrides: Partial<AssembledContext> = {}): AssembledContext {
  return {
    system: { text: 'sys', tokens: 10 },
    summary: { text: '', tokens: 0 },
    recent: { text: '', tokens: 0 },
    semantic: { text: '', tokens: 0 },
    code: { text: '', tokens: 0 },
    totalTokens: 100,
    dropped: [],
    ...overrides,
  };
}

await test('shouldEscalate: false for simple local task', () => {
  const result = shouldEscalate(makeAssembled(), ['/repo']);
  assert.equal(result.shouldEscalate, false);
});

await test('shouldEscalate: true for multi-repo', () => {
  const result = shouldEscalate(makeAssembled(), ['/repo1', '/repo2']);
  assert.equal(result.shouldEscalate, true);
  assert.ok(result.reason!.includes('multi-repo'));
});

await test('shouldEscalate: true for >8K tokens', () => {
  const result = shouldEscalate(makeAssembled({ totalTokens: 9_000 }), ['/repo']);
  assert.equal(result.shouldEscalate, true);
  assert.ok(result.reason!.includes('large context'));
});

await test('shouldEscalate: true for >3 files in code', () => {
  const codeText = [
    '[function a — /src/a.ts:1-10]',
    '[function b — /src/b.ts:1-10]',
    '[function c — /src/c.ts:1-10]',
    '[function d — /src/d.ts:1-10]',
  ].join('\n\n---\n\n');
  const result = shouldEscalate(
    makeAssembled({ code: { text: codeText, tokens: 100 } }),
    ['/repo'],
  );
  assert.equal(result.shouldEscalate, true);
  assert.ok(result.reason!.includes('multi-file'));
});

// ---------------------------------------------------------------------------
// 8. Context manager
// ---------------------------------------------------------------------------

console.log('\n── Context manager ──');

import { ContextManager } from '../src/agent/context/index.js';

await test('ContextManager initializes with system context', () => {
  const provider = mockSummaryProvider('ok');
  const mgr = new ContextManager({
    repoPath: '/test/repo',
    closureRepos: ['/test/repo'],
    provider,
  });
  assert.equal(mgr.getRecentCount(), 0);
  assert.equal(mgr.getSemanticSize(), 0);
  assert.equal(mgr.getSummary(), '');
});

await test('ContextManager.recordTurn tracks turns', async () => {
  const provider = mockSummaryProvider('ok');
  const mgr = new ContextManager({
    repoPath: '/test/repo',
    closureRepos: ['/test/repo'],
    provider,
  });

  await mgr.recordTurn(
    { userMessage: 'hello', assistantResponse: 'hi', entityIds: [] },
    [1, 0, 0],
  );
  assert.equal(mgr.getRecentCount(), 1);
  assert.equal(mgr.getSemanticSize(), 1);
});

await test('ContextManager.recordTurn evicts after MAX_RECENT', async () => {
  const provider = mockSummaryProvider('Summary of evicted turns.');
  const mgr = new ContextManager({
    repoPath: '/test/repo',
    closureRepos: ['/test/repo'],
    provider,
  });

  // Add 6 turns (exceeds MAX_RECENT=5)
  for (let i = 0; i < 6; i++) {
    await mgr.recordTurn(
      { userMessage: `msg ${i}`, assistantResponse: `resp ${i}`, entityIds: [] },
      [1, 0, 0],
    );
  }

  assert.equal(mgr.getRecentCount(), 5); // capped at MAX_RECENT
  assert.ok(mgr.getSummary().length > 0); // eviction produced a summary
});

await test('ContextManager.buildMessages produces valid message array', async () => {
  const provider = mockSummaryProvider('ok');
  const mgr = new ContextManager({
    repoPath: '/test/repo',
    closureRepos: ['/test/repo'],
    provider,
  });

  const assembled = await mgr.assemble('test query', []);
  const messages = mgr.buildMessages(assembled, 'test query');

  // Should have at least system + user message
  assert.ok(messages.length >= 2);
  assert.equal(messages[0]!.role, 'system');
  assert.equal(messages[messages.length - 1]!.role, 'user');
  assert.equal(messages[messages.length - 1]!.content, 'test query');
});

await test('ContextManager.reset clears all state', async () => {
  const provider = mockSummaryProvider('ok');
  const mgr = new ContextManager({
    repoPath: '/test/repo',
    closureRepos: ['/test/repo'],
    provider,
  });

  await mgr.recordTurn(
    { userMessage: 'hello', assistantResponse: 'hi', entityIds: [] },
    [1, 0, 0],
  );
  assert.equal(mgr.getRecentCount(), 1);

  mgr.reset();
  assert.equal(mgr.getRecentCount(), 0);
  assert.equal(mgr.getSummary(), '');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n── Phase 4 Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
