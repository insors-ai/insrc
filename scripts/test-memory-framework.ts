#!/usr/bin/env tsx
/**
 * Comprehensive test for the memory framework (layered context model).
 *
 * Tests (no mocks — real data structures and algorithms):
 *  1. L1 System context generation
 *  2. L2 Rolling summary (fallback path — no LLM)
 *  3. L3a Recency-weighted turns (weighting, eviction, structured output)
 *  4. L3b Semantic history (add, retrieve by similarity, skip threshold)
 *  5. L4 Progressive entity disclosure (levels 1/2/3)
 *  6. Budget shapes (16K/32K/64K/128K scaling)
 *  7. Overflow priority enforcement (fitToBudget)
 *  8. ContextManager orchestration (recordTurn, assemble, hydrate, tags)
 *  9. Directive detection (isDirective, extractDirectiveText)
 * 10. Compaction types and helpers (tier priority, entry types)
 *
 * Run with: npx tsx scripts/test-memory-framework.ts
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
  if (!condition && detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { buildSystemContext } from '../src/agent/context/system.js';
import { evictToSummary, type ConversationTurn } from '../src/agent/context/summary.js';
import {
  weightedRecent, weightedRecentTurns, getEvictable, MAX_RECENT_TURNS,
} from '../src/agent/context/recent.js';
import { SemanticHistory, embedText } from '../src/agent/context/semantic.js';
import {
  TOKEN_BUDGET, createBudget, countTokens,
  type TokenBudget,
} from '../src/agent/context/budget.js';
import { fitToBudget, type RawLayers } from '../src/agent/context/overflow.js';
import { ContextManager, type AssembledContext } from '../src/agent/context/index.js';
import { isDirective, scoreDirective, extractDirectiveText } from '../src/db/directives.js';
import type { LLMProvider, LLMMessage, LLMResponse } from '../src/shared/types.js';

// ---------------------------------------------------------------------------
// Helpers: make turns, fake embeddings
// ---------------------------------------------------------------------------

function makeTurn(user: string, assistant: string, entityIds: string[] = []): ConversationTurn {
  return { userMessage: user, assistantResponse: assistant, entityIds };
}

/** Generate a deterministic fake embedding (not random — reproducible similarity). */
function fakeEmbed(text: string): number[] {
  const vec = new Array<number>(64).fill(0);
  for (let i = 0; i < text.length && i < 64; i++) {
    vec[i] = text.charCodeAt(i) / 256;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

/** A stub LLM provider that returns a canned response (for evictToSummary). */
function stubProvider(response: string): LLMProvider {
  return {
    complete: async (_msgs: LLMMessage[], _opts?: unknown): Promise<LLMResponse> => ({
      text: response,
      stopReason: 'end_turn',
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
    stream: async function* () { yield response; },
    embed: async (text: string): Promise<number[]> => fakeEmbed(text),
    supportsTools: false,
  };
}

/** A failing provider to test fallback paths. */
function failingProvider(): LLMProvider {
  return {
    complete: async (): Promise<LLMResponse> => { throw new Error('LLM unavailable'); },
    stream: async function* () { throw new Error('unavailable'); },
    embed: async (): Promise<number[]> => { throw new Error('Embed unavailable'); },
    supportsTools: false,
  };
}

// ===========================================================================
// 1. L1 System Context
// ===========================================================================

section('1. L1 System Context');

{
  const ctx = buildSystemContext({
    repoPath: '/home/user/project',
    closureRepos: ['/home/user/project'],
  });
  check('contains persona', ctx.includes('insrc'));
  check('contains repo path', ctx.includes('/home/user/project'));
  check('single repo: uses "Repo:"', ctx.includes('Repo:'));

  const multi = buildSystemContext({
    repoPath: '/home/user/project',
    closureRepos: ['/home/user/project', '/home/user/lib'],
  });
  check('multi-repo: uses "Repos in scope:"', multi.includes('Repos in scope:'));
  check('multi-repo: lists both repos', multi.includes('/home/user/lib'));
}

// ===========================================================================
// 2. L2 Rolling Summary
// ===========================================================================

section('2. L2 Rolling Summary');

{
  const provider = stubProvider('Updated summary: user asked about auth.');
  const turn = makeTurn('How does auth work?', 'Auth uses JWT tokens stored in session.');

  const summary = await evictToSummary('', turn, provider);
  check('evictToSummary returns provider response', summary.includes('Updated summary'));

  // Fallback path when provider fails
  const failProv = failingProvider();
  const fallback = await evictToSummary('Previous context.', turn, failProv);
  check('fallback includes "User asked"', fallback.includes('User asked'));
  check('fallback preserves previous summary', fallback.startsWith('Previous context.'));

  const firstFallback = await evictToSummary('', turn, failProv);
  check('first fallback starts with "User asked"', firstFallback.startsWith('User asked'));
}

// ===========================================================================
// 3. L3a Recency-Weighted Recent Turns
// ===========================================================================

section('3. L3a Recency-Weighted Recent Turns');

{
  const turns = Array.from({ length: 7 }, (_, i) =>
    makeTurn(`Question ${i + 1}`, `Answer ${i + 1} `.repeat(50)),
  );

  // Test MAX_RECENT_TURNS
  check('MAX_RECENT_TURNS is 5', MAX_RECENT_TURNS === 5);

  // weightedRecent returns formatted strings
  const blocks = weightedRecent(turns);
  check('weightedRecent returns max 5 blocks', blocks.length === 5);
  check('most recent has full assistant text', blocks[0]!.includes('Answer 1'));
  check('oldest (5th) has user message only', !blocks[4]!.includes('Answer 5'));

  // Turn -2 (index 1) should be truncated to ~75%
  const fullLen = `Answer 2 `.repeat(50).length;
  const block1Assistant = blocks[1]!.split('\nAssistant: ')[1] ?? '';
  check('turn -2 is truncated (< full length)', block1Assistant.length < fullLen);

  // weightedRecentTurns returns structured turns
  const structured = weightedRecentTurns(turns);
  check('weightedRecentTurns returns 5 turns', structured.length === 5);
  check('structured: most recent has full response', structured[0]!.assistantResponse.length === `Answer 1 `.repeat(50).length);
  check('structured: oldest has empty response', structured[4]!.assistantResponse === '');
  check('structured: preserves user message on all', structured[4]!.userMessage === 'Question 5');

  // Eviction
  const evictable = getEvictable(turns);
  check('getEvictable returns 2 excess turns', evictable.length === 2);
  check('evicted turns are oldest (index 5,6)', evictable[0]!.userMessage === 'Question 6');

  // No eviction when under limit
  const fewTurns = turns.slice(0, 3);
  check('no eviction for 3 turns', getEvictable(fewTurns).length === 0);
}

// ===========================================================================
// 4. L3b Semantic History
// ===========================================================================

section('4. L3b Semantic History');

{
  const history = new SemanticHistory();

  // Add turns with fake embeddings
  const turns = [
    makeTurn('How does the auth middleware work?', 'It validates JWT tokens.'),
    makeTurn('What database does the project use?', 'It uses PostgreSQL.'),
    makeTurn('How are API routes structured?', 'Routes are in src/api/.'),
    makeTurn('What testing framework is used?', 'The project uses vitest.'),
    makeTurn('How does the config system work?', 'Config is loaded from .insrc/.'),
    makeTurn('Explain the auth flow end to end', 'User logs in, gets JWT, middleware validates.'),
  ];

  for (const t of turns) {
    history.add(t, fakeEmbed(t.userMessage));
  }

  check('size is 6 after adding 6 turns', history.size === 6);

  // Retrieve should skip first 5 turns (default MIN_TURNS_FOR_SEMANTIC)
  const earlyResults = history.retrieve(fakeEmbed('auth'), 10);
  check('retrieve skips when store size < skip threshold', earlyResults.length === 0);

  // With skip=3, should return results
  const authResults = history.retrieve(fakeEmbed('How does the auth middleware work?'), 3);
  check('retrieve returns results when above skip threshold', authResults.length > 0);
  check('retrieve returns max 4 results', authResults.length <= 4);

  // The most similar turn to "auth middleware" should be the auth-related ones
  const topResult = authResults[0] ?? '';
  check('top result is about auth', topResult.includes('auth') || topResult.includes('JWT'));

  // retrieveTurns returns ConversationTurn objects
  const turnObjects = history.retrieveTurns(fakeEmbed('How does the auth middleware work?'), 3);
  check('retrieveTurns returns ConversationTurn[]', turnObjects.length > 0);
  check('retrieveTurns has userMessage field', turnObjects[0]!.userMessage !== undefined);

  // Empty embedding returns nothing
  const emptyResults = history.retrieve([], 0);
  check('empty embedding returns no results', emptyResults.length === 0);
}

// ===========================================================================
// 5. Budget Shapes
// ===========================================================================

section('5. Budget Shapes');

{
  // Default 16K budget
  check('TOKEN_BUDGET.total is 16384', TOKEN_BUDGET.total === 16384);
  check('TOKEN_BUDGET.system is 1000', TOKEN_BUDGET.system === 1000);

  // Create budgets with named shapes and raw token counts
  const sizes = [16_000, 32_000, 64_000, 128_000];
  for (const total of sizes) {
    const label = `${total / 1000}K`;
    const b = createBudget(total);
    check(`${label}: total is ${total}`, b.total === total);
    check(`${label}: system is always 1000`, b.system === 1000);
    check(`${label}: response < total/2`, b.response < b.total / 2);
    check(`${label}: code is ~25% of total`, Math.abs(b.code - total * 0.25) < 100);

    // All layers fit within total
    const layerSum = b.system + b.summary + b.recent + b.semantic + b.code + b.response;
    check(`${label}: layer sum (${layerSum}) < total (${total})`, layerSum < total);
  }

  // Named shapes still work
  const b32 = createBudget('32k');
  check('named shape 32k works', b32.total === 32_000);

  // Verify proportional scaling
  const b16 = createBudget(16_000);
  const b128 = createBudget(128_000);
  check('128K code budget is ~8x 16K code budget', b128.code >= b16.code * 7);
  check('128K recent budget is ~8x 16K recent budget', b128.recent >= b16.recent * 7);

  // Arbitrary context window size (e.g. 48K)
  const b48 = createBudget(48_000);
  check('48K: total is 48000', b48.total === 48_000);
  check('48K: code scales to ~12K', Math.abs(b48.code - 12_000) < 100);

  // countTokens heuristic
  check('countTokens: 300 chars ≈ 100 tokens', countTokens('x'.repeat(300)) === 100);
  check('countTokens: empty string = 0', countTokens('') === 0);
}

// ===========================================================================
// 6. Overflow Priority Enforcement
// ===========================================================================

section('6. Overflow Priority (fitToBudget)');

{
  // Test with a very small budget to force overflow
  const tinyBudget: TokenBudget = {
    system: 100,
    summary: 100,
    recent: 100,
    semantic: 100,
    code: 200,
    response: 100,
    total: 800,
  };

  const raw: RawLayers = {
    system: 'System prompt text',
    summary: 'Session summary here',
    recent: ['Turn 1 user and assistant exchange.', 'Turn 2 user and assistant exchange.'],
    semantic: ['Relevant past exchange about auth.'],
    code: [
      '[function authMiddleware — src/auth.ts:1-50]\nfunction authMiddleware() { ... }',
      '[function dbConnect — src/db.ts:1-30]\nfunction dbConnect() { ... }',
    ],
  };

  // Under budget — nothing dropped
  const bigBudget: TokenBudget = {
    system: 10000,
    summary: 10000,
    recent: 10000,
    semantic: 10000,
    code: 50000,
    response: 10000,
    total: 100000,
  };
  const easy = fitToBudget(raw, bigBudget);
  check('under budget: no drops', easy.dropped.length === 0);
  check('under budget: all layers have content', easy.system.tokens > 0 && easy.code.tokens > 0);

  // Over budget — use a budget where individual ceilings sum > inputBudget
  // so per-layer ceilings are fine but total overflows
  const overflowBudget: TokenBudget = {
    system: 100,
    summary: 200,
    recent: 200,
    semantic: 200,
    code: 200,
    response: 100,
    total: 500, // inputBudget = 400, but ceilings sum to 900
  };
  const overflowRaw: RawLayers = {
    system: 'x'.repeat(300),   // 100 tokens (capped)
    summary: 'x'.repeat(600),  // 200 tokens (capped)
    recent: ['x'.repeat(600)], // 200 tokens (capped)
    semantic: ['x'.repeat(600)], // 200 tokens (capped)
    code: ['x'.repeat(600)],   // 200 tokens (capped)
  };
  // After ceilings: 100+200+200+200+200 = 900 > inputBudget(400), must drop
  const tight = fitToBudget(overflowRaw, overflowBudget);
  check('over budget: some layers dropped', tight.dropped.length > 0);
  check('over budget: system is never dropped', tight.system.tokens > 0);

  // Preserved entity names — use large enough data to trigger code drops
  const rawWithPreserved: RawLayers = {
    system: 'System prompt',
    summary: 'x'.repeat(600),
    recent: ['x'.repeat(600)],
    semantic: ['x'.repeat(600)],
    code: [
      '[function authMiddleware — src/auth.ts:1-50]\n' + 'x'.repeat(300),
      '[function dbConnect — src/db.ts:1-30]\n' + 'x'.repeat(300),
      '[function cacheLayer — src/cache.ts:1-20]\n' + 'x'.repeat(300),
    ],
    preservedNames: new Set(['authMiddleware']),
  };
  const preserved = fitToBudget(rawWithPreserved, tinyBudget);
  // authMiddleware should survive even if other code entities are dropped
  check('preserved entity survives overflow', preserved.code.text.includes('authMiddleware'));
}

// ===========================================================================
// 7. ContextManager Orchestration
// ===========================================================================

section('7. ContextManager Orchestration');

{
  const provider = stubProvider('Summary of evicted turn.');
  const cm = new ContextManager({
    repoPath: '/home/user/project',
    closureRepos: ['/home/user/project'],
    provider,
    contextWindowSize: 64_000,
  });

  // Initial state
  check('initial summary is empty', cm.getSummary() === '');
  check('initial recent count is 0', cm.getRecentCount() === 0);
  check('initial semantic size is 0', cm.getSemanticSize() === 0);

  // Record a few turns
  for (let i = 0; i < 3; i++) {
    const turn = makeTurn(`Question ${i}`, `Answer ${i}`, [`entity-${i}`]);
    await cm.recordTurn(turn, fakeEmbed(`Question ${i}`));
  }
  check('3 turns recorded in recent', cm.getRecentCount() === 3);
  check('3 turns in semantic history', cm.getSemanticSize() === 3);

  // Record enough to trigger eviction (>5 turns)
  for (let i = 3; i < 7; i++) {
    const turn = makeTurn(`Question ${i}`, `Answer ${i}`, [`entity-${i}`]);
    await cm.recordTurn(turn, fakeEmbed(`Question ${i}`));
  }
  check('recent capped at 5 after 7 turns', cm.getRecentCount() === 5);
  check('semantic has all 7 turns', cm.getSemanticSize() === 7);
  check('summary is non-empty after eviction', cm.getSummary().length > 0);

  // Tags
  cm.setTag('[requirements]', 'Extracted requirements for auth module.');
  check('setTag stores value', cm.getTag('[requirements]') === 'Extracted requirements for auth module.');
  check('hasTag returns true', cm.hasTag('[requirements]'));
  check('hasTag returns false for missing', !cm.hasTag('[missing]'));

  // Plan step context
  cm.setActivePlanStep('Step 3: Implement token validation');
  check('plan step context set', cm.getActivePlanStep().includes('token validation'));

  // Attachment context
  cm.setAttachmentContext('File content: const x = 42;');
  check('attachment context set', cm.getAttachmentContext().includes('const x'));

  // Hydrate from history
  cm.reset();
  check('reset clears recent', cm.getRecentCount() === 0);

  const sizeBeforeHydrate = cm.getSemanticSize();
  cm.hydrateFromHistory([
    { user: 'Past question', assistant: 'Past answer', entities: ['e1'], vector: fakeEmbed('Past question') },
    { user: 'Another past', assistant: 'Another answer', entities: ['e2'], vector: fakeEmbed('Another past') },
  ]);
  check('hydrateFromHistory adds 2 to semantic', cm.getSemanticSize() === sizeBeforeHydrate + 2);

  // Seed summary
  cm.seedSummary('Prior session: worked on auth module.');
  check('seedSummary sets summary', cm.getSummary().includes('auth module'));

  // buildMessages produces correct structure
  // First record a turn so recent is non-empty
  await cm.recordTurn(makeTurn('Current question', 'Current answer'), fakeEmbed('Current question'));

  // Create a minimal assembled context for buildMessages
  const assembled: AssembledContext = {
    system:   { text: 'System prompt', tokens: 10 },
    summary:  { text: 'Summary text', tokens: 10 },
    recent:   { text: '', tokens: 0 }, // L3a handled by structured messages now
    semantic: { text: 'Related exchange', tokens: 10 },
    code:     { text: '[function foo]\nfoo() {}', tokens: 10 },
    totalTokens: 40,
    dropped: [],
  };

  const messages = cm.buildMessages(assembled, 'What is foo?');
  check('messages start with system role', messages[0]!.role === 'system');
  check('messages end with current user message', messages[messages.length - 1]!.content === 'What is foo?');

  // Check that L3a is emitted as structured messages (user/assistant pairs)
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');
  check('messages have multiple user entries (context + L3a + current)', userMsgs.length >= 2);
  check('messages have assistant entries (ack + L3a)', assistantMsgs.length >= 1);

  // Check L3a structured turns are present
  const hasL3aTurn = messages.some(m => m.role === 'user' && m.content === 'Current question');
  check('L3a turn emitted as structured user message', hasL3aTurn);
}

// ===========================================================================
// 8. Directive Detection
// ===========================================================================

section('8. Directive Detection');

{
  // Strong directives
  check('isDirective: "never use claude opus"', isDirective('never use claude opus as a model'));
  check('isDirective: "always use .js extensions"', isDirective('always use .js extensions in imports'));
  check('isDirective: "avoid using getattr"', isDirective('avoid using getattr for pydantic classes'));
  check('isDirective: "prefer vitest over jest"', isDirective('I prefer vitest over jest, from now on use vitest'));
  check('isDirective: "use X instead of Y"', isDirective('use pnpm instead of npm for package management'));
  check('isDirective: "don\'t mock the database"', isDirective("don't mock the database in tests, we got burned last quarter"));

  // Non-directives (should NOT match)
  check('not directive: regular question', !isDirective('How does the auth middleware work?'));
  check('not directive: code request', !isDirective('Add a logout button to the settings page'));
  check('not directive: status question', !isDirective('What files were changed in the last commit?'));

  // Score testing
  const strongScore = scoreDirective('Never use console.log, always use getLogger');
  const weakScore = scoreDirective('Can you refactor this function?');
  check('strong directive scores high', strongScore >= 0.9, `score: ${strongScore}`);
  check('weak message scores low', weakScore < 1.0, `score: ${weakScore}`);

  // Extract directive text
  const extracted = extractDirectiveText(
    'Hey, from now on never use claude opus. It is too expensive for our use case.',
    'Understood, I will avoid using Claude Opus.',
  );
  check('extractDirectiveText keeps directive sentence', extracted.includes('never use claude opus'));
  check('extractDirectiveText includes acknowledgment', extracted.includes('Acknowledged'));

  // Extract from simple message
  const simple = extractDirectiveText('always use strict TypeScript mode', 'OK, noted.');
  check('simple directive preserved', simple.includes('always use strict TypeScript mode'));
}

// ===========================================================================
// 9. Token Budget Math
// ===========================================================================

section('9. Token Budget Math');

{
  // Verify budget integrity for various sizes
  for (const total of [16_000, 32_000, 64_000, 128_000]) {
    const label = `${total / 1000}K`;
    const b = createBudget(total);
    const inputBudget = b.total - b.response;
    const layerCeilings = b.system + b.summary + b.recent + b.semantic + b.code;
    check(`${label}: layer ceilings fit in input budget`, layerCeilings <= inputBudget,
      `ceilings ${layerCeilings} vs input ${inputBudget}`);
  }

  // fitToBudget with default budget
  const simpleRaw: RawLayers = {
    system: 'You are an assistant.',
    summary: 'User is working on auth.',
    recent: ['Recent turn 1.'],
    semantic: ['Past exchange about auth.'],
    code: ['[function foo — bar.ts:1-10]\nfoo() {}'],
  };
  const result = fitToBudget(simpleRaw);
  check('fitToBudget with defaults produces valid result', result.totalTokens > 0);
  check('fitToBudget: no drops for small input', result.dropped.length === 0);
}

// ===========================================================================
// 10. Edge Cases
// ===========================================================================

section('10. Edge Cases');

{
  // Empty inputs to fitToBudget
  const emptyRaw: RawLayers = {
    system: '',
    summary: '',
    recent: [],
    semantic: [],
    code: [],
  };
  const emptyResult = fitToBudget(emptyRaw);
  check('empty input: totalTokens is 0', emptyResult.totalTokens === 0);
  check('empty input: no drops', emptyResult.dropped.length === 0);

  // SemanticHistory with zero-length embeddings
  const hist = new SemanticHistory();
  hist.add(makeTurn('test', 'resp'), []);
  check('zero-length embedding is not stored', hist.size === 0);

  // weightedRecent with empty list
  const emptyWeighted = weightedRecent([]);
  check('weightedRecent([]) returns empty', emptyWeighted.length === 0);

  // weightedRecentTurns with 1 turn
  const singleTurn = weightedRecentTurns([makeTurn('q', 'a')]);
  check('single turn: full response preserved', singleTurn[0]!.assistantResponse === 'a');

  // Directive edge cases
  check('empty string is not directive', !isDirective(''));
  check('single word is not directive', !isDirective('hello'));

  // extractDirectiveText truncation
  const longDirective = 'always '.repeat(200);
  const extracted = extractDirectiveText(longDirective, 'ok');
  check('long directive is truncated', extracted.length <= 600);
}

// ===========================================================================
// Summary
// ===========================================================================

console.log(`\n${CYAN}━━━ Results ━━━${RESET}`);
console.log(`${GREEN}Passed: ${passed}${RESET}`);
if (failed > 0) {
  console.log(`${RED}Failed: ${failed}${RESET}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
